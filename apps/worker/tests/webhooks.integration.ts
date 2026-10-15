import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { encrypt, webhookSecret, verifyWebhook } from '@flare/shared';
import { deliverWebhook, fanOutEvents } from '@flare/platform';
import { startWebhookWorker } from '../src/webhooks.js';
import { integrationTargets } from './targets.mjs';
const { databaseUrl: url, redisUrl } = integrationTargets();
const sql = connectDatabase(url).client;
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const key = randomBytes(32).toString('base64'),
  secret = webhookSecret(),
  org = randomUUID(),
  env = randomUUID(),
  endpoint = randomUUID();
const received: { id: string; body: string }[] = [];
const server = createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += String(chunk);
  try {
    verifyWebhook(secret, body, req.headers as Record<string, string>);
    received.push({ id: String(req.headers['svix-id']), body });
    res.writeHead(received.length === 1 ? 503 : 204).end();
  } catch {
    res.writeHead(401).end();
  }
});
let worker: ReturnType<typeof startWebhookWorker> | undefined;
const previousAllowed = process.env.WEBHOOK_ALLOWED_ORIGINS;
beforeAll(async () => {
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((f) => f.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await redis.flushdb();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const destination = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.WEBHOOK_ALLOWED_ORIGINS = destination;
  await sql`insert into organizations(id,name,slug) values(${org},'Webhook integration','webhook-integration')`;
  await sql`insert into environments(id,org_id,name) values(${env},${org},'Development')`;
  await sql`insert into webhook_endpoints(id,org_id,environment_id,name,url,secret_cipher) values(${endpoint},${org},${env},'Receiver',${destination},${encrypt(secret, key, `${org}/${env}/webhook/${endpoint}`)})`;
});
afterAll(async () => {
  await worker?.close();
  await redis.quit();
  await sql.end();
  server.close();
  await once(server, 'close');
  if (previousAllowed === undefined) delete process.env.WEBHOOK_ALLOWED_ORIGINS;
  else process.env.WEBHOOK_ALLOWED_ORIGINS = previousAllowed;
});
async function queueEvent() {
  const [event] =
    await sql`insert into event_outbox(org_id,environment_id,type,data) values(${org},${env},'email.sent','{}') returning id`;
  await fanOutEvents(sql);
  return (await sql`select * from webhook_deliveries where event_id=${event!.id}`)[0]!;
}
it('takes one delivery claim across concurrent PostgreSQL connections', async () => {
  const delivery = await queueEvent();
  let calls = 0;
  await Promise.all(
    Array.from({ length: 8 }, () =>
      deliverWebhook(sql, key, String(delivery.id), async () => {
        calls++;
        return { status: 204, excerpt: '' };
      }),
    ),
  );
  expect(calls).toBe(1);
  expect(
    (await sql`select attempts,status from webhook_deliveries where id=${delivery.id}`)[0],
  ).toMatchObject({ attempts: 1, status: 'delivered' });
});
it('reconstructs queue work from PostgreSQL after Redis loss, retries and keeps the signed event identity', async () => {
  const delivery = await queueEvent();
  await redis.flushdb();
  worker = startWebhookWorker(sql, redis, key);
  await worker.dispatch();
  await expect
    .poll(
      async () =>
        String(
          (
            await sql`select status_code from webhook_attempts where delivery_id=${delivery.id} and ordinal=1`
          )[0]?.status_code,
        ),
      { timeout: 15000 },
    )
    .toBe('503');
  await worker.close();
  worker = undefined;
  await redis.flushdb();
  await sql`update webhook_deliveries set next_attempt_at=now() where id=${delivery.id}`;
  worker = startWebhookWorker(sql, redis, key);
  await worker.dispatch();
  await expect
    .poll(
      async () =>
        String(
          (await sql`select status from webhook_deliveries where id=${delivery.id}`)[0]?.status,
        ),
      { timeout: 15000 },
    )
    .toBe('delivered');
  expect(received).toHaveLength(2);
  expect(received[0]).toEqual(received[1]);
  expect(
    (await sql`select attempts from webhook_deliveries where id=${delivery.id}`)[0]!.attempts,
  ).toBe(2);
});
