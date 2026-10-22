import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { generateDomain } from '../../packages/mail/src/index.js';
import type { PipelineOptions, TransportAdapter } from '../../packages/mail/src/index.js';
import {
  campaignDraftSchema,
  createCampaign,
  updateCampaign,
} from '../../packages/platform/src/campaigns.js';
import {
  campaignPreflight,
  campaignTestSchema,
  sendCampaignTest,
} from '../../packages/platform/src/campaign-preflight.js';
import { configureMarketingFixture } from './helpers/sending-policy.js';

const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session',
  role: 'owner',
  production: false,
};
const foreign = { ...principal, orgId: otherOrg, environmentId: otherEnv };
const key = randomBytes(32).toString('base64');
const objects = new Map<string, Buffer>();
const transport: TransportAdapter = {
  name: 'test',
  sandbox: true,
  supportsRequiredTls: async () => true,
  send: async () => {
    throw new Error('Admission must never dispatch synchronously');
  },
};
let db: PGlite, server: PGLiteSocketServer, sql: Sql, options: PipelineOptions;
const content = {
  subject: 'Hi {{first_name}}',
  html: '<p>{{email}}</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>',
  text: 'Hi {{first_name}}',
  variables: {},
};
const draft = (overrides = {}) =>
  campaignDraftSchema.parse({
    name: 'Test campaign',
    sender: 'news@example.com',
    content,
    ...overrides,
  });
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations').sort())
    if (file.endsWith('.sql') && !file.startsWith('0000'))
      await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$4,'Development')",
    [env, org, otherEnv, otherOrg],
  );
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await db.query(
    "insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,'example.com','verified',$3,$4,$5)",
    [org, env, keys.selector, keys.publicKey, keys.cipher],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
  options = {
    sql,
    encryptionKey: key,
    trackingKey: key,
    transports: [transport],
    store: {
      put: async (k, b) => {
        objects.set(k, b);
      },
      get: async (k) => objects.get(k)!,
      remove: async (k) => {
        objects.delete(k);
      },
    },
  };
}, 30000);
beforeEach(async () => {
  await sql`truncate messages,broadcasts,email_templates,contacts,audience_topics,contact_properties,suppressions,idempotency,event_outbox,audit_logs,mail_routes cascade`;
  await sql`update domains set status='verified',enforce_tls=false`;
  await sql`delete from sending_policies`;
  await sql`insert into sending_policies(org_id) select id from organizations`;
  options.transports = [transport];
  objects.clear();
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function prepared() {
  const campaign = await createCampaign(sql, principal, draft());
  const check = await campaignPreflight(options, principal, String(campaign.id));
  return {
    id: String(campaign.id),
    input: {
      revision: check.revision,
      sandbox: check.sandbox,
      recipients: ['reviewer@example.net'],
    },
  };
}

it('preflight is read-only, separates audience blockers from testing and marks the sandbox', async () => {
  const { id } = await prepared();
  const before = await sql`select * from event_outbox`;
  const result = await campaignPreflight(options, principal, id);
  expect(result).toMatchObject({
    ready: false,
    can_test: true,
    sandbox: true,
    audience: { eligible: 0 },
  });
  expect(result.checks.find((c) => c.id === 'approval')?.status).toBe('warning');
  expect(result.checks.find((c) => c.id === 'audience')).toMatchObject({
    status: 'blocked',
    href: '/audience',
  });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from event_outbox`).toEqual(before);
});

it('retries return exact IDs without fan-out, live unsubscribe tokens, private contact personalization or progress changes', async () => {
  const { id, input } = await prepared();
  await sql`insert into contacts(org_id,environment_id,email,first_name) values(${org},${env},'reviewer@example.net','PRIVATE AUDIENCE NAME'),(${org},${env},'outside@example.net','Outside')`;
  const results = await Promise.all(
    Array.from({ length: 3 }, () => sendCampaignTest(options, principal, id, input, 'same-test')),
  );
  expect(results[0]).toEqual(results[1]);
  expect(results[1]).toEqual(results[2]);
  const rows = await sql`select * from messages`;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    broadcast_id: null,
    sandbox: true,
    traffic_class: 'marketing',
    request: { subject: '[TEST] Hi Test' },
  });
  expect(rows[0]!.contact_id).toBeTruthy();
  expect(JSON.stringify(rows[0]!.request)).not.toContain('PRIVATE AUDIENCE NAME');
  expect(String(rows[0]!.request.html)).toContain('https://example.test/preferences/test-email');
  expect(await sql`select address from message_recipients`).toEqual([
    { address: 'reviewer@example.net' },
  ]);
  expect(await sql`select * from broadcast_recipients`).toHaveLength(0);
  expect((await sql`select status from broadcasts where id=${id}`)[0]!.status).toBe('draft');
  expect(await sql`select * from audit_logs where action='broadcast.test_accepted'`).toHaveLength(
    1,
  );
  await expect(
    sendCampaignTest(
      options,
      principal,
      id,
      { ...input, recipients: ['different@example.net'] },
      'same-test',
    ),
  ).rejects.toMatchObject({ status: 409 });
  await updateCampaign(sql, principal, id, draft({ content: { ...content, subject: 'Changed' } }));
  expect(await sendCampaignTest(options, principal, id, input, 'same-test')).toEqual(results[0]);
  await expect(sendCampaignTest(options, principal, id, input, 'new-test')).rejects.toMatchObject({
    status: 409,
  });
});

it('rejects invalid recipient sets, forged delivery modes, tenant/role/domain scope and rolls back opted-out batches', async () => {
  const { id, input } = await prepared();
  for (const recipients of [
    [],
    ['bad'],
    ['A@example.net', 'a@example.net'],
    Array.from({ length: 4 }, (_, i) => `${i}@example.net`),
  ])
    expect(campaignTestSchema.safeParse({ ...input, recipients }).success).toBe(false);
  await expect(
    sendCampaignTest(options, principal, id, { ...input, sandbox: false }, 'mode'),
  ).rejects.toMatchObject({ status: 409 });
  await expect(sendCampaignTest(options, foreign, id, input, 'foreign')).rejects.toMatchObject({
    status: 404,
  });
  await expect(campaignPreflight(options, foreign, id)).rejects.toMatchObject({ status: 404 });
  await expect(
    sendCampaignTest(options, { ...principal, role: 'viewer' }, id, input, 'viewer'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    sendCampaignTest(
      options,
      { ...principal, kind: 'api_key', permission: 'full_access', domainId: randomUUID() },
      id,
      input,
      'scope',
    ),
  ).rejects.toMatchObject({ status: 403 });
  await sql`insert into contacts(org_id,environment_id,email,unsubscribed) values(${org},${env},'optout@example.net',true)`;
  await expect(
    sendCampaignTest(
      options,
      principal,
      id,
      { ...input, recipients: ['ok@example.net', 'optout@example.net'] },
      'atomic',
    ),
  ).rejects.toMatchObject({ status: 422 });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from idempotency`).toHaveLength(0);
  expect(await sql`select * from event_outbox where type='email.queued'`).toHaveLength(0);
});

it('preserves suppression and denies deleted and topic-opted-out contacts', async () => {
  const { id, input } = await prepared();
  await sql`insert into suppressions(org_id,address,reason) values(${org},'reviewer@example.net','manual')`;
  expect(
    (await sendCampaignTest(options, principal, id, input, 'suppressed')).data[0]?.status,
  ).toBe('suppressed');
  expect(objects.size).toBe(0);
  await sql`insert into contacts(org_id,environment_id,email,deleted_at) values(${org},${env},'deleted@example.net',now())`;
  await expect(
    sendCampaignTest(
      options,
      principal,
      id,
      { ...input, recipients: ['deleted@example.net'] },
      'deleted',
    ),
  ).rejects.toMatchObject({ status: 422 });
  const [topic] =
    await sql`insert into audience_topics(org_id,environment_id,name,default_opt_in) values(${org},${env},'Private',false) returning id`;
  await sql`insert into contacts(org_id,environment_id,email) values(${org},${env},'topic@example.net')`;
  await updateCampaign(sql, principal, id, draft({ topic_id: topic!.id }));
  const check = await campaignPreflight(options, principal, id);
  await expect(
    sendCampaignTest(
      options,
      principal,
      id,
      { ...input, revision: check.revision, recipients: ['topic@example.net'] },
      'topic',
    ),
  ).rejects.toMatchObject({ status: 422 });
});

it('uses real marketing approval, route and quotas; rolls back an over-capacity batch and preserves exact retries after suspension', async () => {
  const { id, input } = await prepared();
  options.transports = [{ ...transport, sandbox: false }];
  await expect(
    sendCampaignTest(options, principal, id, { ...input, sandbox: false }, 'pending'),
  ).rejects.toMatchObject({ status: 403, code: 'sending_not_approved' });
  const policy = await configureMarketingFixture(options, principal);
  const real = { ...input, sandbox: false };
  await expect(
    sendCampaignTest(
      options,
      principal,
      id,
      { ...real, recipients: ['one@example.net', 'two@example.net'] },
      'over',
    ),
  ).rejects.toMatchObject({ status: 429 });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from sending_quota`).toHaveLength(0);
  const result = await sendCampaignTest(options, principal, id, real, 'one');
  expect(result.sandbox).toBe(false);
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  expect((await campaignPreflight(options, principal, id)).quota.remaining).toBe(0);
  await expect(sendCampaignTest(options, principal, id, real, 'another')).rejects.toMatchObject({
    status: 429,
  });
  await policy.change({ state: 'suspended' });
  expect(await sendCampaignTest(options, principal, id, real, 'one')).toEqual(result);
  await expect(sendCampaignTest(options, principal, id, real, 'suspended')).rejects.toMatchObject({
    status: 403,
  });
});

it('blocks sender drift, TLS and broken content in preflight and submission', async () => {
  const { id, input } = await prepared();
  await sql`update domains set status='pending'`;
  expect((await campaignPreflight(options, principal, id)).can_test).toBe(false);
  await expect(sendCampaignTest(options, principal, id, input, 'drift')).rejects.toMatchObject({
    status: 403,
  });
  await sql`update domains set status='verified',enforce_tls=true`;
  options.transports = [{ ...transport, supportsRequiredTls: async () => false }];
  expect((await campaignPreflight(options, principal, id)).checks).toContainEqual(
    expect.objectContaining({ code: 'required_tls_unavailable', status: 'blocked' }),
  );
  await expect(sendCampaignTest(options, principal, id, input, 'tls')).rejects.toMatchObject({
    status: 403,
  });
  await updateCampaign(
    sql,
    principal,
    id,
    draft({ content: { ...content, html: '<p>No preference link</p>' } }),
  );
  expect((await campaignPreflight(options, principal, id)).checks).toContainEqual(
    expect.objectContaining({ id: 'content', status: 'blocked' }),
  );
});

it('authorizes cached tests against their original sender after campaign edits', async () => {
  const { id, input } = await prepared();
  const result = await sendCampaignTest(options, principal, id, input, 'original-domain');
  const [original] = await sql`select id from domains where name='example.com'`;
  const [other] =
    await sql`insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values(${org},${env},'other.example.com','verified','test','test','test') on conflict(org_id,environment_id,name) do update set status='verified' returning id`;
  await updateCampaign(sql, principal, id, draft({ sender: 'news@other.example.com' }));
  await expect(
    sendCampaignTest(
      options,
      { ...principal, domainId: String(other!.id) },
      id,
      input,
      'original-domain',
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    await sendCampaignTest(
      options,
      { ...principal, domainId: String(original!.id) },
      id,
      input,
      'original-domain',
    ),
  ).toEqual(result);
});
