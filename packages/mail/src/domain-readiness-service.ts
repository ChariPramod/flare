import { GetEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { z } from 'zod';
import { toJson } from '@flare/db';
import type { Sql } from '@flare/db';
import { evidenceFresh, normalizeDomain } from './dmarc.js';
import { checkSesIdentity, evaluateSendingReadiness, providerEvidenceSchema } from './readiness.js';
import type { ReadinessDomain } from './readiness.js';
import { parseNamedTransports, transportInstanceIdentity } from './routes.js';
import type { NamedTransportConfig, RoutedTransport } from './routes.js';
import { lockSendingPolicy, policyAudit, SendingPolicyError } from './sending-policy.js';
import type { OperatorActor } from './sending-policy.js';

export const domainReadinessRevokeSchema = z
  .object({
    expected_revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export const domainReadinessUpdateSchema = domainReadinessRevokeSchema.extend({
  evidence: providerEvidenceSchema,
});
function fail(status: number, code: string, message: string): never {
  throw new SendingPolicyError(status, code, message);
}
function domainValue(row: Record<string, unknown>): ReadinessDomain {
  return {
    name: String(row.name),
    status: String(row.status),
    sending: row.sending === true,
    checked_at: row.checked_at,
    records: row.records,
    dmarc_evidence: row.dmarc_evidence,
  };
}
/** Uses named credentials, never the host's ambient AWS identity. */
export async function probeNamedSesIdentity(
  config: Extract<NamedTransportConfig, { kind: 'ses' }>,
  name: string,
) {
  const secret = (reference: string) => {
    const value = process.env[reference];
    if (!value)
      fail(503, 'transport_configuration_unavailable', 'Named SES credentials are unavailable');
    return value;
  };
  const client = new SESv2Client({
    region: config.region,
    maxAttempts: 1,
    credentials: {
      accessKeyId: secret(config.access_key_id_env),
      secretAccessKey: secret(config.secret_access_key_env),
      ...(config.session_token_env ? { sessionToken: secret(config.session_token_env) } : {}),
    },
  });
  try {
    return await checkSesIdentity(name, config.region, (identity) =>
      client.send(new GetEmailIdentityCommand({ EmailIdentity: identity }), {
        abortSignal: AbortSignal.timeout(5000),
      }),
    );
  } finally {
    client.destroy();
  }
}
export async function listDomainReadiness(
  sql: Sql,
  orgId: string,
  domainId: string,
  transports: RoutedTransport[],
) {
  const [domain] =
    await sql`select d.*,e.name as environment_name from domains d join environments e on e.id=d.environment_id and e.org_id=d.org_id where d.org_id=${orgId} and d.id=${domainId}`;
  if (!domain) fail(404, 'domain_not_found', 'Domain not found');
  const [policy] = await sql`select revision from sending_policies where org_id=${orgId}`;
  const rows =
    await sql`select transport_instance,evidence,checked_at,revoked_at,config_fingerprint from domain_transport_readiness where org_id=${orgId} and domain_id=${domainId} order by transport_instance`;
  const ids = [
    ...new Set([
      ...rows.map((row) => String(row.transport_instance)),
      ...transports.flatMap((adapter) =>
        adapter.instance && !adapter.sandbox ? [adapter.instance.id] : [],
      ),
    ]),
  ].sort();
  return {
    domain: {
      id: domain.id,
      name: domain.name,
      environment_id: domain.environment_id,
      environment: domain.environment_name,
    },
    policy_revision: Number(policy?.revision ?? 0),
    evidence: ids.map((id) => {
      const row = rows.find((item) => item.transport_instance === id);
      const adapter = transports.find((item) => item.instance?.id === id && !item.sandbox);
      // Always expose the complete production gate, even while preparing a Development domain.
      const readiness = evaluateSendingReadiness(domainValue(domain), {
        production: true,
        transportInstance: id,
        provider: adapter?.name ?? 'unknown',
        evidence: row?.evidence,
        revokedAt: row?.revoked_at,
      });
      const blockers = [...readiness.blockers];
      if (!adapter) blockers.push('transport_unavailable');
      else if (row && row.config_fingerprint !== adapter.instance!.config_fingerprint)
        blockers.push('transport_configuration_changed');
      return {
        transport_instance: id,
        instance: adapter?.instance ?? null,
        evidence: row?.evidence ?? null,
        checked_at: row?.checked_at ?? null,
        revoked_at: row?.revoked_at ?? null,
        config_fingerprint: row?.config_fingerprint ?? null,
        readiness: { ...readiness, blockers: [...new Set(blockers)], ready: blockers.length === 0 },
      };
    }),
  };
}
export async function updateDomainReadiness(
  sql: Sql,
  actor: OperatorActor,
  orgId: string,
  domainId: string,
  value: unknown,
  transports: RoutedTransport[],
  probe: typeof probeNamedSesIdentity = probeNamedSesIdentity,
) {
  const input = domainReadinessUpdateSchema.parse(value);
  if (input.evidence.ses !== undefined)
    fail(
      422,
      'provider_probe_required',
      'SES configuration evidence must come from the provider probe',
    );
  if (!evidenceFresh(input.evidence.checked_at))
    fail(422, 'evidence_stale', 'Received-header evidence must be fresh and not future dated');
  const matches = transports.filter(
    (adapter) => adapter.instance?.id === input.evidence.transport_instance && !adapter.sandbox,
  );
  const adapter = matches[0];
  if (matches.length !== 1 || !adapter?.instance)
    fail(422, 'transport_unavailable', 'Evidence requires one configured named real transport');
  const named = parseNamedTransports(process.env.MAIL_TRANSPORTS ?? '[]').find(
    (item) => item.id === adapter.instance!.id,
  );
  if (
    !named ||
    transportInstanceIdentity(named).config_fingerprint !== adapter.instance.config_fingerprint
  )
    fail(
      409,
      'transport_configuration_changed',
      'Transport configuration changed; refresh before recording evidence',
    );
  await sql.begin(async (tx) => {
    await actor.authorize(tx);
    await lockSendingPolicy(tx, orgId);
    const [policy] =
      await tx`select revision from sending_policies where org_id=${orgId} for update`;
    if (!policy) fail(404, 'organization_not_found', 'Organization not found');
    if (Number(policy.revision) !== input.expected_revision)
      fail(
        409,
        'policy_revision_conflict',
        'Sending policy changed; refresh before recording evidence',
      );
    const [domain] =
      await tx`select * from domains where org_id=${orgId} and id=${domainId} for update`;
    if (!domain) fail(404, 'domain_not_found', 'Domain not found');
    if (input.evidence.header_from_domain !== normalizeDomain(String(domain.name)))
      fail(
        422,
        'sender_evidence_mismatch',
        'Received-header From domain must exactly match the registered domain',
      );
    let evidence = input.evidence;
    if (named.kind === 'ses') {
      const result = await probe(named, String(domain.name));
      if (result.status === 'temporary_failure')
        fail(
          503,
          'provider_probe_unavailable',
          'SES identity verification is temporarily unavailable',
        );
      evidence = { ...input.evidence, ...(result.evidence ? { ses: result.evidence } : {}) };
    }
    const [before] =
      await tx`select * from domain_transport_readiness where org_id=${orgId} and domain_id=${domainId} and transport_instance=${named.id}`;
    const [after] =
      await tx`insert into domain_transport_readiness(org_id,environment_id,domain_id,transport_instance,evidence,checked_at,revoked_at,actor_id,config_fingerprint) values(${orgId},${domain.environment_id},${domainId},${named.id},${tx.json(toJson(evidence))},${new Date(evidence.checked_at)},null,${actor.actorId},${adapter.instance!.config_fingerprint}) on conflict(org_id,environment_id,domain_id,transport_instance) do update set evidence=excluded.evidence,checked_at=excluded.checked_at,revoked_at=null,actor_id=excluded.actor_id,config_fingerprint=excluded.config_fingerprint,provider_check_after=now() returning *`;
    await policyAudit(tx, orgId, actor.actorId, 'operator.domain_readiness.updated', {
      domain_id: domainId,
      transport_instance: named.id,
      session_id: actor.sessionId,
      reason: input.reason,
      proof_reference: evidence.proof_reference,
      config_fingerprint: adapter.instance!.config_fingerprint,
      before: before ?? null,
      after,
    });
    await tx`update sending_policies set revision=revision+1,updated_at=now() where org_id=${orgId}`;
    await tx`update messages set next_attempt_at=now() where org_id=${orgId} and domain_id=${domainId} and status='held' and claim_id is null`;
    await actor.authorize(tx);
  });
  return listDomainReadiness(sql, orgId, domainId, transports);
}
export async function revokeDomainReadiness(
  sql: Sql,
  actor: OperatorActor,
  orgId: string,
  domainId: string,
  instanceId: string,
  value: unknown,
  transports: RoutedTransport[],
) {
  const input = domainReadinessRevokeSchema.parse(value);
  await sql.begin(async (tx) => {
    await actor.authorize(tx);
    await lockSendingPolicy(tx, orgId);
    const [policy] =
      await tx`select revision from sending_policies where org_id=${orgId} for update`;
    if (!policy) fail(404, 'organization_not_found', 'Organization not found');
    if (Number(policy.revision) !== input.expected_revision)
      fail(
        409,
        'policy_revision_conflict',
        'Sending policy changed; refresh before revoking evidence',
      );
    const [domain] =
      await tx`select id from domains where org_id=${orgId} and id=${domainId} for update`;
    if (!domain) fail(404, 'domain_not_found', 'Domain not found');
    const [before] =
      await tx`select * from domain_transport_readiness where org_id=${orgId} and domain_id=${domainId} and transport_instance=${instanceId}`;
    if (!before) fail(404, 'evidence_not_found', 'Transport evidence not found');
    const [after] =
      await tx`update domain_transport_readiness set revoked_at=coalesce(revoked_at,now()),actor_id=${actor.actorId} where org_id=${orgId} and domain_id=${domainId} and transport_instance=${instanceId} returning *`;
    await policyAudit(tx, orgId, actor.actorId, 'operator.domain_readiness.revoked', {
      domain_id: domainId,
      transport_instance: instanceId,
      session_id: actor.sessionId,
      reason: input.reason,
      before,
      after,
    });
    await tx`update sending_policies set revision=revision+1,updated_at=now() where org_id=${orgId}`;
    await tx`update messages set next_attempt_at=now() where org_id=${orgId} and domain_id=${domainId} and status='held' and claim_id is null`;
    await actor.authorize(tx);
  });
  return listDomainReadiness(sql, orgId, domainId, transports);
}
