import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import { contactSchema } from '../../packages/shared/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { generateDomain } from '../../packages/mail/src/index.js';
import { upsertContact } from '../../packages/platform/src/audience.js';
import {
  campaignDraftSchema,
  createCampaign,
  previewCampaignAudience,
  updateCampaign,
} from '../../packages/platform/src/campaigns.js';
import { previewTemplateContent } from '../../packages/platform/src/campaign-content.js';
import { dispatchBroadcast, scheduleBroadcast } from '../../packages/platform/src/broadcasts.js';

const org = randomUUID(),
  environmentId = randomUUID(),
  productionId = randomUUID(),
  otherOrg = randomUUID(),
  otherEnvironmentId = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId,
  actorId: randomUUID(),
  kind: 'session',
  role: 'developer',
  production: false,
};
const foreign = { ...principal, orgId: otherOrg, environmentId: otherEnvironmentId };
const content = {
  subject: 'Hello {{first_name}}',
  html: '<p>{{first_name}}</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
  text: 'Hello {{first_name}}. Preferences: {{FLARE_UNSUBSCRIBE_URL}}',
  variables: {},
};
let db: PGlite;
let server: PGLiteSocketServer;
let sql: Sql;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const name of readdirSync('packages/db/migrations').sort())
    if (name.endsWith('.sql') && !name.startsWith('0000'))
      await db.exec(readFileSync(`packages/db/migrations/${name}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Campaigns','campaigns'),($2,'Other','other')",
    [org, otherOrg],
  );
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$2,'Production'),($4,$5,'Development')",
    [environmentId, org, productionId, otherEnvironmentId, otherOrg],
  );
  const keys = generateDomain(
    'example.com',
    `${org}/${environmentId}`,
    randomBytes(32).toString('base64'),
  );
  await db.query(
    "insert into domains(org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,'example.com','verified',$3,$4,$5)",
    [org, environmentId, keys.selector, keys.publicKey, keys.cipher],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);

beforeEach(async () => {
  await sql`truncate broadcasts,email_templates,contacts,contact_properties,contact_lists,audience_topics,audience_segments,suppressions,event_outbox,audit_logs cascade`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

const draft = (overrides: Record<string, unknown> = {}) =>
  campaignDraftSchema.parse({ name: 'Launch', sender: 'news@example.com', content, ...overrides });
async function contact(email: string, extra: Record<string, unknown> = {}, p = principal) {
  return withTenant(sql, p, (tx) => upsertContact(tx, p, contactSchema.parse({ email, ...extra })));
}
async function list(name = 'Imported audience', p = principal) {
  const [row] =
    await sql`insert into contact_lists(org_id,environment_id,name) values(${p.orgId},${p.environmentId},${name}) returning id`;
  return String(row!.id);
}
async function member(listId: string, contactId: string) {
  await sql`insert into contact_list_members(org_id,environment_id,list_id,contact_id) values(${org},${environmentId},${listId},${contactId})`;
}
async function template(p = principal) {
  const [row] =
    await sql`insert into email_templates(org_id,environment_id,name,identifier) values(${p.orgId},${p.environmentId},'Shared','shared') returning id`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${p.orgId},${p.environmentId},${row!.id},1,${content.subject},${content.html})`;
  return String(row!.id);
}

it('allows local HTTP campaigns only with validated isolated Mailpit configuration', async () => {
  await contact('demo@example.net');
  const created = await createCampaign(sql, principal, draft());
  for (const [name, value] of Object.entries({
    NODE_ENV: 'production',
    PUBLIC_API_URL: 'http://127.0.0.1:3001',
    WEB_ORIGIN: 'http://localhost:3000',
    MAIL_SANDBOX: 'true',
    MAIL_TRANSPORTS: '',
    TRANSPORT: 'smtp',
    TRANSPORT_PRIORITY: '',
    SMTP_HOST: 'mailpit',
    SMTP_PORT: '1025',
    SMTP_SECURE: 'false',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
  }))
    vi.stubEnv(name, value);
  expect(await scheduleBroadcast(sql, principal, String(created.id))).toMatchObject({
    status: 'scheduled',
  });
  const send = vi.fn(async () => {
    throw new Error('A real transport must not receive local sandbox campaign content');
  });
  const put = vi.fn(async () => undefined);
  await expect(
    dispatchBroadcast(
      {
        sql,
        encryptionKey: randomBytes(32).toString('base64'),
        trackingKey: randomBytes(32).toString('base64'),
        transports: [
          { name: 'real-smtp', sandbox: false, supportsRequiredTls: async () => true, send },
        ],
        store: { put, get: async () => Buffer.alloc(0), remove: async () => undefined },
      },
      String(created.id),
      'http://localhost:3000',
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(send).not.toHaveBeenCalled();
  expect(put).not.toHaveBeenCalled();
  expect(await sql`select * from event_outbox where type='broadcast.started'`).toHaveLength(0);
  vi.stubEnv('MAIL_SANDBOX', 'false');
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toMatchObject({
    status: 503,
  });
  vi.stubEnv('MAIL_SANDBOX', 'true');
  vi.stubEnv('SMTP_HOST', 'smtp.example.net');
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toMatchObject({
    status: 503,
  });
  vi.stubEnv('SMTP_HOST', 'mailpit');
  vi.stubEnv('WEB_ORIGIN', 'http://public.example.net');
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toMatchObject({
    status: 503,
  });
});

it('creates and edits a campaign with immutable owned template versions', async () => {
  const created = await createCampaign(sql, principal, draft());
  expect(created).toMatchObject({ status: 'draft', template_version: 1 });
  const updated = await updateCampaign(
    sql,
    principal,
    String(created.id),
    draft({ content: { ...content, subject: 'A new subject' } }),
  );
  expect(updated).toMatchObject({ template_id: created.template_id, template_version: 2 });
  expect(await sql`select version,subject from template_versions order by version`).toEqual([
    { version: 1, subject: content.subject },
    { version: 2, subject: 'A new subject' },
  ]);
  expect(await sql`select action from audit_logs where action='broadcast.updated'`).toHaveLength(1);
});

it('reuses a campaign creation key without duplicate content and rejects conflicting retries', async () => {
  const input = draft();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => createCampaign(sql, principal, input, 'campaign-attempt-1')),
  );
  expect(new Set(results.map((row) => row.id)).size).toBe(1);
  expect(await sql`select * from broadcasts`).toHaveLength(1);
  expect(await sql`select * from template_versions`).toHaveLength(1);
  expect(await sql`select * from event_outbox where type='broadcast.created'`).toHaveLength(1);
  await expect(
    createCampaign(sql, principal, draft({ name: 'Changed request' }), 'campaign-attempt-1'),
  ).rejects.toMatchObject({ status: 409 });
  const independent = await createCampaign(sql, foreign, input, 'campaign-attempt-1');
  expect(independent.id).not.toBe(results[0]!.id);
  await expect(createCampaign(sql, principal, input, '')).rejects.toMatchObject({ status: 422 });
});

it('keeps a reusable template unchanged when campaign content is customized', async () => {
  const templateId = await template();
  const created = await createCampaign(
    sql,
    principal,
    draft({ content: undefined, template_id: templateId, template_version: 1 }),
  );
  const updated = await updateCampaign(
    sql,
    principal,
    String(created.id),
    draft({ content: { ...content, subject: 'Only this campaign' } }),
  );
  expect(updated.template_id).not.toBe(templateId);
  expect(
    (await sql`select current_version from email_templates where id=${templateId}`)[0]
      ?.current_version,
  ).toBe(1);
  expect(
    (await sql`select subject from template_versions where template_id=${templateId}`)[0]?.subject,
  ).toBe(content.subject);
});

it('enforces Production content restrictions from the database environment', async () => {
  const production = { ...principal, environmentId: productionId, production: false };
  await expect(createCampaign(sql, production, draft())).rejects.toThrow('Development');
  expect(await sql`select * from email_templates`).toHaveLength(0);
  const templateId = await template(production);
  expect(
    await createCampaign(
      sql,
      production,
      draft({ content: undefined, template_id: templateId, template_version: 1 }),
    ),
  ).toMatchObject({ template_id: templateId });
});

it('rejects foreign and missing audience/content references without creating drafts', async () => {
  const foreignList = await list('Foreign list', foreign);
  const foreignTemplate = await template(foreign);
  for (const overrides of [
    { list_id: foreignList },
    { segment_id: randomUUID() },
    { topic_id: randomUUID() },
    { content: undefined, template_id: foreignTemplate, template_version: 1 },
  ])
    await expect(createCampaign(sql, principal, draft(overrides))).rejects.toThrow('not found');
  expect(await sql`select * from broadcasts`).toHaveLength(0);
  expect(await sql`select * from email_templates where org_id=${org}`).toHaveLength(0);
});

it('previews list contacts with exclusive opt-out, suppression and topic counts', async () => {
  const listId = await list();
  const [topic] =
    await sql`insert into audience_topics(org_id,environment_id,name,default_opt_in) values(${org},${environmentId},'Product news',false) returning id`;
  const allowed = await contact('allowed@example.net', { first_name: 'Ada' });
  const unsub = await contact('unsub@example.net', { unsubscribed: true });
  const suppressed = await contact('suppressed@example.net');
  const topicOut = await contact('topic@example.net');
  const deleted = await contact('deleted@example.net');
  await contact('outside@example.net');
  for (const row of [allowed, unsub, suppressed, topicOut, deleted])
    await member(listId, String(row.id));
  await sql`update contacts set deleted_at=now() where id=${deleted.id}`;
  await sql`insert into suppressions(org_id,address,reason) values(${org},'suppressed@example.net','manual'),(${org},'unsub@example.net','manual')`;
  await sql`insert into contact_topic_preferences(org_id,environment_id,topic_id,contact_id,enabled) values(${org},${environmentId},${topic!.id},${allowed.id},true)`;
  const created = await createCampaign(
    sql,
    principal,
    draft({ list_id: listId, topic_id: topic!.id }),
  );
  const preview = await previewCampaignAudience(sql, principal, String(created.id));
  expect(preview).toEqual({
    total: 4,
    eligible: 1,
    excluded: { unsubscribed: 1, suppressed: 1, topic_opt_out: 1, deleted: 0 },
    sample: [{ id: allowed.id, email: 'allowed@example.net', first_name: 'Ada', last_name: '' }],
    snapshot: false,
  });
  await scheduleBroadcast(sql, principal, String(created.id), 'in 1 hour');
  expect(
    await sql`select * from broadcast_recipients where broadcast_id=${created.id}`,
  ).toHaveLength(4);
  const later = await contact('later@example.net');
  await member(listId, String(later.id));
  const frozen = await previewCampaignAudience(sql, principal, String(created.id));
  expect(frozen).toMatchObject({ total: 4, eligible: 1, snapshot: true });
  await sql`update contacts set unsubscribed=true where id=${allowed.id}`;
  expect(await previewCampaignAudience(sql, principal, String(created.id))).toMatchObject({
    eligible: 0,
    excluded: { unsubscribed: 2 },
  });
  await sql`update contacts set deleted_at=now() where id=${topicOut.id}`;
  expect(await previewCampaignAudience(sql, principal, String(created.id))).toMatchObject({
    total: 4,
    eligible: 0,
    excluded: { unsubscribed: 2, suppressed: 1, topic_opt_out: 0, deleted: 1 },
  });
});

it('rejects an empty or entirely suppressed audience without changing a draft', async () => {
  const listId = await list();
  const created = await createCampaign(sql, principal, draft({ list_id: listId }));
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toThrow(
    'no eligible contacts',
  );
  const row = await contact('blocked@example.net');
  await member(listId, String(row.id));
  await sql`insert into suppressions(org_id,address,reason) values(${org},'blocked@example.net','manual')`;
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toThrow(
    'no eligible contacts',
  );
  expect((await sql`select status from broadcasts where id=${created.id}`)[0]?.status).toBe(
    'draft',
  );
  expect(await sql`select * from broadcast_recipients`).toHaveLength(0);
});

it('prevents editing a scheduled campaign and keeps its pinned content', async () => {
  await contact('reader@example.net');
  const created = await createCampaign(sql, principal, draft());
  await scheduleBroadcast(sql, principal, String(created.id), 'in 1 hour');
  await expect(
    updateCampaign(
      sql,
      principal,
      String(created.id),
      draft({ content: { ...content, subject: 'Too late' } }),
    ),
  ).rejects.toThrow('Only drafts');
  expect(await sql`select * from template_versions`).toHaveLength(1);
});

it('protects campaign lookup and contact-list membership across tenant boundaries', async () => {
  const listId = await list();
  const foreignContact = await contact('foreign@example.net', {}, foreign);
  await expect(member(listId, String(foreignContact.id))).rejects.toThrow();
  const created = await createCampaign(sql, principal, draft());
  await expect(previewCampaignAudience(sql, foreign, String(created.id))).rejects.toThrow(
    'not found',
  );
  await expect(updateCampaign(sql, foreign, String(created.id), draft())).rejects.toThrow(
    'not found',
  );
});

it('requires one content source and one audience selector', () => {
  expect(() => draft({ content: undefined })).toThrow('Supply email content');
  expect(() => draft({ template_id: randomUUID(), template_version: 1 })).toThrow(
    'Supply email content',
  );
  expect(() => draft({ list_id: randomUUID(), segment_id: randomUUID() })).toThrow(
    'Choose a contact list',
  );
});

it('requires an unsubscribe link before scheduling and rejects invalid content atomically', async () => {
  await contact('reader@example.net');
  await expect(
    createCampaign(sql, principal, draft({ content: { ...content, html: '{{#each contacts}}' } })),
  ).rejects.toThrow('Invalid template variable');
  expect(await sql`select * from broadcasts`).toHaveLength(0);
  expect(await sql`select * from email_templates`).toHaveLength(0);
  const created = await createCampaign(
    sql,
    principal,
    draft({ content: { ...content, html: '<p>Missing preferences</p>' } }),
  );
  await expect(scheduleBroadcast(sql, principal, String(created.id))).rejects.toThrow(
    'FLARE_UNSUBSCRIBE_URL',
  );
});

it('bounds preview samples while counting the whole selected audience', async () => {
  for (let i = 0; i < 8; i++) await contact(`reader${i}@example.net`);
  const created = await createCampaign(sql, principal, draft());
  const preview = await previewCampaignAudience(sql, principal, String(created.id));
  expect(preview).toMatchObject({ total: 8, eligible: 8 });
  expect(preview.sample).toHaveLength(5);
});

it('previews a contact with dispatch defaults without writes, sends or live preference links', async () => {
  await sql`insert into contact_properties(org_id,environment_id,name,type,fallback) values(${org},${environmentId},'company','string','"Fallback Co"'),(${org},${environmentId},'score','number','9'),(${org},${environmentId},'enabled','boolean','true')`;
  const row = await contact('preview@example.com', {
    first_name: '<Alex & team>',
    properties: { company: null, score: 0, enabled: false },
  });
  const previewContent = {
    ...content,
    subject: '{{first_name}} / {{company}} / {{score}} / {{enabled}}',
    html: '<p>{{first_name}}</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>{{missing}}',
    variables: { company: 'Template fallback' },
  };
  const [before] =
    await sql`select (select count(*) from event_outbox)::int as events,(select count(*) from messages)::int as messages,(select count(*) from audit_logs)::int as audits`;
  const result = await previewTemplateContent(sql, principal, {
    content: previewContent,
    contact_id: String(row.id),
  });
  expect(result.subject).toBe('<Alex & team> / Fallback Co / 0 / false');
  expect(result.html).toContain('&lt;Alex &amp; team&gt;');
  expect(result.html).toContain('https://example.test/preferences/preview');
  expect(result.text).toContain('<Alex & team>');
  expect(result.missing_variables).toEqual(['missing']);
  const [after] =
    await sql`select (select count(*) from event_outbox)::int as events,(select count(*) from messages)::int as messages,(select count(*) from audit_logs)::int as audits`;
  expect(after).toEqual(before);
});

it('rejects foreign, other-environment and deleted preview contacts without falling back to sample data', async () => {
  const other = await contact('other@example.com', {}, foreign);
  const production = await contact(
    'prod@example.com',
    {},
    { ...principal, environmentId: productionId },
  );
  const deleted = await contact('deleted@example.com');
  await sql`update contacts set deleted_at=now() where id=${deleted.id}`;
  for (const row of [other, production, deleted])
    await expect(
      previewTemplateContent(sql, principal, { content, contact_id: String(row.id) }),
    ).rejects.toMatchObject({ status: 404 });
});
