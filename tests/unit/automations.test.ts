import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { generateDomain, deliverEmail } from '../../packages/mail/src/index.js';
import type { PipelineOptions, TransportAdapter } from '../../packages/mail/src/index.js';
const org = randomUUID(),
  env = randomUUID(),
  otherEnv = randomUUID(),
  otherOrg = randomUUID(),
  foreignEnv = randomUUID(),
  domainId = randomUUID();
const principal: Principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  role: 'developer',
  kind: 'api_key',
  permission: 'full_access',
  production: false,
};

const key = randomBytes(32).toString('base64');
const objects = new Map<string, Buffer>();
let sql: Sql;
let options: PipelineOptions;
let db: PGlite;
let server: PGLiteSocketServer;
const accepted: TransportAdapter = {
  name: 'test',
  supportsRequiredTls: async () => true,
  send: async (m) => ({
    accepted: m.to,
    rejected: [],
    ids: Object.fromEntries(m.to.map((v) => [v, 'provider-id'])),
  }),
};
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    otherOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$2,'Production'),($4,$5,'Development')",
    [env, org, otherEnv, foreignEnv, otherOrg],
  );
  const keys = generateDomain('example.com', `${org}/${env}`, key);
  await db.query(
    "insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher) values($1,$2,$3,'example.com','verified',$4,$5,$6)",
    [domainId, org, env, keys.selector, keys.publicKey, keys.cipher],
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
    transports: [accepted],
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
  await sql`truncate automations,contacts,contact_properties,audience_topics,audience_segments,email_templates,broadcasts,messages,event_outbox,idempotency,suppressions cascade`;
  objects.clear();
});
afterAll(async () => {
  await sql.end();
  await server.stop();
  await db.close();
});

import { automationSchema, contactSchema } from '../../packages/shared/src/index.js';
import { upsertContact } from '../../packages/platform/src/audience.js';
import {
  createAutomationEvent,
  fanOutAutomationEvents,
  advanceAutomation,
  cancelAutomation,
  validateAutomation,
  failAutomation,
} from '../../packages/platform/src/automations.js';
async function setup() {
  const contact = await withTenant(sql, principal, (tx) =>
    upsertContact(
      tx,
      principal,
      contactSchema.parse({ email: 'reader@example.net', first_name: 'Ada' }),
    ),
  );
  const template = randomUUID();
  await sql`insert into email_templates(id,org_id,environment_id,name,identifier) values(${template},${org},${env},'Welcome','welcome')`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${template},1,'Hello {{first_name}}','<h1>{{first_name}}</h1><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>')`;
  const definition = automationSchema.parse({
    trigger: 'signed_up',
    entry: 'welcome',
    steps: [
      {
        id: 'welcome',
        name: 'Welcome',
        type: 'send_email',
        from: 'sender@example.com',
        template_id: template,
        template_version: 1,
        next: 'pause',
      },
      { id: 'pause', name: 'Pause', type: 'wait', seconds: 3600, next: 'conversion' },
      {
        id: 'conversion',
        name: 'Purchase',
        type: 'wait_for_event',
        event: 'purchased',
        timeout_seconds: 3600,
        next: 'branch',
        on_timeout: null,
      },
      {
        id: 'branch',
        name: 'Branch',
        type: 'condition',
        condition: { '==': [{ var: 'contact.first_name' }, 'Ada'] },
        then: 'thanks',
        else: null,
      },
      {
        id: 'thanks',
        name: 'Thank you',
        type: 'send_email',
        from: 'sender@example.com',
        template_id: template,
        template_version: 1,
        next: null,
      },
    ],
  });
  await withTenant(sql, principal, (tx) => validateAutomation(tx, principal, definition));
  const [automation] =
    await sql`insert into automations(org_id,environment_id,identifier,name,definition,enabled) values(${org},${env},'welcome','Welcome',${sql.json(definition)},true) returning id`;
  const event = await createAutomationEvent(sql, principal, {
    contact_id: contact.id,
    name: 'signed_up',
    external_id: 'signup-1',
  });
  await fanOutAutomationEvents(sql);
  const [run] = await sql`select * from automation_runs where event_id=${event.id}`;
  return { contact, template, definition, automation: automation!.id, run: String(run!.id) };
}
it('persists unique events, snapshots definitions and resumes each step without duplicate messages', async () => {
  const { contact, run, automation } = await setup();
  expect(
    (
      await createAutomationEvent(sql, principal, {
        contact_id: contact.id,
        name: 'signed_up',
        external_id: 'signup-1',
      })
    ).duplicate,
  ).toBe(true);
  await expect(
    createAutomationEvent(sql, principal, {
      contact_id: contact.id,
      name: 'changed',
      external_id: 'signup-1',
    }),
  ).rejects.toThrow('different content');
  await fanOutAutomationEvents(sql);
  expect(await sql`select id from automation_runs`).toHaveLength(1);
  await sql`update automations set enabled=false,revision=2 where id=${automation}`;
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  expect(await sql`select * from messages`).toHaveLength(1);
  expect((await sql`select status,revision from automation_runs where id=${run}`)[0]).toMatchObject(
    { status: 'waiting', revision: 1 },
  );
  await sql`update automation_steps set wake_at=now()-interval '1 second' where run_id=${run} and step_id='pause'`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  await createAutomationEvent(sql, principal, {
    contact_id: contact.id,
    name: 'purchased',
    external_id: 'purchase-1',
  });
  await fanOutAutomationEvents(sql);
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  expect((await sql`select status from automation_runs where id=${run}`)[0]?.status).toBe(
    'completed',
  );
  expect(await sql`select * from messages`).toHaveLength(2);
  expect(await sql`select * from automation_steps where status='completed'`).toHaveLength(5);
  expect(
    (await sql`select matched_event_id from automation_steps where step_id='conversion'`)[0]
      ?.matched_event_id,
  ).toBeTruthy();
});
it('wait-for-event times out on its timeout branch and ignores old events', async () => {
  const { run, contact } = await setup();
  await createAutomationEvent(sql, principal, {
    contact_id: contact.id,
    name: 'purchased',
    external_id: 'early-purchase',
  });
  await sql`update automation_runs set current_step='conversion' where id=${run}`;
  await advanceAutomation(options, run);
  await sql`update automation_steps set wake_at=now()-interval '1 second' where run_id=${run}`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  expect((await sql`select status from automation_runs where id=${run}`)[0]?.status).toBe(
    'completed',
  );
  expect(await sql`select * from messages`).toHaveLength(0);
});
it('cancels pending messages atomically and rechecks contact opt-out before delivery', async () => {
  const { run, contact } = await setup();
  await advanceAutomation(options, run);
  await sql`update contacts set unsubscribed=true where id=${contact.id}`;
  const [message] = await sql`select id from messages`;
  await deliverEmail(options, String(message!.id));
  expect((await sql`select status from messages`)[0]?.status).toBe('suppressed');
  expect(await sql`select * from transport_attempts`).toHaveLength(0);
  await advanceAutomation(options, run);
  expect((await sql`select status from automation_runs`)[0]?.status).toBe('canceled');
  await cancelAutomation(sql, principal, run);
});
it('records terminal step errors, rejects cross-tenant events and scoped sender definitions', async () => {
  const { run, contact, definition } = await setup();
  await expect(
    createAutomationEvent(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      { contact_id: contact.id, name: 'signed_up', external_id: 'foreign' },
    ),
  ).rejects.toThrow('Contact not found');
  await expect(
    withTenant(sql, principal, (tx) =>
      validateAutomation(tx, { ...principal, domainId: randomUUID() }, definition),
    ),
  ).rejects.toThrow('scope');
  for (let i = 0; i < 5; i++) await failAutomation(sql, run, new Error('Temporary failure'));
  expect((await sql`select status,attempts from automation_runs`)[0]).toMatchObject({
    status: 'failed',
    attempts: 5,
  });
  expect((await sql`select status,error from automation_steps`)[0]).toMatchObject({
    status: 'failed',
    error: 'Temporary failure',
  });
  expect(
    await withTenant(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      (tx) => tx`select * from automation_runs`,
    ),
  ).toHaveLength(0);
});
it('rejects cycles, unreachable steps and unsafe JSON Logic operators', () => {
  const step = { id: 'wait', name: 'Wait', type: 'wait', seconds: 1, next: 'wait' };
  expect(
    automationSchema.safeParse({ trigger: 'event', entry: 'wait', steps: [step] }).success,
  ).toBe(false);
  expect(
    automationSchema.safeParse({
      trigger: 'event',
      entry: 'wait',
      steps: [
        { ...step, next: null },
        { ...step, id: 'lost', next: null },
      ],
    }).success,
  ).toBe(false);
  expect(
    automationSchema.safeParse({
      trigger: 'event',
      entry: 'branch',
      steps: [
        {
          id: 'branch',
          name: 'Branch',
          type: 'condition',
          condition: { log: 'secret' },
          then: null,
          else: null,
        },
      ],
    }).success,
  ).toBe(false);
});
