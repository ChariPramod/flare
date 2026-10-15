import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { GetEmailIdentityCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import {
  listDomainReadiness,
  revokeDomainReadiness,
  updateDomainReadiness,
} from './domain-readiness-service.js';
import { transportInstanceIdentity } from './routes.js';
import type { NamedTransportConfig, RoutedTransport } from './routes.js';
import type { OperatorActor } from './sending-policy.js';

const orgId = randomUUID(),
  environmentId = randomUUID(),
  domainId = randomUUID(),
  otherDomainId = randomUUID(),
  otherOrgId = randomUUID(),
  otherEnvironmentId = randomUUID();
const actor: OperatorActor = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  authorize: async () => undefined,
};
const config: NamedTransportConfig = {
  id: 'ses-customer',
  kind: 'ses',
  server_id: 'account-fixture',
  pool_id: 'transactional-customer',
  credential_version: 'v1',
  region: 'us-west-2',
  configuration_set: 'transactional-customer',
  access_key_id_env: 'SES_TEST_ACCESS',
  secret_access_key_env: 'SES_TEST_SECRET',
  session_token_env: 'SES_TEST_SESSION',
  sns_topic_arn: 'arn:aws:sns:us-west-2:123456789012:fixture',
};
const environment = {
  FLARE_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  SES_TEST_ACCESS: 'fixture-access',
  SES_TEST_SECRET: 'fixture-secret',
  SES_TEST_SESSION: 'fixture-session',
};
const transport: RoutedTransport = {
  name: 'ses',
  instance: transportInstanceIdentity(config, environment),
  send: vi.fn(),
  supportsRequiredTls: async () => true,
};
const reason = 'Reviewed authenticated received headers from owned receiver';
const input = (revision = 0) => ({
  expected_revision: revision,
  reason,
  evidence: {
    kind: 'received_headers',
    provenance: 'operator_attested_receiver_headers',
    transport_instance: config.id,
    proof_reference: 'evidence/private-test-message',
    checked_at: new Date(Date.now() - 1000).toISOString(),
    header_from_domain: 'example.com',
    dkim_domain: 'example.com',
    dkim_pass: true,
    mail_from_domain: 'bounce.example.com',
    spf_pass: true,
    dmarc_pass: true,
  },
});
const identity = () => ({
  VerifiedForSendingStatus: true,
  MailFromAttributes: {
    MailFromDomain: 'bounce.example.com',
    MailFromDomainStatus: 'SUCCESS',
    BehaviorOnMxFailure: 'REJECT_MESSAGE',
  },
});
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
  await sql`insert into organizations(id,name,slug) values(${orgId},'Readiness test','readiness-test'),(${otherOrgId},'Other readiness test','other-readiness-test')`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Production'),(${otherEnvironmentId},${otherOrgId},'Production')`;
  await sql`insert into users(id,email,name) values(${actor.actorId},'operator@example.test','Evidence operator')`;
  for (const [id, org, env, name] of [
    [domainId, orgId, environmentId, 'example.com'],
    [otherDomainId, otherOrgId, otherEnvironmentId, 'other.example.com'],
  ])
    await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,checked_at,records,dmarc_evidence) values(${id!},${org!},${env!},${name!},'verified','fixture','fixture','fixture',now(),${sql.json([{ purpose: 'dkim', status: 'verified' }])},${sql.json({ status: 'verified', record_domain: name, checked_at: new Date().toISOString(), inherited: false, policy: 'reject', adkim: 'r', aspf: 'r' })})`;
}, 30000);
beforeEach(async () => {
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([config]));
  await sql`truncate domain_transport_readiness,audit_logs,messages cascade`;
  await sql`update sending_policies set revision=0`;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
it('probes SES with the named account and region, persists fingerprint, audits and wakes only its held domain', async () => {
  const send = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  const heldId = randomUUID(),
    foreignId = randomUUID();
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status,next_attempt_at) values(${heldId},${orgId},${environmentId},${domainId},'{}','sender@example.com','held',now()+interval '1 hour'),(${foreignId},${otherOrgId},${otherEnvironmentId},${otherDomainId},'{}','sender@other.example.com','held',now()+interval '1 hour')`;
  const result = await updateDomainReadiness(sql, actor, orgId, domainId, input(), [transport]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetEmailIdentityCommand);
  expect((send.mock.calls[0]?.[0] as GetEmailIdentityCommand).input).toEqual({
    EmailIdentity: 'example.com',
  });
  const client = send.mock.contexts[0] as SESv2Client;
  expect(await client.config.region()).toBe('us-west-2');
  expect(await client.config.credentials()).toMatchObject({
    accessKeyId: environment.SES_TEST_ACCESS,
    secretAccessKey: environment.SES_TEST_SECRET,
    sessionToken: environment.SES_TEST_SESSION,
  });
  expect(result.policy_revision).toBe(1);
  expect(result.evidence[0]?.readiness.ready).toBe(true);
  expect(result.evidence[0]?.config_fingerprint).toBe(transport.instance!.config_fingerprint);
  expect(result.evidence[0]?.evidence).toMatchObject({
    ses: { identity_verified: true, behavior_on_mx_failure: 'REJECT_MESSAGE' },
  });
  const [audit] =
    await sql`select metadata from audit_logs where action='operator.domain_readiness.updated'`;
  expect(audit!.metadata).toMatchObject({
    proof_reference: input().evidence.proof_reference,
    config_fingerprint: transport.instance!.config_fingerprint,
    before: null,
    after: { transport_instance: config.id },
  });
  expect(JSON.stringify(result)).not.toContain(environment.SES_TEST_SECRET);
  expect(
    (await sql`select next_attempt_at<=now() as due from messages where id=${heldId}`)[0]?.due,
  ).toBe(true);
  expect(
    (await sql`select next_attempt_at>now() as future from messages where id=${foreignId}`)[0]
      ?.future,
  ).toBe(true);
});
it('rejects submitted SES claims, wrong header domain, stale attestations and stale policy revisions before probing', async () => {
  const send = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  await expect(
    updateDomainReadiness(
      sql,
      actor,
      orgId,
      domainId,
      {
        ...input(),
        evidence: {
          ...input().evidence,
          ses: {
            identity_verified: true,
            mail_from_domain: 'bounce.example.com',
            status: 'SUCCESS',
            behavior_on_mx_failure: 'REJECT_MESSAGE',
            checked_at: new Date().toISOString(),
          },
        },
      },
      [transport],
    ),
  ).rejects.toMatchObject({ code: 'provider_probe_required' });
  await expect(
    updateDomainReadiness(
      sql,
      actor,
      orgId,
      domainId,
      { ...input(), evidence: { ...input().evidence, header_from_domain: 'other.example.com' } },
      [transport],
    ),
  ).rejects.toMatchObject({ code: 'sender_evidence_mismatch' });
  for (const when of [Date.now() + 60000, Date.now() - 86400001])
    await expect(
      updateDomainReadiness(
        sql,
        actor,
        orgId,
        domainId,
        { ...input(), evidence: { ...input().evidence, checked_at: new Date(when).toISOString() } },
        [transport],
      ),
    ).rejects.toMatchObject({ code: 'evidence_stale' });
  await expect(
    updateDomainReadiness(sql, actor, orgId, domainId, input(99), [transport]),
  ).rejects.toMatchObject({ code: 'policy_revision_conflict' });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from domain_transport_readiness`).toHaveLength(0);
});
it('rechecks operator authorization and organization/domain ownership before the provider probe', async () => {
  const send = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  await expect(
    updateDomainReadiness(
      sql,
      {
        ...actor,
        authorize: async () => {
          throw new Error('MFA required');
        },
      },
      orgId,
      domainId,
      input(),
      [transport],
    ),
  ).rejects.toThrow('MFA required');
  await expect(
    updateDomainReadiness(sql, actor, otherOrgId, domainId, input(), [transport]),
  ).rejects.toMatchObject({ code: 'domain_not_found' });
  expect(send).not.toHaveBeenCalled();
  expect(await sql`select * from audit_logs`).toHaveLength(0);
});
it('fails closed on SES errors without changing previous evidence, revision or audit', async () => {
  const send = vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  await updateDomainReadiness(sql, actor, orgId, domainId, input(), [transport]);
  const before = await listDomainReadiness(sql, orgId, domainId, [transport]);
  send.mockRejectedValue(new Error('Provider error with confidential details'));
  await expect(
    updateDomainReadiness(sql, actor, orgId, domainId, input(1), [transport]),
  ).rejects.toMatchObject({ status: 503, code: 'provider_probe_unavailable' });
  expect(await listDomainReadiness(sql, orgId, domainId, [transport])).toEqual(before);
  expect(await sql`select * from audit_logs`).toHaveLength(1);
});
it('stores negative actual SES configuration as nonready instead of accepting operator optimism', async () => {
  vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue({
    ...identity(),
    MailFromAttributes: {
      ...identity().MailFromAttributes,
      BehaviorOnMxFailure: 'USE_DEFAULT_VALUE',
    },
  } as never);
  const result = await updateDomainReadiness(sql, actor, orgId, domainId, input(), [transport]);
  expect(result.evidence[0]?.readiness).toMatchObject({
    ready: false,
    blockers: expect.arrayContaining(['ses_mail_from_unverified']),
  });
  expect(result.evidence[0]?.evidence).toMatchObject({
    ses: { behavior_on_mx_failure: 'USE_DEFAULT_VALUE' },
  });
});
it('revokes deleted instances with a current revision and keeps tenant read isolation', async () => {
  vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  await updateDomainReadiness(sql, actor, orgId, domainId, input(), [transport]);
  await expect(
    revokeDomainReadiness(
      sql,
      actor,
      orgId,
      domainId,
      config.id,
      { expected_revision: 0, reason },
      [],
    ),
  ).rejects.toMatchObject({ code: 'policy_revision_conflict' });
  const result = await revokeDomainReadiness(
    sql,
    actor,
    orgId,
    domainId,
    config.id,
    { expected_revision: 1, reason },
    [],
  );
  expect(result.policy_revision).toBe(2);
  expect(result.evidence[0]?.readiness.blockers).toEqual(
    expect.arrayContaining(['transport_evidence_revoked', 'transport_unavailable']),
  );
  expect(result.evidence[0]?.instance).toBeNull();
  expect(
    await withTenant(
      sql,
      { orgId: otherOrgId, environmentId: otherEnvironmentId },
      (tx) => tx`select * from domain_transport_readiness`,
    ),
  ).toHaveLength(0);
  await expect(
    withTenant(
      sql,
      { orgId, environmentId },
      (tx) => tx`update domain_transport_readiness set revoked_at=null`,
    ),
  ).rejects.toThrow();
});
it('detects configuration rotation and reports missing configured instance evidence without claiming readiness', async () => {
  vi.spyOn(SESv2Client.prototype, 'send').mockResolvedValue(identity() as never);
  expect(
    (await listDomainReadiness(sql, orgId, domainId, [transport])).evidence[0]?.readiness.blockers,
  ).toContain('transport_evidence_missing');
  await updateDomainReadiness(sql, actor, orgId, domainId, input(), [transport]);
  const changed = {
    ...transport,
    instance: transportInstanceIdentity(config, {
      ...environment,
      SES_TEST_SECRET: 'changed-fixture-secret',
    }),
  };
  const result = await listDomainReadiness(sql, orgId, domainId, [changed]);
  expect(result.evidence[0]?.readiness.blockers).toContain('transport_configuration_changed');
  await expect(
    updateDomainReadiness(sql, actor, orgId, domainId, input(1), [changed]),
  ).rejects.toMatchObject({ code: 'transport_configuration_changed' });
});
