import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import { encrypt, webhookSecret, verifyWebhook } from '../../packages/shared/src/index.js';
import {
  fanOutEvents,
  deliverWebhook,
  recoverWebhooks,
  replayWebhook,
  mirrorEngineEvent,
} from '../../packages/platform/src/webhooks.js';
import { deliveryMetrics } from '../../packages/platform/src/metrics.js';
const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID(),
  endpoint = randomUUID(),
  key = randomBytes(32).toString('base64'),
  secret = webhookSecret();
const tenant = { orgId: org, environmentId: env };
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('set client_min_messages=error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$4,'Development')",
    [env, org, otherEnv, otherOrg],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
});
beforeEach(async () => {
  await sql`truncate webhook_attempts,webhook_deliveries,event_outbox,webhook_endpoints,operation_alerts,engine_events,domains cascade`;
  await sql`insert into webhook_endpoints(id,org_id,environment_id,name,url,events,secret_cipher) values(${endpoint},${org},${env},'Test','https://hooks.example.com',${sql.json(['email.*'])},${encrypt(secret, key, `${org}/${env}/webhook/${endpoint}`)})`;
});
afterAll(async () => {
  await sql.end();
  await server.stop();
  await db.close();
});
async function queued(type = 'email.sent') {
  const [event] =
    await sql`insert into event_outbox(org_id,environment_id,type,data) values(${org},${env},${type},${sql.json({ email_id: randomUUID() })}) returning id`;
  await fanOutEvents(sql);
  const [delivery] = await sql`select * from webhook_deliveries where event_id=${event!.id}`;
  return { event: event!, delivery };
}
describe('durable webhook delivery', () => {
  it('preserves database timestamp precision when selecting eligible endpoints', async () => {
    const later = randomUUID(),
      event = randomUUID();
    await sql`update webhook_endpoints set created_at='2026-01-01T00:00:00.123400Z' where id=${endpoint}`;
    await sql`insert into webhook_endpoints(id,org_id,environment_id,name,url,events,secret_cipher,created_at) values(${later},${org},${env},'Later','https://hooks.example.com',${sql.json(['email.*'])},'unused','2026-01-01T00:00:00.123600Z')`;
    await sql`insert into event_outbox(id,org_id,environment_id,type,data,created_at) values(${event},${org},${env},'email.sent','{}','2026-01-01T00:00:00.123500Z')`;
    expect(await fanOutEvents(sql)).toBe(1);
    expect(await sql`select endpoint_id from webhook_deliveries where event_id=${event}`).toEqual([
      { endpoint_id: endpoint },
    ]);
    expect(await fanOutEvents(sql)).toBe(0);
  });
  it('fans out once, filters events, and signs an immutable body', async () => {
    const { event, delivery } = await queued();
    expect(await fanOutEvents(sql)).toBe(0);
    let signed = '';
    await deliverWebhook(sql, key, String(delivery!.id), async (_url, body, headers) => {
      expect(verifyWebhook(secret, body, headers)).toMatchObject({
        id: event.id,
        type: 'email.sent',
      });
      signed = body;
      return { status: 204, excerpt: '' };
    });
    const [row] = await sql`select * from webhook_deliveries`;
    expect(row!.status).toBe('delivered');
    expect(row!.payload).toBe(signed);
    expect((await queued('domain.created')).delivery).toBeUndefined();
  });
  it('records eight failures with backoff, disables and alerts, then permits replay', async () => {
    const { delivery } = await queued();
    for (let i = 0; i < 8; i++) {
      await sql`update webhook_deliveries set next_attempt_at=now() where id=${delivery!.id}`;
      await deliverWebhook(sql, key, String(delivery!.id), async () => ({
        status: 503,
        excerpt: 'unavailable',
      }));
    }
    const [row] = await sql`select status,attempts from webhook_deliveries`;
    expect(row).toMatchObject({ status: 'failed', attempts: 8 });
    expect((await sql`select enabled from webhook_endpoints`)[0]!.enabled).toBe(false);
    expect((await sql`select * from operation_alerts`).length).toBe(1);
    await expect(replayWebhook(sql, tenant, String(delivery!.id))).rejects.toThrow('Re-enable');
    await sql`update webhook_endpoints set enabled=true`;
    await replayWebhook(sql, tenant, String(delivery!.id));
    await deliverWebhook(sql, key, String(delivery!.id), async () => ({
      status: 200,
      excerpt: 'ok',
    }));
    expect((await sql`select status,attempts,replays from webhook_deliveries`)[0]).toMatchObject({
      status: 'delivered',
      attempts: 9,
      replays: 1,
    });
  });
  it('claims once, rejects active replay, and recovers unknown outcomes without losing identity', async () => {
    const { delivery } = await queued();
    let calls = 0,
      release!: () => void,
      started!: () => void;
    const ready = new Promise<void>((resolve) => (started = resolve)),
      wait = new Promise<void>((resolve) => (release = resolve));
    const first = deliverWebhook(sql, key, String(delivery!.id), async () => {
      calls++;
      started();
      await wait;
      return { status: 200, excerpt: '' };
    });
    await ready;
    await deliverWebhook(sql, key, String(delivery!.id), async () => {
      calls++;
      return { status: 200, excerpt: '' };
    });
    await expect(replayWebhook(sql, tenant, String(delivery!.id))).rejects.toThrow('active');
    expect(calls).toBe(1);
    await sql`update webhook_deliveries set lease_until=now()-interval '1 second'`;
    await recoverWebhooks(sql);
    release();
    await first;
    expect((await sql`select status from webhook_deliveries`)[0]!.status).toBe('pending');
    expect((await sql`select error from webhook_attempts`)[0]!.error).toContain('unknown');
    await deliverWebhook(sql, key, String(delivery!.id), async (_url, body, headers) => {
      expect(headers['svix-id']).toBe(delivery!.event_id);
      expect(body).toBe(delivery!.payload);
      return { status: 200, excerpt: '' };
    });
    expect((await sql`select status from webhook_deliveries`)[0]!.status).toBe('delivered');
  });
  it('supports a two-signature rotation window', async () => {
    const replacement = webhookSecret();
    await sql`update webhook_endpoints set previous_secret_cipher=secret_cipher,previous_secret_until=now()+interval '1 hour',secret_cipher=${encrypt(replacement, key, `${org}/${env}/webhook/${endpoint}`)}`;
    const { delivery } = await queued();
    await deliverWebhook(sql, key, String(delivery!.id), async (_url, body, headers) => {
      expect(verifyWebhook(secret, body, headers)).toBeTruthy();
      expect(verifyWebhook(replacement, body, headers)).toBeTruthy();
      return { status: 200, excerpt: '' };
    });
  });
  it('proves tenant isolation and composite keys on endpoint/event/delivery relationships', async () => {
    const { event } = await queued();
    const foreign = { orgId: otherOrg, environmentId: otherEnv };
    expect(
      await withTenant(sql, foreign, (tx) => tx`select * from webhook_endpoints`),
    ).toHaveLength(0);
    expect(
      await withTenant(sql, foreign, (tx) => tx`select * from webhook_deliveries`),
    ).toHaveLength(0);
    await expect(
      withTenant(
        sql,
        foreign,
        (tx) =>
          tx`insert into webhook_deliveries(org_id,environment_id,endpoint_id,event_id,payload) values(${otherOrg},${otherEnv},${endpoint},${event.id},'{}')`,
      ),
    ).rejects.toThrow();
  });
  it('deduplicates authenticated engine event identities per environment', async () => {
    expect(
      await mirrorEngineEvent(sql, tenant, 'source-1', 'message.delivered', { channel: 'sms' }),
    ).toEqual({ duplicate: false });
    expect(
      await mirrorEngineEvent(sql, tenant, 'source-1', 'message.delivered', { channel: 'sms' }),
    ).toEqual({ duplicate: true });
    expect((await sql`select * from engine_events`).length).toBe(1);
  });
  it('returns honest empty metrics with null rates when the denominator is zero', async () => {
    const result = await deliveryMetrics(sql, tenant, {
      from: new Date(Date.now() - 86400000).toISOString(),
      to: new Date().toISOString(),
    });
    expect(result.totals.sent).toBe(0);
    expect(result.rates.bounce).toBeNull();
    expect(result.alerts).toEqual([]);
  });
});

it('calculates recipient delivery rates and unique human engagement without crossing tenants or filters', async () => {
  const domain = randomUUID(),
    one = randomUUID(),
    two = randomUUID();
  await sql`insert into domains(id,org_id,environment_id,name,dkim_selector,dkim_public,dkim_private_cipher) values(${domain},${org},${env},'metrics.example.test','test','test','test')`;
  for (const id of [one, two]) {
    await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${id},${org},${env},${domain},${sql.json({ tags: [{ name: 'workflow', value: 'welcome' }] })},'sender@metrics.example.test','sent')`;
    await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${org},${env},${id},'reader@example.test','to','sent')`;
  }
  await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${org},${env},${one},'bounced@example.test','cc','bounced'),(${org},${env},${two},'suppressed@example.test','bcc','suppressed')`;
  for (const [id, type, recipient, machine] of [
    [one, 'delivered', 'reader@example.test', false],
    [one, 'bounced', 'bounced@example.test', false],
    [one, 'complained', 'reader@example.test', false],
    [one, 'opened', null, false],
    [one, 'opened', null, false],
    [one, 'clicked', null, false],
    [two, 'opened', null, true],
    [two, 'clicked', null, true],
  ] as const)
    await sql`insert into delivery_events(org_id,environment_id,message_id,source,source_id,type,recipient,data) values(${org},${env},${id},'metrics',${randomUUID()},${type},${recipient},${sql.json({ machine })})`;
  const range = {
    from: new Date(Date.now() - 86400000).toISOString(),
    to: new Date(Date.now() + 1000).toISOString(),
  };
  const result = await deliveryMetrics(sql, tenant, range);
  expect(result.totals).toMatchObject({
    messages: 2,
    sent: 2,
    delivered: 1,
    sent_recipients: 3,
    delivered_recipients: 1,
    bounced: 1,
    complained: 1,
    opened: 1,
    clicked: 1,
    suppressed: 1,
  });
  expect(result.rates).toMatchObject({
    delivery: 1 / 3,
    bounce: 1 / 3,
    complaint: 1 / 3,
    open: 0.5,
    click: 0.5,
  });
  expect(result.alerts).toHaveLength(2);
  expect(
    (await deliveryMetrics(sql, tenant, { ...range, workflow: 'welcome', domain_id: domain }))
      .totals.sent,
  ).toBe(2);
  for (const filter of [
    { workflow: 'other' },
    { channel: 'sms' },
    { tag_name: 'workflow', tag_value: 'other' },
  ])
    expect((await deliveryMetrics(sql, tenant, { ...range, ...filter })).totals.sent).toBe(0);
  expect(
    (await deliveryMetrics(sql, { orgId: otherOrg, environmentId: otherEnv }, range)).totals.sent,
  ).toBe(0);
});
