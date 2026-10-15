import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { connectDatabase } from '@flare/db';
import { hashToken } from '@flare/shared';
import type { Principal } from '@flare/shared';
import {
  configuredTransports,
  createMailRoute,
  generateDomain,
  objectStore,
  recoverDeliveries,
  submitEmails,
  updateSendingPolicy,
} from '@flare/mail';
import type { NamedTransportConfig, PipelineOptions } from '@flare/mail';
import { listDeadLetters, redriveDeadLetter } from '@flare/platform';
import { startMailWorker } from '../src/mail.js';

import { integrationTargets } from './targets.mjs';
const { databaseUrl, redisUrl } = integrationTargets();
const sql = connectDatabase(databaseUrl, { max: 5 }).client;
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
const key = randomBytes(32).toString('base64');
const orgId = randomUUID(),
  environmentId = randomUUID();
const actor = { actorId: randomUUID(), sessionId: randomUUID(), authorize: async () => undefined };
const principal: Principal = {
  orgId,
  environmentId,
  actorId: randomUUID(),
  kind: 'api_key',
  permission: 'sending_access',
  role: 'developer',
  production: false,
};
const operator: Principal = {
  ...principal,
  actorId: actor.actorId,
  kind: 'session',
  role: 'owner',
  permission: 'full_access',
};
const config: NamedTransportConfig = {
  id: 'crash-mailpit',
  kind: 'smtp',
  server_id: 'crash-fixture-mailpit',
  pool_id: 'customer-transactional',
  credential_version: 'fixture-v1',
  host: '127.0.0.1',
  port: 11025,
  secure: false,
  delivery_tls_required: false,
};
const environment = {
  FLARE_EMAIL_CRASH_TEST: 'true',
  TEST_DATABASE_URL: databaseUrl,
  TEST_REDIS_URL: redisUrl,
  FLARE_ENCRYPTION_KEY: key,
  MAIL_SANDBOX: 'false',
  MAIL_TRANSPORTS: JSON.stringify([config]),
  S3_ENDPOINT: 'http://127.0.0.1:19000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'flare-test',
  S3_ACCESS_KEY: 'flare-test',
  S3_SECRET_KEY: 'local-test-only',
};
let options: PipelineOptions;
let child: ChildProcess | undefined;
let queue: Queue | undefined;
let worker: ReturnType<typeof startMailWorker> | undefined;
let mimeKey: string | undefined;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, timeout: number, label: string) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await pause(100);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await until(
    async () => child!.exitCode !== null || child!.signalCode !== null,
    5000,
    'crash child termination',
  );
}
beforeAll(async () => {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  sql.options.onnotice = () => undefined;
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await redis.connect();
  await redis.flushdb();
  await sql`insert into users(id,email,name) values(${actor.actorId},'crash-operator@example.net','Crash fixture operator')`;
  await sql`insert into sessions(id,user_id,expires_at) values(${actor.sessionId},${actor.actorId},now()+interval '1 day')`;
  await sql`insert into organizations(id,name,slug) values(${orgId},'Email crash',${`email-crash-${orgId}`})`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development')`;
  await sql`insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values(${principal.actorId},${orgId},${environmentId},'Crash credential',${hashToken(randomBytes(32).toString('hex'))},'fl_test','sending_access')`;
  const keys = generateDomain('example.com', `${orgId}/${environmentId}`, key);
  await sql`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher,next_check_at) values(${orgId},${environmentId},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher},now()+interval '1 day')`;
  options = {
    sql,
    encryptionKey: key,
    trackingKey: key,
    store: objectStore(),
    transports: configuredTransports(),
  };
  const route = await createMailRoute(
    sql,
    actor,
    {
      expected_revision: 0,
      name: 'Email crash fixture route',
      traffic_class: 'transactional',
      trust_tier: 'customer',
      critical: false,
      transport_instances: [config.id],
      physical_ips: ['8.8.4.4'],
      proof_reference: 'integration-fixture/not-live-provider-evidence',
      verified: true,
      reason: 'Fixture operator configures isolated Development crash test',
    },
    options.transports,
  );
  await updateSendingPolicy(sql, actor, orgId, {
    expected_revision: 0,
    state: 'approved',
    daily_limit: 10,
    per_minute_limit: 10,
    default_traffic_class: 'transactional',
    route_bindings: { transactional: { id: route.id, revision: 1 } },
    reason: 'Fixture operator approves isolated Development crash test',
  });
}, 30000);
afterAll(async () => {
  // Kill first, including assertion/timeout failures; the OS closes its database/SMTP sockets.
  try {
    await stopChild();
  } finally {
    try {
      await worker?.close();
    } finally {
      try {
        await queue?.close();
      } finally {
        try {
          if (mimeKey) await options.store.remove(mimeKey);
        } finally {
          redis.disconnect();
          await sql.end({ timeout: 5 });
          vi.unstubAllEnvs();
        }
      }
    }
  }
}, 15000);
it('quarantines actual SMTP acceptance after SIGKILL and real lease expiry without resending or releasing consumed quota', async () => {
  const subject = `Email crash ${randomUUID()}`;
  const request = {
    from: 'sender@example.com',
    to: ['reader@example.net'],
    subject,
    text: 'Disposable SMTP crash acceptance',
  };
  const accepted = await submitEmails(options, principal, [request], {
    key: 'crash-logical-operation',
  });
  const id = accepted.data[0]!.id;
  const [message] = await sql`select mime_key,sandbox from messages where id=${id}`;
  mimeKey = String(message!.mime_key);
  expect(message!.sandbox).toBe(false);
  expect((await options.store.get(mimeKey, 25 * 1024 * 1024)).toString()).toMatch(
    /^DKIM-Signature:/m,
  );
  child = fork(fileURLToPath(new URL('./email-crash-child.mjs', import.meta.url)), [id], {
    execArgv: [],
    env: environment,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let stage: unknown;
  child.on('message', (message: unknown) => {
    stage = message;
  });
  let spawnFailed = false;
  child.on('error', () => {
    spawnFailed = true;
  });
  await until(
    async () => Boolean(stage) || spawnFailed || child!.exitCode !== null,
    15000,
    'real SMTP acceptance before persistence',
  );
  expect(spawnFailed).toBe(false);
  expect(stage).toEqual({ stage: 'smtp-accepted' });
  await stopChild();
  expect(child.signalCode).toBe('SIGKILL');
  const [claimed] =
    await sql`select claim_id,lease_until::text as lease,extract(epoch from lease_until-now())::float as seconds from messages where id=${id}`;
  expect(claimed!.claim_id).not.toBeNull();
  expect(claimed!.seconds).toBeGreaterThan(100);
  expect(claimed!.seconds).toBeLessThanOrEqual(120);
  expect(
    await sql`select status,provider_ids from transport_attempts where message_id=${id}`,
  ).toEqual([{ status: 'started', provider_ids: {} }]);
  const quota =
    await sql`select recipient,state,consumed_at from sending_quota where message_id=${id}`;
  expect(quota).toHaveLength(1);
  expect(quota[0]!.state).toBe('consumed');
  expect(quota[0]!.consumed_at).not.toBeNull();
  await recoverDeliveries(sql);
  expect(await sql`select lease_until::text as lease from messages where id=${id}`).toEqual([
    { lease: claimed!.lease },
  ]);
  expect(await sql`select status from transport_attempts where message_id=${id}`).toEqual([
    { status: 'started' },
  ]);
  // No fake clock or lease updates: PostgreSQL's real two-minute lease must expire.
  await until(
    async () =>
      Boolean(
        (await sql`select lease_until<now() as expired from messages where id=${id}`)[0]!.expired,
      ),
    125000,
    'actual delivery lease expiry',
  );
  await recoverDeliveries(sql);
  await recoverDeliveries(sql);
  queue = new Queue('email-delivery', { connection: redis });
  for (let restart = 0; restart < 2; restart++) {
    worker = startMailWorker(sql, redis, key, key);
    await worker.dispatch();
    const job = await queue.add(
      'deliver',
      { id },
      { jobId: id, removeOnComplete: false, removeOnFail: false },
    );
    await until(
      async () => (await job.getState()) === 'completed',
      5000,
      'stale queue replay after recovery',
    );
    await job.remove();
    await worker.close();
    worker = undefined;
  }
  expect(
    await sql`select status,claim_id,lease_until,redrives from messages where id=${id}`,
  ).toEqual([{ status: 'failed', claim_id: null, lease_until: null, redrives: 0 }]);
  const attempts =
    await sql`select status,finished_at from transport_attempts where message_id=${id}`;
  expect(attempts).toHaveLength(1);
  expect(attempts[0]!.status).toBe('ambiguous');
  expect(attempts[0]!.finished_at).not.toBeNull();
  expect(
    await sql`select recipient,state,consumed_at from sending_quota where message_id=${id}`,
  ).toEqual(quota);
  expect(
    await sql`select data from event_outbox where type='email.failed' and data->>'email_id'=${id}`,
  ).toEqual([{ data: { email_id: id, ambiguous: true } }]);
  expect(
    await sql`select id from event_outbox where type='email.sent' and data->>'email_id'=${id}`,
  ).toHaveLength(0);
  expect(
    (await listDeadLetters(sql, operator)).find((row: { id: string }) => row.id === id),
  ).toMatchObject({
    kind: 'email',
    redrivable: false,
  });
  await expect(redriveDeadLetter(sql, operator, 'email', id)).rejects.toMatchObject({
    status: 409,
    message: 'Ambiguous provider acceptance cannot be redriven',
  });
  expect(
    await submitEmails(options, principal, [request], { key: 'crash-logical-operation' }),
  ).toEqual(accepted);
  const response = await fetch('http://127.0.0.1:18025/api/v1/messages?limit=1000', {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.ok).toBe(true);
  const mailpit = (await response.json()) as { messages: { Subject: string }[] };
  expect(mailpit.messages.filter((item) => item.Subject === subject)).toHaveLength(1);
}, 165000);
