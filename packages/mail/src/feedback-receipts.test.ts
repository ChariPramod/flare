import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '@flare/db';
import type { Sql } from '@flare/db';
import { recordEvent } from './events.js';
import type { DeliveryEvent } from './events.js';
import { restoreProtectedSuppression } from './sending-policy.js';

const tenant = { orgId: randomUUID(), environmentId: randomUUID() };
const domainId = randomUUID();
const actor = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  authorize: async () => undefined,
};
const recipient = 'reader@example.net';
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
  await sql`insert into organizations(id,name,slug) values(${tenant.orgId},'Receipt test','receipt-test')`;
  await sql`insert into environments(id,org_id,name) values(${tenant.environmentId},${tenant.orgId},'Production')`;
  await sql`insert into users(id,email,name) values(${actor.actorId},'operator@example.test','Receipt operator')`;
  await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${domainId},${tenant.orgId},${tenant.environmentId},'example.com','verified','fixture','fixture','fixture')`;
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,suppressions,soft_bounces,audit_logs,event_outbox cascade`;
  await sql`update sending_policies set revision=0,state='pending_review'`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function message(recipients = [recipient]) {
  const id = randomUUID();
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${id},${tenant.orgId},${tenant.environmentId},${domainId},'{}','sender@example.com','sent')`;
  for (const address of recipients)
    await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${tenant.orgId},${tenant.environmentId},${id},${address},'to','sent')`;
  return id;
}
async function restore(email = recipient) {
  const [policy] = await sql`select revision from sending_policies where org_id=${tenant.orgId}`;
  await restoreProtectedSuppression(sql, actor, tenant.orgId, {
    email,
    expected_revision: policy!.revision,
    reason: 'Operator reviewed original provider feedback and receiver evidence',
  });
}
it.each([
  { type: 'complained' as const },
  { type: 'bounced' as const, bounceClass: 'hard' as const },
])(
  'does not replay $type restrictions after audited restoration under a new callback ID',
  async (outcome) => {
    const event: DeliveryEvent = {
      ...outcome,
      source: 'sns:transactional',
      sourceId: 'first-receipt',
      messageId: await message(),
      recipient,
    };
    expect(await recordEvent(sql, tenant, event)).toEqual({ duplicate: false });
    await restore();
    const originalOutbox = await sql`select id from event_outbox order by id`;
    expect(await recordEvent(sql, tenant, { ...event, sourceId: 'new-receipt-id' })).toEqual({
      duplicate: true,
    });
    expect(await sql`select * from suppressions`).toHaveLength(0);
    expect(await sql`select id from event_outbox order by id`).toEqual(originalOutbox);
    expect(await sql`select * from delivery_events`).toHaveLength(2);
    expect(
      await sql`select * from audit_logs where action='operator.suppression.restored'`,
    ).toHaveLength(1);
    expect(await recordEvent(sql, tenant, event)).toEqual({ duplicate: true });
    expect(await sql`select * from delivery_events`).toHaveLength(2);
  },
);
it('retains classification upgrades and separate recipient/message outcomes', async () => {
  const secondRecipient = 'other@example.net';
  const messageId = await message([recipient, secondRecipient]);
  const event: DeliveryEvent = {
    source: 'postal:transactional',
    sourceId: 'unknown',
    messageId,
    recipient,
    type: 'bounced',
    bounceClass: 'unknown',
  };
  await recordEvent(sql, tenant, event);
  await restore();
  expect(
    await recordEvent(sql, tenant, { ...event, sourceId: 'hard', bounceClass: 'hard' }),
  ).toEqual({ duplicate: false });
  expect(await sql`select reason,protected from suppressions where address=${recipient}`).toEqual([
    { reason: 'hard_bounce', protected: true },
  ]);
  expect(
    await recordEvent(sql, tenant, {
      ...event,
      sourceId: 'other-recipient',
      recipient: secondRecipient,
      bounceClass: 'hard',
    }),
  ).toEqual({ duplicate: false });
  await restore();
  expect(
    await recordEvent(sql, tenant, {
      ...event,
      sourceId: 'other-message',
      messageId: await message(),
      bounceClass: 'hard',
    }),
  ).toEqual({ duplicate: false });
  expect(await sql`select * from suppressions`).toHaveLength(2);
  expect(await sql`select * from delivery_events`).toHaveLength(4);
  expect(await sql`select * from event_outbox where type='email.bounced'`).toHaveLength(4);
});
it('applies one logical outcome for concurrent fresh provider receipt IDs while retaining each receipt', async () => {
  const messageId = await message();
  const outcomes = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      recordEvent(sql, tenant, {
        source: 'sns:transactional',
        sourceId: `parallel-${index}`,
        messageId,
        recipient,
        type: 'complained',
      }),
    ),
  );
  expect(outcomes.filter((outcome) => !outcome.duplicate)).toHaveLength(1);
  expect(await sql`select * from delivery_events`).toHaveLength(5);
  expect(await sql`select * from event_outbox where type='email.complained'`).toHaveLength(1);
  expect(await sql`select * from event_outbox where type='suppression.created'`).toHaveLength(1);
});
