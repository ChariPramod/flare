import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import { configuredTransports } from './transports.js';
import {
  createMailRoute,
  disableMailRoute,
  parseNamedTransports,
  resolveMailRoute,
  routeForDelivery,
  transportInstanceIdentity,
} from './routes.js';
import type { NamedTransportConfig, RoutedTransport } from './routes.js';
import type { OperatorActor } from './sending-policy.js';

const environment = {
  FLARE_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
  POSTAL_TEST_KEY: 'fixture-credential',
  POSTAL_TEST_PUBLIC_KEY: 'fixture-public-key',
};
const config: NamedTransportConfig = {
  id: 'postal-customer',
  kind: 'postal',
  server_id: 'server-customer',
  pool_id: 'transactional-customer',
  credential_version: 'v1',
  url: 'https://postal.example.test',
  api_key_env: 'POSTAL_TEST_KEY',
  webhook_public_key_env: 'POSTAL_TEST_PUBLIC_KEY',
};
const primary: RoutedTransport = {
  name: 'postal',
  instance: transportInstanceIdentity(config, environment),
  send: vi.fn(),
  supportsRequiredTls: async () => false,
};
const fallback: RoutedTransport = {
  ...primary,
  instance: transportInstanceIdentity(
    { ...config, id: 'postal-backup', server_id: 'backup-server' },
    environment,
  ),
};
const actor: OperatorActor = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  authorize: async () => undefined,
};
const orgId = randomUUID(),
  environmentId = randomUUID(),
  otherOrgId = randomUUID(),
  otherEnvironmentId = randomUUID();
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
const input = () => ({
  expected_revision: 0,
  name: 'Customer transactional',
  traffic_class: 'transactional',
  trust_tier: 'customer',
  critical: false,
  transport_instances: [primary.instance!.id, fallback.instance!.id],
  physical_ips: ['8.8.8.8'],
  proof_reference: 'operator-evidence/private-reference',
  verified: true,
  reason: 'Reviewed provider server and IP pool ownership',
});
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Route test','route-test'),($2,'Foreign route test','foreign-route-test')",
    [orgId, otherOrgId],
  );
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$4,'Development')",
    [environmentId, orgId, otherEnvironmentId, otherOrgId],
  );
  await db.query(
    "insert into users(id,email,name) values($1,'operator@example.test','Route operator')",
    [actor.actorId],
  );
  await db.query(
    "insert into sessions(id,user_id,expires_at) values($1,$2,now()+interval '1 day')",
    [actor.sessionId, actor.actorId],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate mail_routes cascade`;
  await sql`update sending_policies set route_bindings='{}'::jsonb`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function route(overrides: Record<string, unknown> = {}, transports = [primary, fallback]) {
  return createMailRoute(sql, actor, { ...input(), ...overrides }, transports);
}
function policy(row: Record<string, unknown>) {
  return {
    trust_tier: 'customer',
    route_bindings: { transactional: { id: row.id, revision: row.revision } },
  };
}

it('keeps an immutable ordered route through rebinding and rechecks explicit revocation', async () => {
  const registered = await route();
  const snapshot = await resolveMailRoute(sql, policy(registered), 'transactional', false, [
    fallback,
    primary,
  ]);
  expect(
    (await routeForDelivery(sql, snapshot, [fallback, primary])).map((item) => item.instance?.id),
  ).toEqual([primary.instance!.id, fallback.instance!.id]);
  const revised = await route({
    id: registered.id,
    expected_revision: 1,
    transport_instances: [fallback.instance!.id],
  });
  expect(revised.revision).toBe(2);
  expect((await routeForDelivery(sql, snapshot, [primary, fallback])).length).toBe(2);
  await disableMailRoute(
    sql,
    actor,
    String(registered.id),
    1,
    'Revoke old provider pool authorization',
  );
  await expect(routeForDelivery(sql, snapshot, [primary, fallback])).rejects.toMatchObject({
    code: 'route_unverified_or_disabled',
  });
  expect((await sql`select * from mail_route_audit`).length).toBe(3);
});
it('requires operator authorization before any registry mutation or audit', async () => {
  await expect(
    createMailRoute(
      sql,
      {
        ...actor,
        authorize: async () => {
          throw new Error('MFA required');
        },
      },
      input(),
      [primary, fallback],
    ),
  ).rejects.toThrow('MFA required');
  expect(await sql`select * from mail_routes`).toHaveLength(0);
  expect(await sql`select * from mail_route_audit`).toHaveLength(0);
});
it('rejects overlapping IPs across trust, traffic class, and critical purposes including revoked history', async () => {
  const registered = await route();
  await disableMailRoute(
    sql,
    actor,
    String(registered.id),
    1,
    'Revoke a pool without recycling reputation',
  );
  for (const change of [
    { trust_tier: 'pareto' },
    { traffic_class: 'marketing' },
    { trust_tier: 'pareto', critical: true },
  ])
    await expect(route(change)).rejects.toMatchObject({ code: 'route_pool_overlap' });
  await expect(route({ physical_ips: ['1.1.1.1'], trust_tier: 'pareto' })).rejects.toMatchObject({
    code: 'route_pool_overlap',
  });
});
it('canonicalizes equivalent IPv6 evidence before overlap checks', async () => {
  await route({ physical_ips: ['2001:4860:4860:0:0:0:0:8888'] });
  const separate = {
    ...primary,
    instance: { ...primary.instance!, id: 'separate', server_id: 'separate', pool_id: 'separate' },
  };
  await expect(
    route(
      {
        trust_tier: 'pareto',
        transport_instances: ['separate'],
        physical_ips: ['2001:4860:4860::8888'],
      },
      [separate],
    ),
  ).rejects.toMatchObject({ code: 'route_pool_overlap' });
});
it('rejects unverified, private-IP, duplicate-instance, unavailable and forged snapshots', async () => {
  const registered = await route({ verified: false });
  await expect(
    resolveMailRoute(sql, policy(registered), 'transactional', false, [primary, fallback]),
  ).rejects.toMatchObject({ code: 'route_unverified_or_disabled' });
  await expect(route({ physical_ips: ['127.0.0.1'] })).rejects.toMatchObject({
    code: 'route_invalid_ip',
  });
  await expect(route({ physical_ips: [] })).rejects.toMatchObject({
    code: 'route_evidence_required',
  });
  await expect(
    route({ transport_instances: ['postal-customer', 'postal-customer'] }),
  ).rejects.toMatchObject({ code: 'route_duplicate_transport' });
  await expect(route({ transport_instances: ['unknown'] })).rejects.toMatchObject({
    code: 'route_transport_unavailable',
  });
  const good = await route();
  const snapshot = await resolveMailRoute(sql, policy(good), 'transactional', false, [
    primary,
    fallback,
  ]);
  await expect(
    routeForDelivery(sql, { ...snapshot, instances: snapshot.instances.slice(1) }, [
      primary,
      fallback,
    ]),
  ).rejects.toMatchObject({ code: 'route_snapshot_conflict' });
  await expect(
    resolveMailRoute(sql, { ...policy(good), trust_tier: 'pareto' }, 'transactional', false, [
      primary,
      fallback,
    ]),
  ).rejects.toMatchObject({ code: 'route_purpose_mismatch' });
});
it('serializes concurrent revisions and prevents changing an existing route purpose', async () => {
  const registered = await route();
  const outcomes = await Promise.allSettled([
    route({ id: registered.id, expected_revision: 1 }),
    route({ id: registered.id, expected_revision: 1 }),
  ]);
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
  await expect(
    route({ id: registered.id, expected_revision: 2, traffic_class: 'marketing' }),
  ).rejects.toMatchObject({ code: 'route_purpose_immutable' });
});
it('allows tenant reads only through its policy bindings and prohibits tenant mutations', async () => {
  const registered = await route();
  await sql`update sending_policies set route_bindings=${sql.json(policy(registered).route_bindings)} where org_id=${orgId}`;
  const result = await withTenant(sql, { orgId, environmentId }, (tx) =>
    resolveMailRoute(tx, policy(registered), 'transactional', false, [primary, fallback]),
  );
  expect(result.id).toBe(registered.id);
  await expect(
    withTenant(sql, { orgId: otherOrgId, environmentId: otherEnvironmentId }, (tx) =>
      resolveMailRoute(tx, policy(registered), 'transactional', false, [primary, fallback]),
    ),
  ).rejects.toMatchObject({ code: 'route_unavailable' });
  await expect(
    withTenant(sql, { orgId, environmentId }, async (tx) => {
      await tx`update mail_routes set disabled_at=now()`;
    }),
  ).rejects.toThrow();
});
it('rejects endpoint and same-reference credential rotation until a new revision is reviewed', async () => {
  const registered = await route();
  const snapshot = await resolveMailRoute(sql, policy(registered), 'transactional', false, [
    primary,
    fallback,
  ]);
  for (const changed of [
    transportInstanceIdentity({ ...config, url: 'https://different.example.test' }, environment),
    transportInstanceIdentity(config, { ...environment, POSTAL_TEST_KEY: 'rotated-fixture' }),
  ])
    await expect(
      routeForDelivery(sql, snapshot, [{ ...primary, instance: changed }, fallback]),
    ).rejects.toMatchObject({ code: 'route_configuration_changed' });
  expect(JSON.stringify(snapshot)).not.toContain(environment.POSTAL_TEST_KEY);
  expect(JSON.stringify(snapshot)).not.toContain(environment.POSTAL_TEST_PUBLIC_KEY);
});
it('supports multiple named instances of one provider without allowing plaintext credentials', () => {
  for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value);
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([config, { ...config, id: 'second-postal' }]));
  vi.stubEnv('MAIL_SANDBOX', 'false');
  const instances = configuredTransports();
  expect(instances.map((adapter) => adapter.name)).toEqual(['postal', 'postal']);
  expect(instances.map((adapter) => adapter.instance?.id)).toEqual([
    'postal-customer',
    'second-postal',
  ]);
  expect(() =>
    parseNamedTransports(JSON.stringify([{ ...config, api_key: 'never-log-this' }])),
  ).toThrow(/plaintext credential/);
  expect(() =>
    parseNamedTransports(
      JSON.stringify([{ ...config, url: 'https://secret:password@example.test' }]),
    ),
  ).toThrow(/without credentials/);
  expect(() => parseNamedTransports(JSON.stringify([config, config]))).toThrow(/unique/);
  for (const id of ['postal', 'ses', 'smtp'])
    expect(() => parseNamedTransports(JSON.stringify([{ ...config, id }]))).toThrow(
      /reserved legacy/,
    );
  const ses = {
    id: 'ses-a',
    kind: 'ses',
    server_id: 'aws-a',
    pool_id: 'pool-a',
    credential_version: 'v1',
    region: 'us-east-1',
    configuration_set: 'a',
    access_key_id_env: 'AWS_FIXTURE_ACCESS',
    secret_access_key_env: 'AWS_FIXTURE_SECRET',
    sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:ses-a',
  };
  expect(() => parseNamedTransports(JSON.stringify([ses, { ...ses, id: 'ses-b' }]))).toThrow(
    /distinct SNS/,
  );
});
it('permits sandbox bypass only for explicitly configured isolated Mailpit', () => {
  vi.stubEnv('MAIL_TRANSPORTS', '');
  vi.stubEnv('MAIL_SANDBOX', 'true');
  vi.stubEnv('TRANSPORT', 'smtp');
  vi.stubEnv('TRANSPORT_PRIORITY', '');
  vi.stubEnv('SMTP_HOST', 'mailpit');
  vi.stubEnv('SMTP_PORT', '1025');
  vi.stubEnv('SMTP_SECURE', 'false');
  vi.stubEnv('SMTP_USER', '');
  vi.stubEnv('SMTP_PASSWORD', '');
  expect(configuredTransports()[0]?.sandbox).toBe(true);
  vi.stubEnv('SMTP_PORT', '11025');
  expect(() => configuredTransports()).toThrow(/approved local host/);
  vi.stubEnv('SMTP_HOST', '127.0.0.1');
  expect(configuredTransports()[0]?.sandbox).toBe(true);
  vi.stubEnv('SMTP_HOST', 'smtp.example.test');
  expect(() => configuredTransports()).toThrow(/approved local host/);
  vi.stubEnv('MAIL_SANDBOX', 'false');
  expect(configuredTransports()[0]?.sandbox).not.toBe(true);
});
