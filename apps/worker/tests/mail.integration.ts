import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
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
  SmtpAdapter,
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
it('persists transient SMTP retries before failing over to Mailpit', async () => {
  let refusals = 0;
  const busy = createServer((socket) => {
    refusals++;
    socket.end('421 Try again later\r\n');
  });
  await new Promise<void>((resolve) => busy.listen(0, '127.0.0.1', resolve));
  try {
    const address = busy.address();
    if (!address || typeof address === 'string') throw new Error('Missing SMTP listener');
    const first = new SmtpAdapter({
      host: '127.0.0.1',
      port: address.port,
      secure: false,
      deliveryTlsRequired: false,
    });
    first.name = 'busy-smtp';
    const options = {
      sql,
      store: objectStore(),
      encryptionKey: key,
      trackingKey: key,
      transports: [first, ...configuredTransports()],
    };
    const subject = `SMTP failover ${randomUUID()}`;
    const id = (
      await submitEmails(options, principal, [
        { from: 'sender@example.com', to: 'retry@example.net', subject, text: 'Retry acceptance' },
      ])
    ).data[0]!.id;
    const deadline = Date.now() + 15000;
    let finished = false;
    do {
      await deliverEmail(options, id);
      const [state] = await sql`select delivery_finished_at from messages where id=${id}`;
      finished = Boolean(state!.delivery_finished_at);
      if (!finished) await new Promise((resolve) => setTimeout(resolve, 100));
    } while (!finished && Date.now() < deadline);
    expect(finished).toBe(true);
    expect(refusals).toBe(4);
    expect(
      (
        await sql`select provider,status from transport_attempts where message_id=${id} order by ordinal`
      ).map((attempt) => [attempt.provider, attempt.status]),
    ).toEqual([
      ['busy-smtp', 'transient_failure'],
      ['busy-smtp', 'transient_failure'],
      ['busy-smtp', 'transient_failure'],
      ['busy-smtp', 'transient_failure'],
      ['smtp', 'accepted'],
    ]);
    expect((await sql`select status from messages where id=${id}`)[0]!.status).toBe('sent');
    const mailpit = (await fetch('http://127.0.0.1:18025/api/v1/messages').then((r) =>
      r.json(),
    )) as {
      messages: { Subject: string }[];
    };
    expect(mailpit.messages.filter((message) => message.Subject === subject)).toHaveLength(1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      busy.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 20000);

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

it('resumes an automation wait after Redis loss without duplicating its prior email', async () => {
  const { createAutomationEvent, fanOutAutomationEvents, advanceAutomation } =
    await import('@flare/platform');
  const { startAutomationWorker } = await import('../src/automations.js');
  const template = randomUUID(),
    automation = randomUUID(),
    contact = randomUUID();
  await sql`insert into contacts(id,org_id,environment_id,email) values(${contact},${org},${env},'automation@example.net')`;
  await sql`insert into email_templates(id,org_id,environment_id,name,identifier) values(${template},${org},${env},'Automation','automation')`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${template},1,'Automation','<p>Welcome</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>')`;
  const definition = {
    trigger: 'signup',
    entry: 'send',
    steps: [
      {
        id: 'send',
        name: 'Send',
        type: 'send_email',
        from: 'sender@example.com',
        template_id: template,
        template_version: 1,
        next: 'wait',
      },
      { id: 'wait', name: 'Wait', type: 'wait', seconds: 3600, next: null },
    ],
  };
  await sql`insert into automations(id,org_id,environment_id,identifier,name,definition,enabled) values(${automation},${org},${env},'recovery','Recovery',${sql.json(definition)},true)`;
  await createAutomationEvent(sql, principal, {
    contact_id: contact,
    name: 'signup',
    external_id: randomUUID(),
  });
  await fanOutAutomationEvents(sql);
  const [run] = await sql`select id from automation_runs where automation_id=${automation}`;
  const id = String(run!.id);
  const options = {
    sql,
    store: objectStore(),
    transports: configuredTransports(),
    encryptionKey: key,
    trackingKey: key,
  };
  await Promise.all(Array.from({ length: 8 }, () => advanceAutomation(options, id)));
  await advanceAutomation(options, id);
  expect(await sql`select id from messages where automation_run_id=${id}`).toHaveLength(1);
  await worker?.close();
  worker = undefined;
  await redis.flushdb();
  await sql`update automation_steps set wake_at=now() where run_id=${id} and step_id='wait'`;
  await sql`update automation_runs set next_step_at=now() where id=${id}`;
  const automations = startAutomationWorker(sql, redis, key, key);
  try {
    await automations.dispatch();
    await expect
      .poll(
        async () =>
          String((await sql`select status from automation_runs where id=${id}`)[0]?.status),
        { timeout: 15000 },
      )
      .toBe('completed');
    expect(await sql`select id from messages where automation_run_id=${id}`).toHaveLength(1);
  } finally {
    await automations.close();
  }
});

it('deduplicates concurrent inbound receipts and recovers parsing and forwarding after Redis loss', async () => {
  const { acceptInbound, parseInbound } = await import('@flare/platform');
  const { startInboundWorker } = await import('../src/inbound.js');
  const [domain] =
    await sql`update domains set receiving=true where org_id=${org} and environment_id=${env} returning id`;
  const domainId = String(domain!.id),
    store = objectStore();
  await sql`insert into forwarding_rules(org_id,environment_id,domain_id,sender,destinations) values(${org},${env},${domainId},'forward@example.com',${sql.json(['inbound@example.net'])})`;
  const raw = Buffer.from(
    'From: sender@example.net\r\nTo: support@example.com\r\nSubject: Inbound recovery\r\n\r\nRecover this message.',
  );
  const body = {
    id: 'recovery',
    mail_from: 'sender@example.net',
    rcpt_to: 'support@example.com',
    message: raw.toString('base64'),
    base64: true,
    size: raw.length,
  };
  const accepted = await Promise.all(
    Array.from({ length: 8 }, () => acceptInbound(sql, store, domainId, body)),
  );
  expect(new Set(accepted.map((v) => v.id)).size).toBe(1);
  const id = accepted[0]!.id;
  await Promise.all(Array.from({ length: 8 }, () => parseInbound(sql, store, id)));
  expect(await sql`select id from inbound_attempts where inbound_id=${id}`).toHaveLength(1);
  await worker?.close();
  worker = undefined;
  await redis.flushdb();
  const incoming = startInboundWorker(sql, redis, key, key);
  try {
    await incoming.dispatch();
    await expect
      .poll(
        async () =>
          String(
            (await sql`select status from inbound_forwards where inbound_id=${id}`)[0]?.status,
          ),
        { timeout: 15000 },
      )
      .toBe('submitted');
    await incoming.dispatch();
    expect(
      await sql`select message_id from inbound_forwards where inbound_id=${id} and message_id is not null`,
    ).toHaveLength(1);
    expect(
      await sql`select id from event_outbox where type='email.received' and data->>'inbound_id'=${id}`,
    ).toHaveLength(1);
  } finally {
    await incoming.close();
  }
});

it('reconciles a publication after engine acceptance and Redis loss on real PostgreSQL', async () => {
  const { createServer } = await import('node:http');
  const { once } = await import('node:events');
  const { encrypt, workflowSchema } = await import('@flare/shared');
  const { createPublication, advancePublication, syncPublicationWorkflow, emptyDependencies } =
    await import('@flare/platform');
  const { startPublicationWorker } = await import('../src/publication.js');
  const production = randomUUID(),
    definition = workflowSchema.parse({
      workflowId: 'publish-recovery',
      name: 'Publish recovery',
      steps: [],
    });
  await sql`insert into environments(id,org_id,name,novu_key_cipher) values(${production},${org},'Production',${encrypt('integration-novu-key', key, `${org}/${production}`)})`;
  await sql`insert into workflows(org_id,environment_id,identifier,definition,source_definition) values(${org},${env},${definition.workflowId},${sql.json(definition)},${sql.json(definition)})`;
  let remote: unknown = null,
    writes = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') {
      res.statusCode = remote ? 200 : 404;
      res.end(JSON.stringify({ data: remote }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += String(chunk);
    remote = JSON.parse(body);
    writes++;
    res.end(JSON.stringify({ data: remote }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing listener');
  const url = `http://127.0.0.1:${address.port}`,
    oldUrl = process.env.NOVU_API_URL;
  process.env.NOVU_API_URL = url;
  const operation = await createPublication(
    sql,
    { ...principal, kind: 'session', role: 'owner' },
    { workflows: [definition.workflowId] },
  );
  await expect(
    advancePublication(sql, operation.id, async () => {
      await syncPublicationWorkflow(url, 'integration-novu-key', definition, emptyDependencies());
      throw new Error('simulated response loss');
    }),
  ).rejects.toThrow('simulated');
  await sql`update publication_items set next_attempt_at=now() where operation_id=${operation.id}`;
  await worker?.close();
  worker = undefined;
  await redis.flushdb();
  const publications = startPublicationWorker(sql, redis, key);
  try {
    await publications.dispatch();
    await expect
      .poll(
        async () =>
          String(
            (await sql`select status from publication_operations where id=${operation.id}`)[0]
              ?.status,
          ),
        { timeout: 15000 },
      )
      .toBe('completed');
    expect(writes).toBe(1);
  } finally {
    await publications.close();
    server.close();
    await once(server, 'close');
    if (oldUrl === undefined) delete process.env.NOVU_API_URL;
    else process.env.NOVU_API_URL = oldUrl;
  }
});

it('enforces atomic token buckets across concurrent clients and refills from the Redis clock', async () => {
  const { tokenBucket } = await import('@flare/platform');
  const bucket = randomUUID();
  const results = await Promise.all(
    Array.from({ length: 50 }, () => tokenBucket(redis, bucket, 0.01, 10)),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(10);
  const refillBucket = randomUUID();
  await Promise.all(Array.from({ length: 10 }, () => tokenBucket(redis, refillBucket, 10, 10)));
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect((await tokenBucket(redis, refillBucket, 10, 10)).allowed).toBe(true);
  expect((await tokenBucket(redis, randomUUID(), 10, 10)).remaining).toBe(9);
});
it('recovers workflow dispatch from Redis loss and serializes independent PostgreSQL claims', async () => {
  const { dispatchWorkflow } = await import('@flare/platform');
  const id = randomUUID();
  await sql`insert into workflow_runs(id,org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload) values(${id},${org},${env},'test',${id},${id},'{}')`;
  await redis.flushdb();
  let count = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      dispatchWorkflow(sql, id, async () => {
        count++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { kind: 'accepted' };
      }),
    ),
  );
  expect(count).toBe(1);
  expect((await sql`select status from workflow_runs where id=${id}`)[0]!.status).toBe('accepted');
});
