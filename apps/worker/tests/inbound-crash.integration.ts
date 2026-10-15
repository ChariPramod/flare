import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { connectDatabase } from '@flare/db';
import { generateDomain, objectStore } from '@flare/mail';
import { acceptInbound, forwardInbound, parseInbound } from '@flare/platform';
import { startInboundWorker } from '../src/inbound.js';
import { startMailWorker } from '../src/mail.js';
import { integrationTargets } from './targets.mjs';

const { databaseUrl, redisUrl } = integrationTargets();
const sql = connectDatabase(databaseUrl, { max: 5 }).client;
const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: null });
const encryptionKey = randomBytes(32).toString('base64');
const orgId = randomUUID(),
  environmentId = randomUUID(),
  domainId = randomUUID();
const prefix = `${orgId}/${environmentId}/`;
const fixtureObjects = new Set<string>();
const environment = {
  FLARE_INBOUND_CRASH_TEST: 'true',
  TEST_DATABASE_URL: databaseUrl,
  TEST_REDIS_URL: redisUrl,
  FLARE_ENCRYPTION_KEY: encryptionKey,
  MAIL_SANDBOX: 'true',
  MAIL_TRANSPORTS: '',
  TRANSPORT: 'smtp',
  TRANSPORT_PRIORITY: '',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '11025',
  S3_ENDPOINT: 'http://127.0.0.1:19000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'flare-test',
  S3_ACCESS_KEY: 'flare-test',
  S3_SECRET_KEY: 'local-test-only',
};
let child: ChildProcess | undefined;
let inboundWorker: ReturnType<typeof startInboundWorker> | undefined;
let mailWorker: ReturnType<typeof startMailWorker> | undefined;
let inboundQueue: Queue | undefined;
let mailQueue: Queue | undefined;
let store: ReturnType<typeof objectStore>;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, label: string, timeout = 15000) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await pause(50);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${label}`);
}
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGKILL');
  await until(
    async () => child!.exitCode !== null || child!.signalCode !== null,
    'inbound crash child termination',
    5000,
  );
}
async function pauseBeforeCommit(mode: 'parse' | 'forward', id: string) {
  child = fork(fileURLToPath(new URL('./inbound-crash-child.mjs', import.meta.url)), [mode, id], {
    execArgv: [],
    env: environment,
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  let stage: unknown;
  let failed = false;
  child.on('error', () => {
    failed = true;
  });
  child.on('message', (value: unknown) => {
    const message = value as { stage?: string; key?: string };
    if (message.stage === 'object-written') {
      if (typeof message.key !== 'string' || !message.key.startsWith(prefix)) failed = true;
      else fixtureObjects.add(message.key);
    } else stage = value;
  });
  await until(
    async () => Boolean(stage) || failed || child!.exitCode !== null || child!.signalCode !== null,
    `${mode} external writes before database commit`,
  );
  expect(failed).toBe(false);
  expect(stage).toEqual({ stage: 'before-commit' });
  expect(
    await sql`select state from pg_stat_activity where application_name='flare-inbound-crash-fixture'`,
  ).toEqual([{ state: 'idle in transaction' }]);
}
async function killAndAwaitRollback() {
  await stopChild();
  expect(child!.signalCode).toBe('SIGKILL');
  await until(
    async () =>
      (
        await sql`select pid from pg_stat_activity where application_name='flare-inbound-crash-fixture'`
      ).length === 0,
    'database rollback after real process death',
  );
}
async function removeFixtureObject(key: string) {
  if (!key.startsWith(prefix)) throw new Error('Refusing non-fixture object cleanup');
  await store.remove(key);
}
async function closeWorkers() {
  try {
    await inboundWorker?.close();
  } finally {
    inboundWorker = undefined;
    await mailWorker?.close();
    mailWorker = undefined;
  }
}
beforeAll(async () => {
  for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
  store = objectStore();
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
  await sql`insert into organizations(id,name,slug) values(${orgId},'Inbound crash',${`inbound-crash-${orgId}`})`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development')`;
  const keys = generateDomain('example.com', `${orgId}/${environmentId}`, encryptionKey);
  await sql`insert into domains(id,org_id,environment_id,name,status,receiving,checked_at,records,dkim_selector,dkim_public,dkim_private_cipher,next_check_at) values(${domainId},${orgId},${environmentId},'example.com','verified',true,now(),${sql.json([{ purpose: 'receiving', type: 'MX', name: 'example.com', value: 'postal.example.com', status: 'verified' }])},${keys.selector},${keys.publicKey},${keys.cipher},now()+interval '1 day')`;
  await sql`insert into forwarding_rules(org_id,environment_id,domain_id,sender,destinations) values(${orgId},${environmentId},${domainId},'forward@example.com',${sql.json(['forwarded@example.net'])})`;
}, 30000);
afterAll(async () => {
  try {
    await stopChild();
  } finally {
    try {
      await closeWorkers();
    } finally {
      try {
        await inboundQueue?.close();
        await mailQueue?.close();
      } finally {
        try {
          // SIGKILL cannot run production catch/finally cleanup. Enumerate only
          // fixture-owned reported objects and committed references, never bucket-wide deletes.
          const rows = await sql`select raw_key as key from inbound_messages where org_id=${orgId}
            union all select body_key as key from inbound_messages where org_id=${orgId} and body_key is not null
            union all select object_key as key from inbound_attachments where org_id=${orgId}
            union all select mime_key as key from messages where org_id=${orgId} and mime_key is not null
            union all select attachment->>'key' as key from messages cross join lateral jsonb_array_elements(request->'attachments') attachment where org_id=${orgId}`;
          for (const row of rows) fixtureObjects.add(String(row.key));
          for (const key of fixtureObjects) await removeFixtureObject(key);
        } finally {
          redis.disconnect();
          await sql.end({ timeout: 5 });
          vi.unstubAllEnvs();
        }
      }
    }
  }
}, 20000);
it('recovers SIGKILL during inbound parsing and forwarding with transaction rollback, Redis loss and one logical delivery', async () => {
  const subject = `Inbound crash ${randomUUID()}`;
  const attachment = Buffer.from('Fixture attachment survives process death.');
  const raw = Buffer.from(
    [
      'From: Original Sender <sender@example.net>',
      'To: visible@example.com',
      'Bcc: hidden@example.net',
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="inbound-crash"',
      '',
      '--inbound-crash',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Crash recovery body.',
      '--inbound-crash',
      'Content-Type: application/octet-stream',
      'Content-Disposition: attachment; filename="fixture.bin"',
      'Content-Transfer-Encoding: base64',
      '',
      attachment.toString('base64'),
      '--inbound-crash--',
      '',
    ].join('\r\n'),
  );
  const submission = {
    id: `postal-${randomUUID()}`,
    mail_from: 'sender@example.net',
    rcpt_to: 'support@example.com',
    message: raw.toString('base64'),
    base64: true,
    size: raw.length,
  };
  const accepted = await acceptInbound(sql, store, domainId, submission);
  const id = accepted.id;
  const [receipt] =
    await sql`select raw_key,content_hash,created_at,next_attempt_at from inbound_messages where id=${id}`;
  expect(await store.get(String(receipt!.raw_key), 1024 * 1024)).toEqual(raw);
  await pauseBeforeCommit('parse', id);
  expect(fixtureObjects.size).toBe(2); // Real parsed attachment and body exist before commit.
  expect(await sql`select status,attempts,body_key from inbound_messages where id=${id}`).toEqual([
    { status: 'pending', attempts: 0, body_key: null },
  ]);
  expect(await sql`select id from inbound_attachments where inbound_id=${id}`).toHaveLength(0);
  // A concurrent parser must skip the live transaction's row lock, without waiting or duplicating work.
  await parseInbound(sql, store, id);
  expect(await sql`select id from inbound_attempts where inbound_id=${id}`).toHaveLength(0);
  await killAndAwaitRollback();
  expect(
    await sql`select raw_key,content_hash,created_at,next_attempt_at from inbound_messages where id=${id}`,
  ).toEqual([receipt]);
  await redis.flushdb();
  inboundWorker = startInboundWorker(sql, redis, encryptionKey, encryptionKey);
  await inboundWorker.dispatch();
  await until(
    async () =>
      (await sql`select status from inbound_messages where id=${id}`)[0]?.status === 'parsed',
    'durable parse recovery',
  );
  await closeWorkers();
  expect(await sql`select status,ordinal from inbound_attempts where inbound_id=${id}`).toEqual([
    { status: 'parsed', ordinal: 1 },
  ]);
  const files =
    await sql`select filename,size,object_key from inbound_attachments where inbound_id=${id}`;
  expect(files).toHaveLength(1);
  expect(files[0]).toMatchObject({ filename: 'fixture.bin', size: attachment.length });
  expect(await store.get(String(files[0]!.object_key), 1024)).toEqual(attachment);
  const [parsed] = await sql`select body_key,headers,rcpt_to from inbound_messages where id=${id}`;
  expect(parsed!.rcpt_to).toBe('support@example.com');
  expect(
    parsed!.headers.some((header: { key: string }) => header.key.toLowerCase() === 'bcc'),
  ).toBe(false);
  const body = JSON.parse((await store.get(String(parsed!.body_key), 1024 * 1024)).toString());
  expect(body).toMatchObject({ text: 'Crash recovery body.', reply_to: ['sender@example.net'] });
  const [forward] =
    await sql`select id,status,attempts,next_attempt_at from inbound_forwards where inbound_id=${id}`;
  expect(forward).toMatchObject({ status: 'pending', attempts: 0 });
  await pauseBeforeCommit('forward', String(forward!.id));
  expect(fixtureObjects.size).toBe(4); // Additional outbound attachment + final signed MIME.
  expect(await sql`select id from messages where org_id=${orgId}`).toHaveLength(0);
  // Forwarding shares submitEmails' transaction; a concurrent forward skips its row lock.
  const { configuredTransports } = await import('@flare/mail');
  await forwardInbound(
    { sql, store, transports: configuredTransports(), encryptionKey, trackingKey: encryptionKey },
    String(forward!.id),
  );
  await killAndAwaitRollback();
  expect(
    await sql`select id,status,attempts,next_attempt_at from inbound_forwards where inbound_id=${id}`,
  ).toEqual([forward]);
  expect(
    await sql`select id from event_outbox where type='email.queued' and org_id=${orgId}`,
  ).toHaveLength(0);
  await redis.flushdb();
  inboundWorker = startInboundWorker(sql, redis, encryptionKey, encryptionKey);
  await inboundWorker.dispatch();
  await until(
    async () =>
      (await sql`select status from inbound_forwards where id=${forward!.id}`)[0]?.status ===
      'submitted',
    'durable forwarding recovery',
  );
  await closeWorkers();
  const [submitted] =
    await sql`select message_id,attempts,status from inbound_forwards where id=${forward!.id}`;
  expect(submitted).toMatchObject({ attempts: 1, status: 'submitted' });
  const messageId = String(submitted!.message_id);
  const [outbound] = await sql`select request,mime_key from messages where id=${messageId}`;
  expect(outbound!.request.reply_to).toEqual(['sender@example.net']);
  expect(outbound!.request.attachments).toHaveLength(1);
  const mime = (await store.get(String(outbound!.mime_key), 1024 * 1024)).toString();
  expect(mime).toMatch(/^DKIM-Signature:/m);
  expect(mime).toContain(`X-Flare-Forwarded: ${forward!.id}`);
  expect(mime).not.toMatch(/^Bcc:/im);
  expect(mime).toMatch(/^Reply-To: sender@example.net\r?$/m);
  expect(await store.get(String(outbound!.request.attachments[0].key), 1024)).toEqual(attachment);
  mailWorker = startMailWorker(sql, redis, encryptionKey, encryptionKey);
  await mailWorker.dispatch();
  await until(
    async () =>
      Boolean(
        (await sql`select delivery_finished_at from messages where id=${messageId}`)[0]
          ?.delivery_finished_at,
      ),
    'forward delivery',
  );
  await closeWorkers();
  // Replay stale jobs after Redis loss, including terminal parse/forward/delivery work.
  await redis.flushdb();
  inboundQueue = new Queue('inbound', { connection: redis });
  mailQueue = new Queue('email-delivery', { connection: redis });
  for (let restart = 0; restart < 2; restart++) {
    inboundWorker = startInboundWorker(sql, redis, encryptionKey, encryptionKey);
    mailWorker = startMailWorker(sql, redis, encryptionKey, encryptionKey);
    const jobs = [
      await inboundQueue.add('parse', { id, kind: 'parse' }, { jobId: id }),
      await inboundQueue.add(
        'forward',
        { id: String(forward!.id), kind: 'forward' },
        { jobId: String(forward!.id) },
      ),
      await mailQueue.add('deliver', { id: messageId }, { jobId: messageId }),
    ];
    await inboundWorker.dispatch();
    await mailWorker.dispatch();
    await until(
      async () =>
        (await Promise.all(jobs.map((job) => job.getState()))).every(
          (state) => state === 'completed',
        ),
      'stale job replay after restart',
    );
    for (const job of jobs) await job.remove();
    await closeWorkers();
  }
  expect(await acceptInbound(sql, store, domainId, submission)).toEqual({
    id,
    status: 'parsed',
    duplicate: true,
  });
  expect(await sql`select id from inbound_attachments where inbound_id=${id}`).toHaveLength(1);
  expect(await sql`select id from inbound_attempts where inbound_id=${id}`).toHaveLength(1);
  expect(await sql`select id from inbound_forwards where inbound_id=${id}`).toHaveLength(1);
  expect(await sql`select id from messages where org_id=${orgId}`).toHaveLength(1);
  expect(await sql`select status from transport_attempts where message_id=${messageId}`).toEqual([
    { status: 'accepted' },
  ]);
  expect(
    await sql`select id from event_outbox where type='email.received' and data->>'inbound_id'=${id}`,
  ).toHaveLength(1);
  expect(
    await sql`select id from event_outbox where type='email.queued' and data->>'email_id'=${messageId}`,
  ).toHaveLength(1);
  expect(
    await sql`select id from event_outbox where type='email.sent' and data->>'email_id'=${messageId}`,
  ).toHaveLength(1);
  const response = await fetch('http://127.0.0.1:18025/api/v1/messages?limit=1000', {
    signal: AbortSignal.timeout(5000),
  });
  expect(response.ok).toBe(true);
  const mailpit = (await response.json()) as { messages: { Subject: string }[] };
  expect(mailpit.messages.filter((message) => message.Subject === subject)).toHaveLength(1);
}, 60000);
