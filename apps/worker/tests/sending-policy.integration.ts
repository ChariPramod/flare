import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { connect, createServer } from 'node:net';
import type { Socket } from 'node:net';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { Redis } from 'ioredis';
import { connectDatabase, withTenant } from '@flare/db';
import { hashToken } from '@flare/shared';
import type { Principal } from '@flare/shared';
import {
  configuredTransports,
  createMailRoute,
  generateDomain,
  objectStore,
  submitEmails,
  changeSchedule,
  deliverEmail,
  MailError,
  SmtpAdapter,
  transportInstanceIdentity,
  updateSendingPolicy,
} from '@flare/mail';
import type { NamedTransportConfig, PipelineOptions, TransportAdapter } from '@flare/mail';
import { startRelayFixture } from '../../smtp-relay/tests/relay-fixture.js';
import { startMailWorker } from '../src/mail.js';

const url =
  process.env.TEST_DATABASE_URL ??
  'postgres://flare_test:local-test-only@127.0.0.1:15432/flare_test';
if (new URL(url).pathname !== '/flare_test')
  throw new Error('Sending policy integration requires the disposable flare_test database');
const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:16379/15';
if (new URL(redisUrl).pathname !== '/15')
  throw new Error('Sending policy integration requires disposable Redis database 15');
// Independent pools make advisory/row-lock assertions exercise actual PostgreSQL backends.
const sql = connectDatabase(url, { max: 10 }).client;
const apiSql = connectDatabase(url, { max: 10 }).client;
const relaySql = connectDatabase(url, { max: 10 }).client;
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
const key = randomBytes(32).toString('base64');
const actor = { actorId: randomUUID(), sessionId: randomUUID(), authorize: async () => undefined };
const config: NamedTransportConfig = {
  id: 'policy-mailpit',
  kind: 'smtp',
  server_id: 'integration-mailpit',
  pool_id: 'customer-transactional',
  credential_version: 'fixture-v1',
  host: '127.0.0.1',
  port: 11025,
  secure: false,
  delivery_tls_required: false,
};
let options: PipelineOptions;
let routeId: string;
let relay: Awaited<ReturnType<typeof startRelayFixture>> | undefined;
let worker: ReturnType<typeof startMailWorker> | undefined;

beforeAll(async () => {
  vi.stubEnv('MAIL_SANDBOX', 'false');
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([config]));
  vi.stubEnv('FLARE_ENCRYPTION_KEY', key);
  for (const [name, value] of Object.entries({
    S3_ENDPOINT: 'http://127.0.0.1:19000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'flare-test',
    S3_ACCESS_KEY: 'flare-test',
    S3_SECRET_KEY: 'local-test-only',
  }))
    vi.stubEnv(name, value);
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await redis.connect();
  await redis.flushdb();
  await sql`insert into users(id,email,name) values(${actor.actorId},'policy-integration-operator@example.net','Fixture operator')`;
  await sql`insert into sessions(id,user_id,expires_at) values(${actor.sessionId},${actor.actorId},now()+interval '1 day')`;
  options = {
    sql: apiSql,
    encryptionKey: key,
    trackingKey: key,
    store: objectStore(),
    transports: configuredTransports(),
  };
  routeId = await registerRoute(options.transports);
  relay = await startRelayFixture({
    async authenticate(token): Promise<Principal> {
      const [credential] =
        await relaySql`select * from api_keys where token_hash=${hashToken(token)} and revoked_at is null`;
      if (!credential) throw new MailError(401, 'Invalid API key');
      return {
        orgId: String(credential.org_id),
        environmentId: String(credential.environment_id),
        actorId: String(credential.id),
        kind: 'api_key',
        role: 'developer',
        permission: 'sending_access',
        production: false,
      };
    },
    async submit(principal, input, headers) {
      return (
        await submitEmails({ ...options, sql: relaySql }, principal, [input], {
          smtpHeaders: headers,
        })
      ).data[0]!.id;
    },
  });
}, 30000);
afterAll(async () => {
  await worker?.close();
  await relay?.close();
  if (redis.status !== 'wait' && redis.status !== 'end') await redis.quit();
  else redis.disconnect();
  await Promise.all([sql.end(), apiSql.end(), relaySql.end()]);
  vi.unstubAllEnvs();
});
async function registerRoute(transports: TransportAdapter[]) {
  // Public pool addresses and operator review references are synthetic fixtures.
  // Development exercises policy/routing but does NOT certify live authentication.
  const route = await createMailRoute(
    sql,
    actor,
    {
      expected_revision: 0,
      name: 'Integration fixture route',
      traffic_class: 'transactional',
      trust_tier: 'customer',
      critical: false,
      transport_instances: transports.map((transport) => transport.instance!.id),
      physical_ips: ['8.8.8.8'],
      proof_reference: 'integration-fixture/not-live-provider-evidence',
      verified: true,
      reason: 'Fixture operator configures isolated transactional test route',
    },
    transports,
  );
  return String(route.id);
}
async function fixture(dailyLimit = 100, perMinuteLimit = 100) {
  const orgId = randomUUID(),
    environmentId = randomUUID();
  await sql`insert into organizations(id,name,slug) values(${orgId},'Sending integration',${`sending-${orgId}`})`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development')`;
  const keys = generateDomain('example.com', `${orgId}/${environmentId}`, key);
  await sql`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,next_check_at) values(${orgId},${environmentId},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher},now()+interval '1 day')`;
  const credentials = await Promise.all(
    [0, 1].map(async () => {
      const id = randomUUID(),
        token = `fl_${randomUUID()}`;
      await sql`insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values(${id},${orgId},${environmentId},'Integration credential',${hashToken(token)},'fl_test','sending_access')`;
      const principal: Principal = {
        orgId,
        environmentId,
        actorId: id,
        kind: 'api_key',
        role: 'developer',
        permission: 'sending_access',
        production: false,
      };
      return { token, principal };
    }),
  );
  const change = async (changes: Record<string, unknown>) => {
    const [current] = await sql`select revision from sending_policies where org_id=${orgId}`;
    return updateSendingPolicy(sql, actor, orgId, {
      expected_revision: Number(current!.revision),
      reason: 'Fixture operator reviews sending policy change',
      ...changes,
    });
  };
  await change({
    state: 'approved',
    daily_limit: dailyLimit,
    per_minute_limit: perMinuteLimit,
    default_traffic_class: 'transactional',
    route_bindings: { transactional: { id: routeId, revision: 1 } },
  });
  return { orgId, environmentId, first: credentials[0]!, second: credentials[1]!, change };
}
const input = (subject = `Policy integration ${randomUUID()}`) => ({
  from: 'sender@example.com',
  to: ['reader@example.net'],
  subject,
  text: 'Integration fixture',
});
async function cancelUnstarted(tenant: Awaited<ReturnType<typeof fixture>>) {
  const rows =
    await sql`select id from messages where org_id=${tenant.orgId} and delivery_started_at is null and status in ('queued','scheduled','held')`;
  for (const row of rows)
    await changeSchedule(
      sql,
      { ...tenant.first.principal, kind: 'session', role: 'owner' },
      String(row.id),
      null,
    );
}

it('shares one daily allowance across independent API keys and authenticated STARTTLS relay submissions', async () => {
  const tenant = await fixture(5);
  const smtpSubject = `Policy SMTP ${randomUUID()}`;
  await relay!.send(tenant.second.token, {
    from: 'sender@example.com',
    to: 'visible@example.net',
    subject: smtpSubject,
    text: 'SMTP quota',
    envelope: { from: 'sender@example.com', to: ['visible@example.net', 'hidden@example.net'] },
  });
  const request = input();
  const prior = await submitEmails(options, tenant.first.principal, [request], {
    key: 'known-idempotent',
  });
  const results = await Promise.allSettled([
    ...Array.from({ length: 6 }, (_, index) =>
      submitEmails(
        { ...options, sql: index % 2 ? relaySql : apiSql },
        index % 2 ? tenant.second.principal : tenant.first.principal,
        [input()],
      ),
    ),
    ...Array.from({ length: 4 }, () => relay!.send(tenant.second.token, input())),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
  const smtpFailures = results.slice(6).filter((result) => result.status === 'rejected');
  expect(smtpFailures.length).toBeGreaterThanOrEqual(2);
  for (const result of smtpFailures)
    if (result.status === 'rejected') expect(result.reason).toMatchObject({ responseCode: 452 });
  for (const result of results.slice(0, 6))
    if (result.status === 'rejected')
      expect(result.reason).toMatchObject({ status: 429, code: 'recipient_quota_exhausted' });
  expect(
    await submitEmails({ ...options, sql: relaySql }, tenant.first.principal, [request], {
      key: 'known-idempotent',
    }),
  ).toEqual(prior);
  expect(
    await sql`select * from sending_quota where org_id=${tenant.orgId} and state='reserved'`,
  ).toHaveLength(5);
  expect(await sql`select * from messages where org_id=${tenant.orgId}`).toHaveLength(4);
  expect(
    await sql`select distinct submitting_key_id from messages where org_id=${tenant.orgId}`,
  ).toHaveLength(2);
  const [smtpMessage] =
    await sql`select mime_key from messages where org_id=${tenant.orgId} and request->>'subject'=${smtpSubject}`;
  const mime = await options.store.get(String(smtpMessage!.mime_key), 25 * 1024 * 1024);
  expect(mime.toString()).not.toContain('hidden@example.net');
  expect(mime.toString()).toMatch(/^DKIM-Signature:/m);
  await cancelUnstarted(tenant);
});

it('rolls back a strict batch and releases canceled reservations before another key submits', async () => {
  const tenant = await fixture(1);
  await expect(
    submitEmails(options, tenant.first.principal, [input(), input()], {
      key: 'strict-batch',
      batch: true,
    }),
  ).rejects.toMatchObject({ status: 429 });
  expect(await sql`select * from messages where org_id=${tenant.orgId}`).toHaveLength(0);
  expect(await sql`select * from sending_quota where org_id=${tenant.orgId}`).toHaveLength(0);
  expect(await sql`select * from event_outbox where org_id=${tenant.orgId}`).toHaveLength(0);
  const accepted = await submitEmails(options, tenant.first.principal, [input()]);
  await changeSchedule(sql, tenant.first.principal, accepted.data[0]!.id, null);
  await submitEmails({ ...options, sql: relaySql }, tenant.second.principal, [input()]);
  expect(
    await sql`select * from sending_quota where org_id=${tenant.orgId} and state='released'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from sending_quota where org_id=${tenant.orgId} and state='reserved'`,
  ).toHaveLength(1);
  await cancelUnstarted(tenant);
});

it('rejects a foreign credential and isolates quota visibility across real tenant transactions', async () => {
  const first = await fixture(1),
    second = await fixture(1);
  await submitEmails(options, first.first.principal, [input()]);
  await expect(
    submitEmails(options, { ...second.first.principal, actorId: first.first.principal.actorId }, [
      input(),
    ]),
  ).rejects.toMatchObject({ code: 'credential_unavailable' });
  expect(
    await withTenant(relaySql, second.first.principal, (tx) => tx`select * from sending_quota`),
  ).toHaveLength(0);
  await submitEmails(options, second.first.principal, [input()]);
  expect(
    await sql`select * from sending_quota where org_id=${second.orgId} and state='reserved'`,
  ).toHaveLength(1);
  await cancelUnstarted(first);
  await cancelUnstarted(second);
});

it('charges pacing per real SMTP retry while consuming logical recipient quota only once', async () => {
  const tenant = await fixture(2, 2);
  let connections = 0;
  const sockets = new Set<Socket>();
  const proxy = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (++connections === 1) {
      socket.end('421 Temporary integration refusal\r\n');
      return;
    }
    const upstream = connect(11025, '127.0.0.1');
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    socket.on('error', () => upstream.destroy());
    upstream.on('error', () => socket.destroy());
    socket.pipe(upstream).pipe(socket);
    socket.once('close', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  try {
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Missing SMTP proxy listener');
    const retryConfig = { ...config, id: 'policy-retry-mailpit', port: address.port };
    const adapter: TransportAdapter = new SmtpAdapter({
      host: retryConfig.host,
      port: retryConfig.port,
      secure: false,
      deliveryTlsRequired: false,
    });
    adapter.instance = transportInstanceIdentity(retryConfig);
    adapter.sandbox = false;
    const retryOptions = { ...options, transports: [adapter] };
    await tenant.change({
      route_bindings: { transactional: { id: await registerRoute([adapter]), revision: 1 } },
    });
    const subject = `Paced SMTP retry ${randomUUID()}`;
    const id = (await submitEmails(retryOptions, tenant.first.principal, [input(subject)])).data[0]!
      .id;
    await deliverEmail(retryOptions, id);
    const [firstQuota] = await sql`select consumed_at from sending_quota where message_id=${id}`;
    expect(
      await sql`select * from transport_attempts where message_id=${id} and status='transient_failure'`,
    ).toHaveLength(1);
    await expect
      .poll(
        async () => {
          await deliverEmail(retryOptions, id);
          return (await sql`select status from messages where id=${id}`)[0]?.status;
        },
        { timeout: 15000 },
      )
      .toBe('sent');
    expect(connections).toBe(2);
    expect(await sql`select * from sending_dispatches where message_id=${id}`).toHaveLength(2);
    expect(await sql`select consumed_at from sending_quota where message_id=${id}`).toEqual([
      { consumed_at: firstQuota!.consumed_at },
    ]);
    const next = (await submitEmails(retryOptions, tenant.second.principal, [input()])).data[0]!.id;
    await deliverEmail(retryOptions, next);
    expect((await sql`select status,hold_reason from messages where id=${next}`)[0]).toMatchObject({
      status: 'held',
      hold_reason: 'sending_rate_limited',
    });
    expect(connections).toBe(2);
    const mailpit = (await fetch('http://127.0.0.1:18025/api/v1/messages').then((response) =>
      response.json(),
    )) as { messages: { Subject: string }[] };
    expect(mailpit.messages.filter((message) => message.Subject === subject)).toHaveLength(1);
    await cancelUnstarted(tenant);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      proxy.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

it('preserves a suspended send through Redis loss and resumes once after worker recreation', async () => {
  const tenant = await fixture(1);
  const subject = `Policy recovery ${randomUUID()}`;
  const id = (await submitEmails(options, tenant.first.principal, [input(subject)])).data[0]!.id;
  await tenant.change({ state: 'suspended' });
  await deliverEmail(options, id);
  expect(
    (await sql`select status,hold_reason,delivery_started_at from messages where id=${id}`)[0],
  ).toMatchObject({ status: 'held', hold_reason: 'sending_suspended', delivery_started_at: null });
  await redis.flushdb();
  worker = startMailWorker(sql, redis, key, key);
  await worker.dispatch();
  await worker.close();
  worker = undefined;
  expect(await sql`select * from transport_attempts where message_id=${id}`).toHaveLength(0);
  await tenant.change({ state: 'approved' });
  worker = startMailWorker(sql, redis, key, key);
  await worker.dispatch();
  await expect
    .poll(async () => (await sql`select status from messages where id=${id}`)[0]?.status, {
      timeout: 15000,
    })
    .toBe('sent');
  await worker.dispatch();
  await worker.close();
  worker = undefined;
  expect(await sql`select * from transport_attempts where message_id=${id}`).toHaveLength(1);
  expect(
    await sql`select * from sending_quota where message_id=${id} and state='consumed'`,
  ).toHaveLength(1);
  const mailpit = (await fetch('http://127.0.0.1:18025/api/v1/messages').then((response) =>
    response.json(),
  )) as { messages: { Subject: string }[] };
  expect(mailpit.messages.filter((message) => message.Subject === subject)).toHaveLength(1);
});
