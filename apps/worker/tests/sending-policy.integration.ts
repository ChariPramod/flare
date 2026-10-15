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
  recordEvent,
  restoreProtectedSuppression,
  updateDomainReadiness,
  protectSuppression,
} from '@flare/mail';
import type { NamedTransportConfig, PipelineOptions, TransportAdapter } from '@flare/mail';
import { startRelayFixture } from '../../smtp-relay/tests/relay-fixture.js';
import { refreshSesReadiness, startMailWorker } from '../src/mail.js';

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
async function productionFixture(
  tenant: Awaited<ReturnType<typeof fixture>>,
  providerOptions = options,
  instanceId = config.id,
  probe?: Parameters<typeof updateDomainReadiness>[6],
) {
  const environmentId = randomUUID(),
    domainId = randomUUID(),
    credentialId = randomUUID(),
    domain = 'production.example.net';
  const { orgId } = tenant;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Production')`;
  const keys = generateDomain(domain, `${orgId}/${environmentId}`, key);
  const checkedAt = new Date(Date.now() - 1000).toISOString();
  // Synthetic DNS and operator-reviewed headers permit Production policy testing
  // against Mailpit. They are not evidence of live DNS or receiver authentication.
  await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,checked_at,records,dmarc_evidence,next_check_at) values(${domainId},${orgId},${environmentId},${domain},'verified',${keys.selector},${keys.publicKey},${keys.cipher},now(),${sql.json([{ purpose: 'dkim', status: 'verified' }])},${sql.json({ status: 'verified', record_domain: domain, checked_at: checkedAt, inherited: false, policy: 'none', adkim: 'r', aspf: 'r' })},now()+interval '1 day')`;
  const [policy] = await sql`select revision from sending_policies where org_id=${orgId}`;
  await updateDomainReadiness(
    sql,
    actor,
    orgId,
    domainId,
    {
      expected_revision: Number(policy!.revision),
      reason: 'Fixture operator records synthetic receiver evidence for concurrency tests',
      evidence: {
        kind: 'received_headers',
        provenance: 'operator_attested_receiver_headers',
        transport_instance: instanceId,
        proof_reference: 'integration-fixture/not-live-receiver-evidence',
        checked_at: checkedAt,
        header_from_domain: domain,
        dkim_domain: domain,
        dkim_pass: true,
        mail_from_domain: probe ? `bounce.${domain}` : domain,
        spf_pass: true,
        dmarc_pass: true,
      },
    },
    providerOptions.transports,
    probe,
  );
  await sql`insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values(${credentialId},${orgId},${environmentId},'Production integration credential',${hashToken(`fl_${randomUUID()}`)},'fl_test','sending_access')`;
  const principal: Principal = {
    ...tenant.first.principal,
    actorId: credentialId,
    environmentId,
    production: true,
  };
  return {
    principal,
    domainId,
    from: `sender@${domain}`,
    options: { ...providerOptions, sql: relaySql },
  };
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

it('shares daily reservations across domains and environments and releases canceled or suppressed work', async () => {
  const tenant = await fixture(1);
  const production = await productionFixture(tenant);
  const contexts = [
    { principal: tenant.first.principal, from: 'sender@example.com', options },
    production,
  ];
  const outcomes = await Promise.allSettled(
    contexts.map((context) =>
      submitEmails(context.options, context.principal, [{ ...input(), from: context.from }]),
    ),
  );
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = outcomes.find((result) => result.status === 'rejected');
  expect(rejected).toMatchObject({ status: 'rejected', reason: { status: 429 } });
  const winnerIndex = outcomes.findIndex((result) => result.status === 'fulfilled');
  const winner = outcomes[winnerIndex]!;
  if (winner.status !== 'fulfilled') throw new Error('Missing accepted quota competitor');
  const winnerContext = contexts[winnerIndex]!,
    loserContext = contexts[1 - winnerIndex]!;
  expect(await sql`select * from sending_quota where org_id=${tenant.orgId}`).toHaveLength(1);
  expect(await sql`select * from messages where org_id=${tenant.orgId}`).toHaveLength(1);
  await changeSchedule(
    winnerContext.options.sql,
    winnerContext.principal,
    winner.value.data[0]!.id,
    null,
  );
  const next = (
    await submitEmails(loserContext.options, loserContext.principal, [
      { ...input(), from: loserContext.from },
    ])
  ).data[0]!.id;
  expect(
    await sql`select * from sending_quota where org_id=${tenant.orgId} and state='reserved'`,
  ).toHaveLength(1);
  // A restriction created in the other environment must suppress this domain too.
  await withTenant(winnerContext.options.sql, winnerContext.principal, (tx) =>
    protectSuppression(tx, winnerContext.principal, 'reader@example.net', 'manual'),
  );
  await deliverEmail(loserContext.options, next);
  expect((await sql`select status from messages where id=${next}`)[0]?.status).toBe('suppressed');
  expect(await sql`select state from sending_quota where org_id=${tenant.orgId}`).toEqual([
    { state: 'released' },
    { state: 'released' },
  ]);
  expect(await sql`select * from transport_attempts where org_id=${tenant.orgId}`).toHaveLength(0);
  // Released slots are usable again, even from the previously rejected environment.
  const replacement = (
    await submitEmails(loserContext.options, loserContext.principal, [
      { ...input(), from: loserContext.from, to: ['replacement@example.net'] },
    ])
  ).data[0]!.id;
  await changeSchedule(loserContext.options.sql, loserContext.principal, replacement, null);
});

it('serializes simultaneous due schedules across environments into one paced dispatch and durable holds', async () => {
  const tenant = await fixture(2, 1);
  const production = await productionFixture(tenant);
  const contexts = [
    { principal: tenant.first.principal, from: 'sender@example.com', options },
    production,
  ];
  const subjects = contexts.map(() => `Scheduled cross-environment ${randomUUID()}`);
  const ids = await Promise.all(
    contexts.map(
      async (context, index) =>
        (
          await submitEmails(context.options, context.principal, [
            {
              ...input(subjects[index]),
              from: context.from,
              scheduled_at: new Date(Date.now() + 3600000).toISOString(),
            },
          ])
        ).data[0]!.id,
    ),
  );
  expect(await sql`select * from sending_quota where org_id=${tenant.orgId}`).toHaveLength(0);
  await Promise.all(ids.map((id, index) => deliverEmail(contexts[index]!.options, id)));
  expect(await sql`select * from transport_attempts where org_id=${tenant.orgId}`).toHaveLength(0);
  // Make persisted schedules due; no application clock hooks or pacing bypasses.
  await sql`update messages set scheduled_at=now(),next_attempt_at=now() where org_id=${tenant.orgId} and id in ${sql(ids)}`;
  await Promise.all(ids.map((id, index) => deliverEmail(contexts[index]!.options, id)));
  const messages =
    await sql`select id,status,hold_reason,claim_id,lease_until,delivery_started_at,next_attempt_at>now() as retry_pending from messages where org_id=${tenant.orgId}`;
  expect(messages.filter((message) => message.status === 'sent')).toHaveLength(1);
  const held = messages.filter((message) => message.status === 'held');
  expect(held).toHaveLength(1);
  expect(held[0]).toMatchObject({
    hold_reason: 'sending_rate_limited',
    claim_id: null,
    lease_until: null,
    delivery_started_at: null,
    retry_pending: true,
  });
  expect(await sql`select state from sending_quota where org_id=${tenant.orgId}`).toEqual([
    { state: 'consumed' },
  ]);
  expect(await sql`select recipients from sending_dispatches where org_id=${tenant.orgId}`).toEqual(
    [{ recipients: 1 }],
  );
  expect(await sql`select status from transport_attempts where org_id=${tenant.orgId}`).toEqual([
    { status: 'accepted' },
  ]);
  const heldId = String(held[0]!.id),
    heldContext = contexts[ids.indexOf(heldId)]!;
  expect(await sql`select * from sending_quota where message_id=${heldId}`).toHaveLength(0);
  expect(
    await sql`select * from event_outbox where org_id=${tenant.orgId} and type='email.held' and data->>'email_id'=${heldId}`,
  ).toHaveLength(1);
  const freshSql = connectDatabase(url, { max: 2 }).client;
  try {
    await deliverEmail({ ...options, sql: freshSql }, heldId);
    expect(
      (
        await freshSql`select status,claim_id,delivery_started_at from messages where id=${heldId}`
      )[0],
    ).toMatchObject({ status: 'held', claim_id: null, delivery_started_at: null });
    expect(
      await freshSql`select * from transport_attempts where org_id=${tenant.orgId}`,
    ).toHaveLength(1);
    await changeSchedule(freshSql, heldContext.principal, heldId, null);
    await deliverEmail({ ...options, sql: freshSql }, heldId);
    expect((await freshSql`select status from messages where id=${heldId}`)[0]?.status).toBe(
      'canceled',
    );
  } finally {
    await freshSql.end();
  }
  expect(await sql`select state from sending_quota where org_id=${tenant.orgId}`).toEqual([
    { state: 'consumed' },
  ]);
  const mailpit = (await fetch('http://127.0.0.1:18025/api/v1/messages').then((response) =>
    response.json(),
  )) as { messages: { Subject: string }[] };
  expect(mailpit.messages.filter((message) => subjects.includes(message.Subject))).toHaveLength(1);
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

it('serializes fresh complaint receipt IDs into one restriction and does not replay reviewed feedback', async () => {
  const tenant = await fixture();
  const messageId = (await submitEmails(options, tenant.first.principal, [input()])).data[0]!.id;
  await deliverEmail(options, messageId);
  expect((await sql`select status from messages where id=${messageId}`)[0]?.status).toBe('sent');
  const event = {
    source: 'postal:integration-feedback',
    messageId,
    recipient: 'reader@example.net',
    type: 'complained' as const,
  };
  // Authentication/signature verification is covered at the ingestion boundary;
  // these normalized trusted-provider receipts exercise concurrent persistence.
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      recordEvent(index % 2 ? relaySql : apiSql, tenant.first.principal, {
        ...event,
        sourceId: randomUUID(),
      }),
    ),
  );
  expect(outcomes.filter((outcome) => !outcome.duplicate)).toHaveLength(1);
  expect(
    await sql`select * from delivery_events where message_id=${messageId} and type='complained'`,
  ).toHaveLength(8);
  expect(
    await sql`select * from event_outbox where org_id=${tenant.orgId} and type='email.complained'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from event_outbox where org_id=${tenant.orgId} and type='suppression.created'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from audit_logs where org_id=${tenant.orgId} and action='operator.sending_policy.auto_suspended'`,
  ).toHaveLength(1);
  const [suspended] =
    await sql`select state,revision from sending_policies where org_id=${tenant.orgId}`;
  expect(suspended!.state).toBe('suspended');
  await restoreProtectedSuppression(sql, actor, tenant.orgId, {
    email: event.recipient,
    expected_revision: Number(suspended!.revision),
    reason: 'Fixture operator reviewed the original complaint evidence',
  });
  await tenant.change({ state: 'approved' });
  expect(
    await recordEvent(relaySql, tenant.first.principal, { ...event, sourceId: randomUUID() }),
  ).toEqual({ duplicate: true });
  expect(
    await sql`select * from delivery_events where message_id=${messageId} and type='complained'`,
  ).toHaveLength(9);
  expect(await sql`select * from suppressions where org_id=${tenant.orgId}`).toHaveLength(0);
  expect(
    (await sql`select state from sending_policies where org_id=${tenant.orgId}`)[0]?.state,
  ).toBe('approved');
  expect(
    await sql`select * from event_outbox where org_id=${tenant.orgId} and type='email.complained'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from event_outbox where org_id=${tenant.orgId} and type='suppression.created'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from audit_logs where org_id=${tenant.orgId} and action='operator.sending_policy.auto_suspended'`,
  ).toHaveLength(1);
  expect(
    await sql`select * from audit_logs where org_id=${tenant.orgId} and action='operator.suppression.restored'`,
  ).toHaveLength(1);
});

it('serializes SES invalidation with in-flight attempt admission and blocks later attempts after its commit', async () => {
  const tenant = await fixture();
  const sesConfig: NamedTransportConfig = {
    id: 'policy-ses-race',
    kind: 'ses',
    server_id: 'fixture-aws-account',
    pool_id: 'customer-transactional',
    credential_version: 'fixture-v1',
    region: 'us-east-1',
    configuration_set: 'fixture',
    access_key_id_env: 'SES_RACE_ACCESS',
    secret_access_key_env: 'SES_RACE_SECRET',
    sns_topic_arn: 'arn:aws:sns:us-east-1:123456789012:fixture',
  };
  vi.stubEnv('SES_RACE_ACCESS', 'fixture-access');
  vi.stubEnv('SES_RACE_SECRET', 'fixture-secret');
  vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([sesConfig]));
  const refreshSql = connectDatabase(url, { max: 1 }).client;
  refreshSql.options.onnotice = () => undefined;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let insideAttempt: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    insideAttempt = resolve;
  });
  let armed = false,
    tlsChecks = 0;
  // Provider responses are simulated; only PostgreSQL concurrency is certified here.
  const send = vi.fn(async (message: { to: string[] }) => ({
    accepted: message.to,
    rejected: [],
    ids: Object.fromEntries(message.to.map((recipient) => [recipient, 'fixture-provider-id'])),
  }));
  const transport: TransportAdapter = {
    name: 'ses',
    instance: transportInstanceIdentity(sesConfig),
    sandbox: false,
    send,
    async supportsRequiredTls() {
      if (armed && ++tlsChecks === 2) {
        insideAttempt();
        await gate;
      }
      return true;
    },
  };
  let delivery: Promise<void> | undefined;
  let refresh: Promise<number> | undefined;
  try {
    await refreshSql`set application_name='flare-ses-readiness-race'`;
    await tenant.change({
      route_bindings: { transactional: { id: await registerRoute([transport]), revision: 1 } },
    });
    const production = await productionFixture(
      tenant,
      { ...options, transports: [transport] },
      sesConfig.id,
      async (_config, domain) => {
        const checkedAt = new Date().toISOString();
        return {
          status: 'verified',
          checked_at: checkedAt,
          evidence: {
            identity_verified: true,
            mail_from_domain: `bounce.${domain}`,
            status: 'SUCCESS',
            behavior_on_mx_failure: 'REJECT_MESSAGE',
            checked_at: checkedAt,
          },
        };
      },
    );
    await sql`update domains set enforce_tls=true where id=${production.domainId}`;
    const ids = [];
    for (const subject of ['Before invalidation boundary', 'After invalidation boundary'])
      ids.push(
        (
          await submitEmails(production.options, production.principal, [
            { ...input(subject), from: production.from },
          ])
        ).data[0]!.id,
      );
    armed = true;
    delivery = deliverEmail(production.options, ids[0]!);
    void delivery.catch(() => undefined);
    await Promise.race([
      entered,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error('Delivery did not reach its admission transaction')),
          5000,
        );
        timer.unref();
      }),
    ]);
    refresh = refreshSesReadiness(refreshSql, async () => ({
      status: 'temporary_failure',
      checked_at: new Date().toISOString(),
      evidence: null,
    }));
    void refresh.catch(() => undefined);
    // The old code commits the outage here while admission still holds its lock.
    // Require observable database lock contention, not a timing-only sleep.
    await expect
      .poll(
        async () =>
          Boolean(
            (
              await sql`select exists(select 1 from pg_stat_activity where application_name='flare-ses-readiness-race' and wait_event_type='Lock' and wait_event='advisory') as blocked`
            )[0]!.blocked,
          ),
        { timeout: 5000 },
      )
      .toBe(true);
    expect(
      (
        await sql`select evidence from domain_transport_readiness where domain_id=${production.domainId}`
      )[0]!.evidence.ses,
    ).toBeDefined();
    release();
    await delivery;
    expect(await refresh).toBe(1);
    expect(
      (
        await sql`select evidence from domain_transport_readiness where domain_id=${production.domainId}`
      )[0]!.evidence.ses,
    ).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await sql`select status from transport_attempts where message_id=${ids[0]!}`).toEqual([
      { status: 'accepted' },
    ]);
    // The attempt already holding the policy lock may win before invalidation.
    // A later attempt must observe the committed invalidation and remain held.
    await deliverEmail(production.options, ids[1]!);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await sql`select * from transport_attempts where message_id=${ids[1]!}`).toHaveLength(0);
    expect(
      (await sql`select status,hold_reason from messages where id=${ids[1]!}`)[0],
    ).toMatchObject({ status: 'held', hold_reason: 'sender_not_ready' });
  } finally {
    release();
    await Promise.allSettled([delivery, refresh]);
    await refreshSql.end({ timeout: 5 });
    vi.stubEnv('MAIL_TRANSPORTS', JSON.stringify([config]));
  }
});
