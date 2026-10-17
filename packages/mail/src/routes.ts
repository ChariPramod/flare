import { createHmac, randomUUID } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import type { TransportAdapter } from './transports.js';
import { SendingPolicyError, type OperatorActor } from './sending-policy.js';

const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/);
const environmentReference = z.string().regex(/^[A-Z][A-Z0-9_]{0,127}$/);
const instanceBase = {
  id: identifier,
  server_id: identifier,
  pool_id: identifier,
  credential_version: identifier,
};
export const namedTransportSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...instanceBase,
      kind: z.literal('postal'),
      url: z.string().url(),
      api_key_env: environmentReference,
      webhook_public_key_env: environmentReference,
    })
    .strict(),
  z
    .object({
      ...instanceBase,
      kind: z.literal('ses'),
      region: identifier,
      configuration_set: identifier,
      access_key_id_env: environmentReference,
      secret_access_key_env: environmentReference,
      session_token_env: environmentReference.optional(),
      sns_topic_arn: z.string().min(1).max(2048),
    })
    .strict(),
  z
    .object({
      ...instanceBase,
      kind: z.literal('smtp'),
      host: z.string().min(1).max(253),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      delivery_tls_required: z.boolean(),
      username_env: environmentReference.optional(),
      password_env: environmentReference.optional(),
    })
    .strict(),
]);
export type NamedTransportConfig = z.infer<typeof namedTransportSchema>;
export function parseNamedTransports(raw: string): NamedTransportConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MAIL_TRANSPORTS must contain a JSON array');
  }
  const result = z.array(namedTransportSchema).min(1).max(100).safeParse(parsed);
  // Never include the supplied configuration or Zod's input in an error; it may contain secrets.
  if (!result.success)
    throw new Error(
      'MAIL_TRANSPORTS contains an invalid transport definition or plaintext credential field',
    );
  if (new Set(result.data.map((item) => item.id)).size !== result.data.length)
    throw new Error('MAIL_TRANSPORTS instance IDs must be unique');
  if (result.data.some((item) => ['postal', 'ses', 'smtp'].includes(item.id)))
    throw new Error('MAIL_TRANSPORTS instance IDs must not reuse reserved legacy provider names');
  const snsTopics = result.data.flatMap((item) =>
    item.kind === 'ses' ? [item.sns_topic_arn] : [],
  );
  if (new Set(snsTopics).size !== snsTopics.length)
    throw new Error('Named SES instances must use distinct SNS topic ARNs');
  for (const item of result.data) {
    if (item.kind === 'postal') {
      const endpoint = new URL(item.url);
      if (
        !['http:', 'https:'].includes(endpoint.protocol) ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error(
          'Postal endpoint must be an HTTP URL without credentials, query, or fragment',
        );
    }
    if (item.kind === 'smtp' && Boolean(item.username_env) !== Boolean(item.password_env))
      throw new Error(
        'SMTP authentication requires both username and password environment references',
      );
    if (item.kind === 'smtp' && !/^[a-zA-Z0-9.:-]+$/.test(item.host))
      throw new Error('SMTP host must be a hostname or IP address without credentials');
  }
  return result.data;
}
const instanceIdentitySchema = z
  .object({
    ...instanceBase,
    kind: z.enum(['postal', 'ses', 'smtp']),
    config_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type TransportInstanceIdentity = z.infer<typeof instanceIdentitySchema>;
export type RoutedTransport = TransportAdapter & {
  instance?: TransportInstanceIdentity;
  sandbox?: boolean;
};
export function transportInstanceIdentity(
  config: NamedTransportConfig,
  environment: NodeJS.ProcessEnv = process.env,
): TransportInstanceIdentity {
  const canonical = Object.fromEntries(
    Object.entries(config)
      .filter(([, value]) => value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const key = Buffer.from(environment.FLARE_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('Named mail transports require FLARE_ENCRYPTION_KEY');
  const credentials = Object.entries(canonical)
    .filter(([field]) => field.endsWith('_env'))
    .map(([field, reference]) => {
      const value = environment[String(reference)];
      if (!value)
        throw new Error(`Missing mail transport environment reference: ${String(reference)}`);
      return [field, value];
    });
  return {
    id: config.id,
    kind: config.kind,
    server_id: config.server_id,
    pool_id: config.pool_id,
    credential_version: config.credential_version,
    // Keyed hashing prevents an exported route snapshot becoming a dictionary attack on SMTP passwords.
    config_fingerprint: createHmac('sha256', key)
      .update('flare/mail-route-instance/v1\0')
      .update(JSON.stringify({ config: canonical, credentials }))
      .digest('hex'),
  };
}
function canonicalIp(value: string) {
  try {
    const parsed = ipaddr.process(value);
    // Operator evidence must name actual publicly routable addresses, not private/test pool labels.
    if (parsed.range() !== 'unicast') throw new Error('not public');
    return parsed.toString();
  } catch {
    throw new SendingPolicyError(
      422,
      'route_invalid_ip',
      'Route evidence must contain public IP addresses',
    );
  }
}
const routePurpose = {
  traffic_class: z.enum(['transactional', 'marketing']),
  trust_tier: z.enum(['customer', 'pareto']),
  critical: z.boolean(),
};
export const mailRouteCreateSchema = z
  .object({
    id: z.string().uuid().optional(),
    expected_revision: z.number().int().nonnegative(),
    name: z.string().trim().min(1).max(120),
    ...routePurpose,
    transport_instances: z.array(identifier).min(1).max(20),
    physical_ips: z.array(z.string().min(2).max(64)).max(1000),
    proof_reference: z.string().trim().min(10).max(2000).optional(),
    verified: z.boolean(),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
export const mailRouteSnapshotSchema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().positive(),
    ...routePurpose,
    physical_ips: z.array(z.string()).min(1),
    instances: z.array(instanceIdentitySchema).min(1),
  })
  .strict();
export type MailRouteSnapshot = z.infer<typeof mailRouteSnapshotSchema>;
export interface RoutingPolicy {
  trust_tier: unknown;
  route_bindings: unknown;
}
function failure(code: string, message: string): never {
  throw new SendingPolicyError(403, code, message);
}
function identities(ids: string[], transports: RoutedTransport[]) {
  if (new Set(ids).size !== ids.length)
    failure('route_duplicate_transport', 'A route cannot repeat a transport instance');
  return ids.map((id) => {
    const matches = transports.filter((adapter) => adapter.instance?.id === id);
    const adapter = matches[0];
    if (matches.length !== 1 || !adapter || adapter.sandbox)
      failure(
        'route_transport_unavailable',
        'Route references an unavailable real transport instance',
      );
    return instanceIdentitySchema.parse(adapter.instance);
  });
}
function samePurpose(a: Record<string, unknown>, b: typeof a) {
  return (
    a.traffic_class === b.traffic_class &&
    a.trust_tier === b.trust_tier &&
    a.critical === b.critical
  );
}
function sameIdentity(a: TransportInstanceIdentity, b: TransportInstanceIdentity) {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.server_id === b.server_id &&
    a.pool_id === b.pool_id &&
    a.credential_version === b.credential_version &&
    a.config_fingerprint === b.config_fingerprint
  );
}
async function routeAudit(
  tx: Transaction,
  actor: OperatorActor,
  id: string,
  revision: number,
  action: string,
  metadata: unknown,
) {
  await tx`insert into mail_route_audit(route_id,route_revision,actor_id,session_id,action,metadata) values(${id},${revision},${actor.actorId},${actor.sessionId},${action},${tx.json(toJson(metadata))})`;
}
export async function listMailRoutes(sql: Sql) {
  return sql`select * from mail_routes order by created_at desc,id,revision desc limit 500`;
}
export async function createMailRoute(
  sql: Sql,
  actor: OperatorActor,
  value: unknown,
  transports: RoutedTransport[],
) {
  const input = mailRouteCreateSchema.parse(value);
  if (input.critical && (input.trust_tier !== 'pareto' || input.traffic_class !== 'transactional'))
    failure('route_invalid_purpose', 'Critical routes require Pareto transactional traffic');
  const instances = identities(input.transport_instances, transports);
  const ips = [...new Set(input.physical_ips.map(canonicalIp))].sort();
  if (input.verified && (!ips.length || !input.proof_reference))
    failure(
      'route_evidence_required',
      'Verified routes require physical IP evidence and a proof reference',
    );
  const id = input.id ?? randomUUID();
  return sql.begin(async (tx) => {
    await actor.authorize(tx);
    // Serialize all registry mutations, including concurrent creation of competing trust pools.
    await tx`select pg_advisory_xact_lock(hashtextextended('mail-route-registry',0))`;
    const existing = await tx`select * from mail_routes`;
    const revisions = existing.filter((row) => row.id === id);
    const latest = Math.max(0, ...revisions.map((row) => Number(row.revision)));
    if (latest !== input.expected_revision || (!input.id && input.expected_revision !== 0))
      throw new SendingPolicyError(
        409,
        'route_revision_conflict',
        'Mail route changed; refresh before editing',
      );
    if (revisions.some((row) => !samePurpose(row, input)))
      failure('route_purpose_immutable', 'Route purpose cannot change across revisions');
    for (const row of existing) {
      if (samePurpose(row, input)) continue;
      const previousIps = z.array(z.string()).parse(row.physical_ips);
      const previousInstances = z.array(instanceIdentitySchema).parse(row.instance_snapshot);
      if (
        ips.some((ip) => previousIps.includes(ip)) ||
        instances.some((item) =>
          previousInstances.some(
            (previous) =>
              previous.kind === item.kind &&
              previous.server_id === item.server_id &&
              previous.pool_id === item.pool_id,
          ),
        )
      )
        failure(
          'route_pool_overlap',
          'Physical IPs and server pools cannot cross traffic, trust, or critical boundaries',
        );
    }
    const revision = latest + 1;
    const [route] =
      await tx`insert into mail_routes(id,revision,name,traffic_class,trust_tier,critical,transport_instances,instance_snapshot,physical_ips,proof_reference,verified_at,created_by) values(${id},${revision},${input.name},${input.traffic_class},${input.trust_tier},${input.critical},${tx.json(toJson(input.transport_instances))},${tx.json(toJson(instances))},${tx.json(toJson(ips))},${input.proof_reference ?? null},${input.verified ? new Date() : null},${actor.actorId}) returning *`;
    await routeAudit(tx, actor, id, revision, 'operator.mail_route.created', {
      reason: input.reason,
      route,
    });
    await actor.authorize(tx);
    return route!;
  });
}
export async function disableMailRoute(
  sql: Sql,
  actor: OperatorActor,
  id: string,
  revision: number,
  reason: string,
) {
  z.string().uuid().parse(id);
  z.number().int().positive().parse(revision);
  z.string().trim().min(10).max(2000).parse(reason);
  return sql.begin(async (tx) => {
    await actor.authorize(tx);
    await tx`select pg_advisory_xact_lock(hashtextextended('mail-route-registry',0))`;
    const [route] =
      await tx`update mail_routes set disabled_at=coalesce(disabled_at,now()) where id=${id} and revision=${revision} returning *`;
    if (!route)
      throw new SendingPolicyError(404, 'route_not_found', 'Mail route revision not found');
    await routeAudit(tx, actor, id, revision, 'operator.mail_route.disabled', { reason });
    await actor.authorize(tx);
    return route;
  });
}
function snapshotForRoute(row: Record<string, unknown>): MailRouteSnapshot {
  if (!row.verified_at || row.disabled_at)
    failure('route_unverified_or_disabled', 'Sending route is unverified or disabled');
  return mailRouteSnapshotSchema.parse({
    id: row.id,
    revision: row.revision,
    traffic_class: row.traffic_class,
    trust_tier: row.trust_tier,
    critical: row.critical,
    physical_ips: row.physical_ips,
    instances: row.instance_snapshot,
  });
}
function adaptersForSnapshot(snapshot: MailRouteSnapshot, transports: RoutedTransport[]) {
  const current = identities(
    snapshot.instances.map((instance) => instance.id),
    transports,
  );
  if (current.some((instance, index) => !sameIdentity(instance, snapshot.instances[index]!)))
    failure(
      'route_configuration_changed',
      'Transport configuration changed; review and publish a new route revision',
    );
  return current.map((instance) =>
    transports.find((adapter) => adapter.instance?.id === instance.id)!,
  );
}
export async function resolveMailRoute(
  tx: Sql | Transaction,
  policy: RoutingPolicy,
  trafficClass: 'transactional' | 'marketing',
  critical: boolean,
  transports: RoutedTransport[],
): Promise<MailRouteSnapshot> {
  if (critical && (policy.trust_tier !== 'pareto' || trafficClass !== 'transactional'))
    failure('route_invalid_purpose', 'Critical routes require Pareto transactional traffic');
  const bindings = z
    .record(z.object({ id: z.string().uuid(), revision: z.number().int().positive() }))
    .safeParse(policy.route_bindings);
  const binding = bindings.success
    ? bindings.data[critical ? 'critical' : trafficClass]
    : undefined;
  if (!binding) failure('route_required', 'An approved sending route is required');
  const [row] =
    await tx`select * from mail_routes where id=${binding.id} and revision=${binding.revision}`;
  if (!row) failure('route_unavailable', 'Sending route revision is unavailable');
  const snapshot = snapshotForRoute(row);
  if (
    !samePurpose(snapshot, { traffic_class: trafficClass, trust_tier: policy.trust_tier, critical })
  )
    failure('route_purpose_mismatch', 'Sending route does not match the approved traffic purpose');
  adaptersForSnapshot(snapshot, transports);
  return snapshot;
}
export async function routeForDelivery(
  sql: Sql | Transaction,
  value: unknown,
  transports: RoutedTransport[],
): Promise<RoutedTransport[]> {
  const parsed = mailRouteSnapshotSchema.safeParse(value);
  if (!parsed.success) failure('route_required', 'Message has no valid pinned sending route');
  const snapshot = parsed.data;
  const [row] =
    await sql`select * from mail_routes where id=${snapshot.id} and revision=${snapshot.revision}`;
  if (!row) failure('route_unavailable', 'Pinned sending route revision is unavailable');
  const current = snapshotForRoute(row);
  if (
    !samePurpose(snapshot, current) ||
    JSON.stringify(snapshot.physical_ips) !== JSON.stringify(current.physical_ips) ||
    snapshot.instances.length !== current.instances.length ||
    snapshot.instances.some((instance, index) => !sameIdentity(instance, current.instances[index]!))
  )
    failure(
      'route_snapshot_conflict',
      'Message route snapshot does not match its registered revision',
    );
  return adaptersForSnapshot(snapshot, transports);
}
