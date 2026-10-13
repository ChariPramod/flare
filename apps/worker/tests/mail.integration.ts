import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import {
  configuredTransports,
  objectStore,
  generateDomain,
  submitEmails,
  recordEvent,
  changeSchedule,
  deliverEmail,
} from '@flare/mail';
import { startMailWorker } from '../src/mail.js';
const url =
  process.env.TEST_DATABASE_URL ??
  'postgres://flare_test:local-test-only@127.0.0.1:15432/flare_test';
if (new URL(url).pathname !== '/flare_test')
  throw new Error('Integration tests require the disposable flare_test database');
const { client: sql } = connectDatabase(url);
const redis = new Redis(process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:16379/15', {
  maxRetriesPerRequest: null,
});
const key = randomBytes(32).toString('base64');
const org = randomUUID(),
  env = randomUUID();
const principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'api_key' as const,
  permission: 'full_access' as const,
  role: 'developer' as const,
  production: false,
};
let worker: ReturnType<typeof startMailWorker> | undefined;
beforeAll(async () => {
  Object.assign(process.env, {
    TRANSPORT: 'smtp',
    TRANSPORT_PRIORITY: '',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: '11025',
    S3_ENDPOINT: 'http://127.0.0.1:19000',
    S3_REGION: 'us-east-1',
    S3_BUCKET: 'flare-test',
    S3_ACCESS_KEY: 'flare-test',
    S3_SECRET_KEY: 'local-test-only',
  });
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await redis.flushdb();
  await sql`insert into organizations(id,name,slug) values(${org},'Integration','integration')`;
  await sql`insert into environments(id,org_id,name) values(${env},${org},'Development')`;
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await sql`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${org},${env},'example.com','verified',${keys.selector},${keys.publicKey},${keys.cipher})`;
});
afterAll(async () => {
  await worker?.close();
  await redis.quit();
  await sql.end();
});
it('serializes simultaneous idempotency keys across real PostgreSQL connections', async () => {
  const options = {
    sql,
    store: objectStore(),
    encryptionKey: key,
    trackingKey: key,
    transports: configuredTransports(),
  };
  const input = {
    from: 'sender@example.com',
    to: ['reader@example.net'],
    subject: 'Concurrency',
    text: 'hello',
    scheduled_at: 'in 2 hours',
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      submitEmails(options, principal, [input], { key: 'concurrent' }),
    ),
  );
  expect(new Set(results.map((result) => result.data[0]!.id)).size).toBe(1);
  await expect(
    submitEmails(options, principal, [{ ...input, subject: 'Conflict' }], { key: 'concurrent' }),
  ).rejects.toMatchObject({ status: 409 });
  await changeSchedule(sql, principal, results[0]!.data[0]!.id, null);
});
it('serializes cancel against a live delivery claim on independent connections', async () => {
  let started: () => void = () => undefined,
    release: () => void = () => undefined;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const options = {
    sql,
    store: objectStore(),
    encryptionKey: key,
    trackingKey: key,
    transports: [
      {
        name: 'test',
        supportsRequiredTls: async () => true,
        send: async (message: { to: string[] }) => {
          started();
          await wait;
          return { accepted: message.to, rejected: [], ids: {} };
        },
      },
    ],
  };
  const id = (
    await submitEmails(options, principal, [
      { from: 'sender@example.com', to: ['reader@example.net'], subject: 'Claim', text: 'hello' },
    ])
  ).data[0]!.id;
  const delivery = deliverEmail(options, id);
  await began;
  try {
    await expect(changeSchedule(sql, principal, id, null)).rejects.toMatchObject({ status: 409 });
  } finally {
    release();
    await delivery;
  }
});
it('recovers accepted messages after queue loss, sends through Mailpit, and records delivery separately', async () => {
  const store = objectStore();
  const options = {
    sql,
    store,
    encryptionKey: key,
    trackingKey: key,
    transports: configuredTransports(),
  };
  const result = await submitEmails(options, principal, [
    {
      from: 'sender@example.com',
      to: ['visible@example.net'],
      bcc: ['hidden@example.net'],
      subject: 'Flare integration',
      text: 'hello',
      attachments: [
        { filename: 'hello.txt', content: Buffer.from('attachment').toString('base64') },
      ],
    },
  ]);
  const id = result.data[0]!.id;
  await redis.flushdb(); // Simulates lost queue state after the database commit.
  worker = startMailWorker(sql, redis, key, key);
  await worker.dispatch();
  await worker.dispatch();
  await expect
    .poll(async () => String((await sql`select status from messages where id=${id}`)[0]?.status))
    .toBe('sent');
  expect(await sql`select * from transport_attempts where message_id=${id}`).toHaveLength(1);
  const [message] = await sql`select mime_key from messages where id=${id}`;
  const mime = await store.get(String(message!.mime_key), 25 * 1024 * 1024);
  expect(mime.toString()).toMatch(/^DKIM-Signature:/m);
  expect(mime.toString()).not.toContain('hidden@example.net');
  const mailpit = (await fetch('http://127.0.0.1:18025/api/v1/messages').then((r) => r.json())) as {
    messages: { Subject: string }[];
  };
  expect(mailpit.messages.some((m) => m.Subject === 'Flare integration')).toBe(true);
  await recordEvent(sql, principal, {
    source: 'integration',
    sourceId: randomUUID(),
    messageId: id,
    recipient: 'visible@example.net',
    type: 'delivered',
  });
  expect(
    (
      await sql`select status from message_recipients where message_id=${id} and address='visible@example.net'`
    )[0]!.status,
  ).toBe('delivered');
  expect(
    (
      await sql`select status from message_recipients where message_id=${id} and address='hidden@example.net'`
    )[0]!.status,
  ).toBe('sent');
});

it('serializes campaign chunks across PostgreSQL connections and resumes after queue loss', async () => {
  const { scheduleBroadcast, dispatchBroadcast } = await import('@flare/platform');
  const { startBroadcastWorker } = await import('../src/broadcasts.js');
  const template = randomUUID(),
    broadcast = randomUUID();
  await sql`insert into email_templates(id,org_id,environment_id,name,identifier) values(${template},${org},${env},'Campaign','campaign')`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${template},1,'Campaign','<p>News</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Unsubscribe</a>')`;
  await sql`insert into contacts(org_id,environment_id,email) values(${org},${env},'campaign-a@example.net'),(${org},${env},'campaign-b@example.net')`;
  await sql`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version,rate_per_second) values(${broadcast},${org},${env},'Recovery','sender@example.com',${template},1,1)`;
  await scheduleBroadcast(sql, principal, broadcast);
  const options = {
    sql,
    store: objectStore(),
    transports: configuredTransports(),
    encryptionKey: key,
    trackingKey: key,
  };
  await Promise.all(
    Array.from({ length: 8 }, () => dispatchBroadcast(options, broadcast, 'http://localhost:3000')),
  );
  expect(await sql`select id from messages where broadcast_id=${broadcast}`).toHaveLength(1);
  await worker?.close();
  worker = undefined;
  await redis.flushdb();
  await sql`update broadcasts set next_dispatch_at=now() where id=${broadcast}`;
  const campaigns = startBroadcastWorker(sql, redis, key, key);
  try {
    await campaigns.dispatch();
    await expect
      .poll(
        async () =>
          String((await sql`select status from broadcasts where id=${broadcast}`)[0]?.status),
        { timeout: 15000 },
      )
      .toBe('sent');
    expect(await sql`select id from messages where broadcast_id=${broadcast}`).toHaveLength(2);
    expect(
      (
        await sql`select count(distinct message_id)::int as n from broadcast_recipients where broadcast_id=${broadcast}`
      )[0]!.n,
    ).toBe(2);
  } finally {
    await campaigns.close();
  }
});
