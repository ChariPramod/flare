import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import {
  evaluateFeedbackPolicy,
  getSendingPolicy,
  releaseUnusedQuota,
  reserveSendingQuota,
  restoreProtectedSuppression,
  sendingAdmission,
  sendingFeedback,
  updateSendingCredential,
  updateSendingPolicy,
} from '../../packages/mail/src/sending-policy.js';
import type { OperatorActor } from '../../packages/mail/src/sending-policy.js';

const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID();
const domain = randomUUID(),
  otherDomain = randomUUID(),
  credential = randomUUID(),
  otherCredential = randomUUID();
const tenant = { orgId: org, environmentId: env },
  foreign = { orgId: otherOrg, environmentId: otherEnv };
const principal: Principal = {
  ...tenant,
  actorId: credential,
  kind: 'api_key',
  role: 'developer',
  permission: 'sending_access',
  production: true,
};
const actor: OperatorActor = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  authorize: async () => undefined,
};
const reason = 'Reviewed sending ownership and intended transactional use';
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Sending A','sending-a'),($2,'Sending B','sending-b')",
    [org, otherOrg],
  );
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Production'),($3,$4,'Production')",
    [env, org, otherEnv, otherOrg],
  );
  for (const [id, organization, environment] of [
    [domain, org, env],
    [otherDomain, otherOrg, otherEnv],
  ]) {
    await db.query(
      "insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,$3,'example.com','verified','flare','test','test')",
      [id, organization, environment],
    );
  }
  for (const [id, organization, environment] of [
    [credential, org, env],
    [otherCredential, otherOrg, otherEnv],
  ]) {
    await db.query(
      "insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission) values($1,$2,$3,'Sending test',$4,'fl_test','sending_access')",
      [id, organization, environment, id],
    );
  }
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,audit_logs,suppressions,soft_bounces cascade`;
  await sql`delete from sending_policies`;
  await sql`insert into sending_policies(org_id) select id from organizations`;
  await sql`update api_keys set revoked_at=null,mail_traffic_class=null,critical_sending=false`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function message(addresses = ['reader@example.net'], organization = org, sandbox = false) {
  const id = randomUUID(),
    environment = organization === org ? env : otherEnv,
    domainId = organization === org ? domain : otherDomain;
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status,sandbox) values(${id},${organization},${environment},${domainId},'{}','sender@example.com','queued',${sandbox})`;
  for (const address of addresses)
    await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind) values(${organization},${environment},${id},${address},'to')`;
  return id;
}
async function feedback(
  id: string,
  type: 'bounced' | 'complained',
  source = 'postal',
  classification = 'hard_bounce',
  organization = org,
  recipient = 'reader@example.net',
) {
  await sql`insert into delivery_events(org_id,environment_id,message_id,source,source_id,type,recipient,data) values(${organization},${organization === org ? env : otherEnv},${id},${source},${randomUUID()},${type},${recipient},${sql.json({ classification })})`;
}
async function consume(id: string, recipients = ['reader@example.net']) {
  await withTenant(sql, tenant, (tx) => reserveSendingQuota(tx, tenant, id, recipients, 100));
  await sql`update sending_quota set state='consumed',consumed_at=now() where message_id=${id}`;
}
const approve = (extra: Record<string, unknown> = {}) =>
  updateSendingPolicy(sql, actor, org, {
    expected_revision: 0,
    reason,
    state: 'approved',
    default_traffic_class: 'transactional',
    ...extra,
  });

it('creates conservative organization defaults and exposes only the tenant policy read view', async () => {
  const newOrg = randomUUID();
  await sql`insert into organizations(id,name,slug) values(${newOrg},'Fresh tenant',${newOrg})`;
  expect(await getSendingPolicy(sql, newOrg)).toMatchObject({
    state: 'pending_review',
    revision: 0,
    daily_limit: 100,
    per_minute_limit: 10,
    marketing_enabled: false,
    trust_tier: 'customer',
  });
  expect(await withTenant(sql, tenant, (tx) => tx`select org_id from sending_policies`)).toEqual([
    { org_id: org },
  ]);
  expect(
    await withTenant(
      sql,
      foreign,
      (tx) => tx`select org_id from sending_policies where org_id=${org}`,
    ),
  ).toEqual([]);
  await expect(
    withTenant(
      sql,
      tenant,
      (tx) => tx`update sending_policies set state='approved' where org_id=${org}`,
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    withTenant(
      sql,
      tenant,
      (tx) => tx`insert into sending_policies(org_id) values(${randomUUID()})`,
    ),
  ).rejects.toThrow(/permission denied/);
});
it('denies tenant writes to operator credential grants while preserving ordinary revocation', async () => {
  await expect(
    withTenant(
      sql,
      tenant,
      (tx) => tx`update api_keys set critical_sending=true where id=${credential}`,
    ),
  ).rejects.toThrow(/permission denied|Operator approval/);
  await expect(
    withTenant(
      sql,
      tenant,
      (tx) => tx`update api_keys set mail_traffic_class='marketing' where id=${credential}`,
    ),
  ).rejects.toThrow(/permission denied|Operator approval/);
  await withTenant(
    sql,
    tenant,
    (tx) => tx`update api_keys set revoked_at=now() where id=${credential}`,
  );
  expect(
    (await sql`select revoked_at from api_keys where id=${credential}`)[0]?.revoked_at,
  ).toBeTruthy();
});
it('revalidates operator authorization before every mutation and leaves no audit on rejected authorization', async () => {
  const authorize = vi.fn(async () => {
    throw Object.assign(new Error('Operator reauthentication required'), { status: 403 });
  });
  const blocked = { ...actor, authorize };
  await expect(
    updateSendingPolicy(sql, blocked, org, { expected_revision: 0, reason, state: 'approved' }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    updateSendingCredential(sql, blocked, org, credential, {
      expected_revision: 0,
      reason,
      traffic_class: 'transactional',
      critical_sending: false,
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    restoreProtectedSuppression(sql, blocked, org, {
      expected_revision: 0,
      reason,
      email: 'reader@example.net',
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(authorize).toHaveBeenCalledTimes(3);
  expect(await getSendingPolicy(sql, org)).toMatchObject({ revision: 0, state: 'pending_review' });
  expect(await sql`select id from audit_logs`).toHaveLength(0);
});
it('makes stale concurrent policy edits conflict and audits the exact successful before/after revision', async () => {
  const results = await Promise.allSettled([
    approve({ daily_limit: 120 }),
    approve({ daily_limit: 130 }),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(
    results.filter((result) => result.status === 'rejected').map((result) => result.reason),
  ).toEqual([expect.objectContaining({ status: 409 })]);
  const policy = await getSendingPolicy(sql, org);
  expect(policy.revision).toBe(1);
  const [audit] = await sql`select * from audit_logs where org_id=${org}`;
  expect(audit).toMatchObject({
    actor_id: actor.actorId,
    action: 'operator.sending_policy.updated',
    metadata: {
      reason,
      session_id: actor.sessionId,
      before: { revision: 0, state: 'pending_review' },
      after: { revision: 1, state: 'approved', daily_limit: policy.daily_limit },
    },
  });
  await expect(
    updateSendingPolicy(sql, actor, org, {
      expected_revision: 1,
      reason: 'short',
      state: 'suspended',
    }),
  ).rejects.toThrow();
  expect(await sql`select id from audit_logs where org_id=${org}`).toHaveLength(1);
});
it('requires explicit marketing and Pareto authorization before granting bound credentials', async () => {
  for (const value of [
    { traffic_class: 'marketing', critical_sending: false },
    { traffic_class: 'transactional', critical_sending: true },
  ]) {
    await expect(
      updateSendingCredential(sql, actor, org, credential, {
        expected_revision: 0,
        reason,
        ...value,
      }),
    ).rejects.toMatchObject({ status: 422 });
  }
  await expect(
    approve({ route_bindings: { critical: { id: randomUUID(), revision: 1 } } }),
  ).rejects.toMatchObject({ status: 422 });
  await approve({ trust_tier: 'pareto' });
  await expect(
    updateSendingCredential(sql, actor, org, credential, {
      expected_revision: 1,
      reason,
      traffic_class: 'marketing',
      critical_sending: true,
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    updateSendingCredential(sql, actor, org, otherCredential, {
      expected_revision: 1,
      reason,
      traffic_class: 'transactional',
      critical_sending: true,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await updateSendingCredential(sql, actor, org, credential, {
    expected_revision: 1,
    reason,
    traffic_class: 'transactional',
    critical_sending: true,
  });
  expect(
    (
      await sql`select mail_traffic_class,critical_sending,permission from api_keys where id=${credential}`
    )[0],
  ).toEqual({
    mail_traffic_class: 'transactional',
    critical_sending: true,
    permission: 'sending_access',
  });
  expect(await getSendingPolicy(sql, org)).toMatchObject({ revision: 2 });
  expect(
    await withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, undefined, false)),
  ).toMatchObject({ trafficClass: 'transactional', critical: true });
  await expect(
    withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, 'marketing', false)),
  ).rejects.toMatchObject({ code: 'credential_class_mismatch' });
});
it('requires approval and classification and does not let marketing sources inherit transactional permission', async () => {
  await expect(
    withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, 'transactional', false)),
  ).rejects.toMatchObject({ code: 'sending_not_approved' });
  await approve({ default_traffic_class: null });
  await expect(
    withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, undefined, false)),
  ).rejects.toMatchObject({ code: 'classification_required' });
  await expect(
    withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, 'transactional', true)),
  ).rejects.toMatchObject({ code: 'marketing_not_approved' });
  expect(
    await withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, 'transactional', false)),
  ).toMatchObject({ trafficClass: 'transactional', critical: false });
});
it('restores a protected recipient only through audited revision-checked action and retains historical feedback', async () => {
  const id = await message();
  await feedback(id, 'complained');
  await sql`insert into suppressions(org_id,address,reason,protected) values(${org},'reader@example.net','complaint',true)`;
  await sql`insert into soft_bounces(org_id,address,message_id) values(${org},'reader@example.net',${id})`;
  await expect(
    restoreProtectedSuppression(sql, actor, org, {
      expected_revision: 9,
      reason,
      email: 'reader@example.net',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await sql`select * from suppressions`).toHaveLength(1);
  await restoreProtectedSuppression(sql, actor, org, {
    expected_revision: 0,
    reason,
    email: 'reader@example.net',
  });
  expect(await sql`select * from suppressions`).toHaveLength(0);
  expect(await sql`select * from delivery_events where message_id=${id}`).toHaveLength(1);
  expect(await sql`select * from soft_bounces where message_id=${id}`).toHaveLength(1);
  expect(
    (await sql`select metadata from audit_logs where action='operator.suppression.restored'`)[0]
      ?.metadata,
  ).toMatchObject({ reason, previous: { reason: 'complaint', protected: true } });
});
it('reserves logical recipients once across concurrent retries and rolls back rejected quota work', async () => {
  const id = await message(['one@example.net', 'two@example.net']);
  await Promise.all(
    Array.from({ length: 4 }, () =>
      withTenant(sql, tenant, (tx) =>
        reserveSendingQuota(tx, tenant, id, ['one@example.net', 'two@example.net'], 2),
      ),
    ),
  );
  expect(await sql`select * from sending_quota`).toHaveLength(2);
  const blocked = await message();
  await expect(
    withTenant(sql, tenant, (tx) =>
      reserveSendingQuota(tx, tenant, blocked, ['reader@example.net'], 2),
    ),
  ).rejects.toMatchObject({ status: 429, code: 'recipient_quota_exhausted', retryAfter: 60 });
  expect(await sql`select * from sending_quota where message_id=${blocked}`).toHaveLength(0);
  const foreignId = await message(['reader@example.net'], otherOrg);
  await withTenant(sql, foreign, (tx) =>
    reserveSendingQuota(tx, foreign, foreignId, ['reader@example.net'], 1),
  );
  expect(
    await withTenant(sql, tenant, (tx) => tx`select distinct org_id from sending_quota`),
  ).toEqual([{ org_id: org }]);
});
it('shares one allowance between different concurrent messages and restores it after transaction rollback', async () => {
  const ids = await Promise.all([message(), message()]);
  const settled = await Promise.allSettled(
    ids.map((id) =>
      withTenant(sql, tenant, (tx) =>
        reserveSendingQuota(tx, tenant, id, ['reader@example.net'], 1),
      ),
    ),
  );
  expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(settled.filter((result) => result.status === 'rejected')).toHaveLength(1);
  expect(await sql`select * from sending_quota`).toHaveLength(1);
  await sql`delete from sending_quota`;
  await expect(
    withTenant(sql, tenant, async (tx) => {
      await reserveSendingQuota(tx, tenant, ids[0]!, ['reader@example.net'], 1);
      throw new Error('Roll back enclosing operation');
    }),
  ).rejects.toThrow('Roll back');
  expect(await sql`select * from sending_quota`).toHaveLength(0);
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, ids[1]!, ['reader@example.net'], 1),
  );
});
it('releases only unsent terminal recipients and never refunds or double-charges consumed retries', async () => {
  const addresses = [
    'canceled@example.net',
    'suppressed@example.net',
    'failed@example.net',
    'sent@example.net',
    'queued@example.net',
  ];
  const id = await message(addresses);
  await withTenant(sql, tenant, (tx) => reserveSendingQuota(tx, tenant, id, addresses, 5));
  for (const status of ['canceled', 'suppressed', 'failed', 'sent'])
    await sql`update message_recipients set status=${status} where message_id=${id} and address=${`${status}@example.net`}`;
  await sql`update sending_quota set state='consumed',consumed_at=now() where message_id=${id} and recipient='sent@example.net'`;
  await withTenant(sql, tenant, (tx) => releaseUnusedQuota(tx, tenant, id));
  expect(
    await sql`select recipient,state from sending_quota where message_id=${id} order by recipient`,
  ).toEqual([
    { recipient: 'canceled@example.net', state: 'released' },
    { recipient: 'failed@example.net', state: 'released' },
    { recipient: 'queued@example.net', state: 'reserved' },
    { recipient: 'sent@example.net', state: 'consumed' },
    { recipient: 'suppressed@example.net', state: 'released' },
  ]);
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, id, ['sent@example.net', 'queued@example.net'], 2),
  );
  expect(await sql`select * from sending_quota where state<>'released'`).toHaveLength(2);
  await sql`update sending_quota set consumed_at=now()-interval '25 hours' where recipient='sent@example.net'`;
  const next = await message();
  await withTenant(sql, tenant, (tx) =>
    reserveSendingQuota(tx, tenant, next, ['reader@example.net'], 2),
  );
  expect(await sql`select * from sending_quota where message_id=${next}`).toHaveLength(1);
});
it('ignores simulated, sandbox, foreign and unknown feedback when deciding automatic suspension', async () => {
  await approve();
  const id = await message(),
    sandbox = await message(['reader@example.net'], org, true),
    foreignId = await message(['reader@example.net'], otherOrg);
  await feedback(id, 'complained', 'acceptance-simulated-delivery');
  await feedback(sandbox, 'complained');
  await feedback(foreignId, 'complained', 'postal', 'hard_bounce', otherOrg);
  await feedback(id, 'bounced', 'postal', 'unknown');
  await evaluateFeedbackPolicy(sql, org);
  expect(await getSendingPolicy(sql, org)).toMatchObject({ state: 'approved', revision: 1 });
  expect(await sendingFeedback(sql, org)).toMatchObject({
    complaints: 0,
    hard_bounces: 0,
    unknown: 1,
  });
  await feedback(id, 'complained', 'sns');
  await feedback(id, 'complained', 'sns');
  await Promise.all([evaluateFeedbackPolicy(sql, org), evaluateFeedbackPolicy(sql, org)]);
  expect(await getSendingPolicy(sql, org)).toMatchObject({
    state: 'suspended',
    revision: 2,
    suspension_reason: 'complaint_threshold',
  });
  expect(await sendingFeedback(sql, org)).toMatchObject({ complaints: 1 });
  expect(
    await sql`select id from audit_logs where action='operator.sending_policy.auto_suspended'`,
  ).toHaveLength(1);
  await expect(
    withTenant(sql, tenant, (tx) => sendingAdmission(tx, principal, 'transactional', false)),
  ).rejects.toMatchObject({ code: 'sending_not_approved' });
});
it('requires minimum recipient sample and counts duplicate hard bounces once before pausing', async () => {
  await approve({ hard_bounce_min: 2, hard_bounce_rate: 0.5 });
  const first = await message();
  await consume(first);
  await feedback(first, 'bounced');
  await feedback(first, 'bounced');
  await evaluateFeedbackPolicy(sql, org);
  expect(await getSendingPolicy(sql, org)).toMatchObject({ state: 'approved' });
  const second = await message();
  await consume(second);
  await evaluateFeedbackPolicy(sql, org);
  expect(await sendingFeedback(sql, org)).toMatchObject({ recipients_24h: 2, hard_bounces: 1 });
  expect(await getSendingPolicy(sql, org)).toMatchObject({
    state: 'suspended',
    suspension_reason: 'hard_bounce_threshold',
  });
});

it('requires new feedback after an audited resume while preserving historical complaint counts', async () => {
  await approve();
  const first = await message();
  await feedback(first, 'complained');
  await evaluateFeedbackPolicy(sql, org);
  await updateSendingPolicy(sql, actor, org, {
    expected_revision: 2,
    reason: 'Reviewed the complaint and corrected the root cause',
    state: 'approved',
  });
  await feedback(first, 'complained'); // Another callback ID for the same logical evidence.
  await evaluateFeedbackPolicy(sql, org);
  expect(await getSendingPolicy(sql, org)).toMatchObject({
    state: 'approved',
    revision: 3,
    feedback: { complaints: 1, unreviewed_complaints: 0 },
  });
  const second = await message(['next@example.net']);
  await feedback(second, 'complained', 'postal', 'hard_bounce', org, 'next@example.net');
  await evaluateFeedbackPolicy(sql, org);
  expect(await getSendingPolicy(sql, org)).toMatchObject({
    state: 'suspended',
    revision: 4,
    feedback: { complaints: 2 },
  });
  expect(
    await sql`select id from audit_logs where action='operator.sending_policy.auto_suspended'`,
  ).toHaveLength(2);
});
it('rejects nonexistent route bindings without changing approval or revision', async () => {
  await expect(
    approve({ route_bindings: { transactional: { id: randomUUID(), revision: 1 } } }),
  ).rejects.toMatchObject({ code: 'route_binding_invalid' });
  expect(await getSendingPolicy(sql, org)).toMatchObject({ state: 'pending_review', revision: 0 });
});
it('does not divide a late hard bounce by an unrelated new recipient cohort', async () => {
  await approve({ hard_bounce_min: 1, hard_bounce_rate: 0.05 });
  const old = await message();
  await consume(old);
  await sql`update sending_quota set consumed_at=now()-interval '25 hours' where message_id=${old}`;
  await feedback(old, 'bounced');
  const recent = await message();
  await consume(recent);
  await evaluateFeedbackPolicy(sql, org);
  expect(await getSendingPolicy(sql, org)).toMatchObject({
    state: 'approved',
    feedback: { recipients_24h: 1, hard_bounces: 0 },
  });
});
