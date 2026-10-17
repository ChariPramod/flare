import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase, withTenant } from '../../db/src/index.js';
import type { Sql } from '../../db/src/index.js';
import type { Principal } from '../../shared/src/index.js';
import { prepareDispatchPolicy } from './dispatch-policy.js';
import type { DispatchPolicyMessage } from './dispatch-policy.js';
import { reserveSendingQuota, sendingAdmission } from './sending-policy.js';

const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID(),
  domain = randomUUID(),
  key = randomUUID(),
  foreignKey = randomUUID();
const tenant = { orgId: org, environmentId: env };
const principal: Principal = {
  ...tenant,
  actorId: key,
  kind: 'api_key',
  role: 'developer',
  production: true,
};
const route = {
  id: randomUUID(),
  revision: 1,
  traffic_class: 'transactional',
  trust_tier: 'customer',
  critical: false,
  physical_ips: ['1.1.1.1'],
  instances: [
    {
      id: 'test-postal',
      kind: 'postal',
      server_id: 'server',
      pool_id: 'pool',
      credential_version: 'v1',
      config_fingerprint: 'a'.repeat(64),
    },
  ],
};
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((name) => name.endsWith('.sql') && !name.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Dispatch A','dispatch-a'),($2,'Dispatch B','dispatch-b')",
    [org, otherOrg],
  );
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Production'),($3,$4,'Production')",
    [env, org, otherEnv, otherOrg],
  );
  await db.query(
    "insert into domains(id,org_id,environment_id,name,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,$3,'example.com','flare','test','test')",
    [domain, org, env],
  );
  for (const [id, organization, environment] of [
    [key, org, env],
    [foreignKey, otherOrg, otherEnv],
  ])
    await db.query(
      "insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values($1,$2,$3,'Dispatch key',$4,'fl_test','sending_access')",
      [id, organization, environment, id],
    );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connection();
}, 30000);
function connection() {
  const client = connectDatabase(
    `postgres://postgres:postgres@${server.getServerConn()}/postgres`,
    { max: 1 },
  ).client;
  client.options.onnotice = () => undefined;
  return client;
}
beforeEach(async () => {
  await sql`truncate messages,suppressions,event_outbox cascade`;
  await sql`update sending_policies set state='approved',daily_limit=100,per_minute_limit=10,marketing_enabled=false,default_traffic_class='transactional',trust_tier='customer'`;
  await sql`update api_keys set revoked_at=null,critical_sending=false,mail_traffic_class=null`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function message(count = 1): Promise<{ data: DispatchPolicyMessage; recipients: string[] }> {
  const id = randomUUID(),
    recipients = Array.from({ length: count }, (_, i) => `reader-${i}@example.net`);
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status,submitting_key_id,traffic_class,route_snapshot) values(${id},${org},${env},${domain},'{}','sender@example.com','queued',${key},'transactional',${sql.json(route)})`;
  for (const recipient of recipients)
    await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind) values(${org},${env},${id},${recipient},'to')`;
  return {
    data: {
      id,
      sandbox: false,
      traffic_class: 'transactional',
      submitting_key_id: key,
      route_snapshot: route,
    },
    recipients,
  };
}
const dispatch = (item: Awaited<ReturnType<typeof message>>, options = {}) =>
  withTenant(sql, tenant, (tx) =>
    prepareDispatchPolicy(tx, tenant, item.data, item.recipients, options),
  );

it('splits fifty queued recipients into bounded dispatches and durably waits for minute capacity', async () => {
  const item = await message(50);
  const first = await dispatch(item);
  expect(first.recipients).toHaveLength(10);
  expect(await sql`select state from sending_quota`).toHaveLength(10);
  const held = await dispatch(item);
  expect(held).toMatchObject({ recipients: [], holdReason: 'sending_rate_limited' });
  expect(held.retryAfter).toBeGreaterThan(0);
  expect(held.retryAfter).toBeLessThanOrEqual(60);
  await sql`update message_recipients set status='sent' where message_id=${item.data.id} and address in ${sql(first.recipients)}`;
  await sql`update sending_dispatches set created_at=now()-interval '61 seconds'`;
  const next = await dispatch(item);
  expect(next.recipients).toHaveLength(10);
  expect(next.recipients.some((recipient) => first.recipients.includes(recipient))).toBe(false);
  expect(await sql`select * from sending_quota`).toHaveLength(20);
});
it('counts network retry pacing on every attempt while logical recipients and consumption time stay unique', async () => {
  const item = await message(2);
  await dispatch(item);
  const before = await sql`select recipient,consumed_at from sending_quota order by recipient`;
  await dispatch(item);
  expect(await sql`select recipient,consumed_at from sending_quota order by recipient`).toEqual(
    before,
  );
  expect((await sql`select sum(recipients)::int as n from sending_dispatches`)[0]?.n).toBe(4);
  expect(await sql`select * from sending_dispatches`).toHaveLength(2);
});
it('timestamps recipient consumption and dispatch capacity when work is admitted, not when its transaction began', async () => {
  const item = await message();
  await withTenant(sql, tenant, async (tx) => {
    // A transaction may have spent time waiting on policy, suppression or
    // credential locks before it can admit a transport attempt.
    const [boundary] = await tx`select clock_timestamp()::text as admitted_after`;
    expect(
      (await prepareDispatchPolicy(tx, tenant, item.data, item.recipients)).recipients,
    ).toEqual(item.recipients);
    expect(
      await tx`select created_at>=${boundary!.admitted_after}::timestamptz as current from sending_dispatches where message_id=${item.data.id}`,
    ).toEqual([{ current: true }]);
    expect(
      await tx`select consumed_at>=${boundary!.admitted_after}::timestamptz as current from sending_quota where message_id=${item.data.id}`,
    ).toEqual([{ current: true }]);
  });
});
it.each(['minute', 'daily'] as const)(
  'releases expired %s usage using the current admission time inside an older transaction',
  async (window) => {
    const previous = await message();
    await dispatch(previous);
    await sql`update sending_policies set daily_limit=1,per_minute_limit=1 where org_id=${org}`;
    const next = await message();
    await withTenant(sql, tenant, async (tx) => {
      // Put the historical boundary strictly after transaction start and before
      // admission. now() would still count that expired usage in this transaction.
      if (window === 'minute') {
        await tx`update sending_dispatches set created_at=clock_timestamp()-interval '60 seconds' where message_id=${previous.data.id}`;
        await tx`update sending_quota set consumed_at=clock_timestamp()-interval '25 hours' where message_id=${previous.data.id}`;
      } else {
        await tx`update sending_dispatches set created_at=clock_timestamp()-interval '61 seconds' where message_id=${previous.data.id}`;
        await tx`update sending_quota set consumed_at=clock_timestamp()-interval '24 hours' where message_id=${previous.data.id}`;
      }
      expect(
        (await prepareDispatchPolicy(tx, tenant, next.data, next.recipients)).recipients,
      ).toEqual(next.recipients);
    });
  },
);
it('preserves quota and pacing across a fresh database connection', async () => {
  const item = await message(10);
  await dispatch(item);
  await sql.end();
  sql = connection();
  expect(await dispatch(item)).toMatchObject({
    recipients: [],
    holdReason: 'sending_rate_limited',
  });
  expect(await sql`select * from sending_dispatches`).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(10);
});
it('serializes organization pacing across different messages and cannot overrun one minute allowance', async () => {
  const first = await message(6),
    second = await message(6);
  const results = await Promise.all([dispatch(first), dispatch(second)]);
  expect(results.reduce((count, result) => count + result.recipients.length, 0)).toBe(10);
  expect((await sql`select sum(recipients)::int as n from sending_dispatches`)[0]?.n).toBe(10);
});
it('charges neither quota nor pace when the enclosing attempt transaction loses its claim', async () => {
  const item = await message(2);
  await expect(
    withTenant(sql, tenant, async (tx) => {
      await prepareDispatchPolicy(tx, tenant, item.data, item.recipients);
      throw new Error('Delivery claim lost');
    }),
  ).rejects.toThrow('Delivery claim lost');
  expect(await sql`select * from sending_quota`).toHaveLength(0);
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
  expect((await dispatch(item)).recipients).toHaveLength(2);
});
it('selects only the due recipient subset that fits daily allowance and retains consumed retries', async () => {
  await sql`update sending_policies set daily_limit=2 where org_id=${org}`;
  const item = await message(50),
    first = await dispatch(item);
  expect(first.recipients).toHaveLength(2);
  const other = await message();
  expect(await dispatch(other)).toMatchObject({
    recipients: [],
    holdReason: 'recipient_quota_exhausted',
    retryAfter: 60,
  });
  expect((await dispatch({ ...item, recipients: first.recipients })).recipients).toEqual(
    first.recipients,
  );
  expect(await sql`select * from sending_quota`).toHaveLength(2);
});
it('releases canceled and suppressed reservations before a due chunk without refunding consumed recipients', async () => {
  const item = await message(3);
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, item.data.id, item.recipients, 100),
  );
  await sql`update message_recipients set status='canceled' where message_id=${item.data.id} and address=${item.recipients[0]!}`;
  await sql`update message_recipients set status='suppressed' where message_id=${item.data.id} and address=${item.recipients[1]!}`;
  expect((await dispatch(item)).recipients).toEqual([item.recipients[2]]);
  expect(
    await sql`select state from sending_quota where recipient in ${sql(item.recipients.slice(0, 2))}`,
  ).toEqual([{ state: 'released' }, { state: 'released' }]);
  await sql`update message_recipients set status='failed' where message_id=${item.data.id} and address=${item.recipients[2]!}`;
  expect(await dispatch(item)).toEqual({ recipients: [] });
  expect(
    (await sql`select state from sending_quota where recipient=${item.recipients[2]!}`)[0]?.state,
  ).toBe('consumed');
});
it('holds suspended, unknown-class, unapproved marketing and unpinned work without spending capacity', async () => {
  const item = await message();
  await sql`update sending_policies set state='suspended' where org_id=${org}`;
  expect(await dispatch(item)).toMatchObject({ holdReason: 'sending_suspended' });
  await sql`update sending_policies set state='pending_review' where org_id=${org}`;
  expect(await dispatch(item)).toMatchObject({ holdReason: 'sending_not_approved' });
  await sql`update sending_policies set state='approved' where org_id=${org}`;
  expect(await dispatch({ ...item, data: { ...item.data, traffic_class: null } })).toMatchObject({
    holdReason: 'classification_required',
  });
  expect(
    await dispatch({ ...item, data: { ...item.data, traffic_class: 'marketing' } }),
  ).toMatchObject({ holdReason: 'marketing_not_approved' });
  expect(await dispatch({ ...item, data: { ...item.data, route_snapshot: null } })).toMatchObject({
    holdReason: 'route_required',
  });
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
});
it('rechecks credential binding, revocation and the critical grant immediately before an attempt', async () => {
  const item = await message();
  await sql`update api_keys set mail_traffic_class='marketing' where id=${key}`;
  expect(await dispatch(item)).toMatchObject({ holdReason: 'credential_class_mismatch' });
  await sql`update api_keys set mail_traffic_class='transactional',revoked_at=now() where id=${key}`;
  expect(await dispatch(item)).toMatchObject({ holdReason: 'credential_unavailable' });
  await sql`update api_keys set revoked_at=null where id=${key}`;
  await sql`update sending_policies set trust_tier='pareto' where org_id=${org}`;
  const critical = {
    ...item,
    data: { ...item.data, route_snapshot: { ...route, trust_tier: 'pareto', critical: true } },
  };
  expect(await dispatch(critical)).toMatchObject({ holdReason: 'critical_grant_required' });
  await sql`update api_keys set critical_sending=true where id=${key}`;
  expect((await dispatch(critical)).recipients).toEqual(item.recipients);
  await sql`update api_keys set critical_sending=false where id=${key}`;
  expect(await dispatch(critical)).toMatchObject({ holdReason: 'critical_grant_required' });
});
it('requires explicit verified sandbox-adapter authorization and does not apply it to real messages', async () => {
  const item = await message();
  await sql`update sending_policies set state='pending_review' where org_id=${org}`;
  const sandbox = { ...item, data: { ...item.data, sandbox: true, route_snapshot: null } };
  expect(await dispatch(sandbox)).toMatchObject({ holdReason: 'sandbox_transport_required' });
  expect((await dispatch(sandbox, { sandboxAuthorized: true })).recipients).toEqual(
    item.recipients,
  );
  expect(await dispatch(item, { sandboxAuthorized: true })).toMatchObject({
    holdReason: 'sending_not_approved',
  });
  expect(await sql`select * from sending_dispatches`).toHaveLength(0);
  expect(await sql`select * from sending_quota`).toHaveLength(0);
});
it('rejects revoked, missing and foreign credentials even in a privileged admission transaction', async () => {
  for (const actorId of [randomUUID(), foreignKey])
    await expect(
      sql.begin((tx) => sendingAdmission(tx, { ...principal, actorId }, undefined, false)),
    ).rejects.toMatchObject({ code: 'credential_unavailable' });
  await sql`update api_keys set revoked_at=now() where id=${key}`;
  await expect(
    sql.begin((tx) => sendingAdmission(tx, principal, undefined, false)),
  ).rejects.toMatchObject({ code: 'credential_unavailable' });
});
it('deduplicates recipients before calculating quota cost', async () => {
  const item = await message();
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, item.data.id, [item.recipients[0]!, item.recipients[0]!], 1),
  );
  expect(await sql`select * from sending_quota`).toHaveLength(1);
});

it('rechecks a newly suppressed address before committing a dispatch and releases its reservation once', async () => {
  const item = await message(2);
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, item.data.id, item.recipients, 100),
  );
  // The caller already read both queued recipients before feedback arrived.
  await sql`insert into suppressions(org_id,address,reason,protected) values(${org},${item.recipients[0]!},'hard_bounce',true)`;
  const result = await dispatch(item);
  expect(result.recipients).toEqual([item.recipients[1]]);
  expect(await sql`select state from sending_quota where recipient=${item.recipients[0]!}`).toEqual(
    [{ state: 'released' }],
  );
  expect(
    await sql`select status from message_recipients where message_id=${item.data.id} and address=${item.recipients[0]!}`,
  ).toEqual([{ status: 'suppressed' }]);
  expect(await sql`select data from event_outbox where type='email.suppressed'`).toEqual([
    { data: { email_id: item.data.id, recipient: item.recipients[0] } },
  ]);
  expect((await sql`select sum(recipients)::int as n from sending_dispatches`)[0]?.n).toBe(1);
  await dispatch(item);
  expect(await sql`select * from event_outbox where type='email.suppressed'`).toHaveLength(1);
});
