import { configureMarketingFixture } from './helpers/sending-policy.js';
import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import {
  generateDomain,
  deliverEmail,
  submitEmails,
  reserveSendingQuota,
} from '../../packages/mail/src/index.js';
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
  sandbox: true,
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
  options.transports = [accepted];
  await sql`update domains set status='verified',enforce_tls=false where id=${domainId}`;
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

it('cancels unstarted held automation mail and releases quota without recalling a started send', async () => {
  const { run, contact } = await setup();
  const queries: { query: string; parameters: unknown[] }[] = [];
  const debug = sql.options.debug;
  sql.options.debug = (_connection, query, parameters) => {
    queries.push({ query, parameters });
  };
  try {
    await advanceAutomation(options, run);
  } finally {
    sql.options.debug = debug;
  }
  const organizationLock = queries.findIndex((entry) =>
    entry.parameters.includes(`${org}/sending-policy`),
  );
  expect(organizationLock).toBeGreaterThanOrEqual(0);
  expect(organizationLock).toBeLessThan(
    queries.findIndex((entry) => /for update/i.test(entry.query)),
  );
  await submitEmails(
    options,
    principal,
    [
      { from: 'sender@example.com', to: ['second@example.net'], subject: 'Second', text: 'Second' },
      { from: 'sender@example.com', to: ['third@example.net'], subject: 'Third', text: 'Third' },
    ],
    { campaign: { automationRunId: run, contactId: String(contact.id), topicId: null } },
  );
  const messages =
    await sql`select m.id,r.address from messages m join message_recipients r on r.message_id=m.id order by m.id`;
  // Represent pre-existing reservations; the test adapter itself remains sandboxed.
  for (const row of messages)
    await withTenant(sql, principal, (tx) =>
      reserveSendingQuota(tx, principal, String(row.id), [String(row.address)], 100),
    );
  const [held, scheduled, started] = messages;
  await sql`update messages set status='held',hold_reason='sending_rate_limited',claim_id=${randomUUID()},lease_until=now()+interval '2 minutes' where id=${held!.id}`;
  await sql`update messages set status='scheduled',scheduled_at=now()+interval '1 hour' where id=${scheduled!.id}`;
  const activeClaim = randomUUID();
  await sql`update messages set delivery_started_at=now(),claim_id=${activeClaim},lease_until=now()+interval '2 minutes' where id=${started!.id}`;
  await sql`update sending_quota set state='consumed',consumed_at=now() where message_id=${started!.id}`;
  await expect(
    cancelAutomation(sql, { orgId: otherOrg, environmentId: foreignEnv }, run),
  ).rejects.toMatchObject({ status: 404 });
  queries.length = 0;
  sql.options.debug = (_connection, query, parameters) => {
    queries.push({ query, parameters });
  };
  try {
    await cancelAutomation(sql, principal, run);
  } finally {
    sql.options.debug = debug;
  }
  const cancelLock = queries.findIndex((entry) =>
    entry.parameters.includes(`${org}/sending-policy`),
  );
  expect(cancelLock).toBeGreaterThanOrEqual(0);
  expect(cancelLock).toBeLessThan(queries.findIndex((entry) => /for update/i.test(entry.query)));
  expect(
    await sql`select status,claim_id,lease_until,hold_reason from messages where id in ${sql([held!.id, scheduled!.id])}`,
  ).toEqual([
    { status: 'canceled', claim_id: null, lease_until: null, hold_reason: null },
    { status: 'canceled', claim_id: null, lease_until: null, hold_reason: null },
  ]);
  expect(
    (await sql`select status,claim_id from messages where id=${started!.id}`)[0],
  ).toMatchObject({ status: 'queued', claim_id: activeClaim });
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(2);
  expect(await sql`select * from sending_quota where state='consumed'`).toHaveLength(1);
  await cancelAutomation(sql, principal, run);
  expect(await sql`select * from event_outbox where type='email.canceled'`).toHaveLength(2);
  expect(await sql`select * from event_outbox where type='automation.canceled'`).toHaveLength(1);
});

it('releases held reservations when an opt-out automatically cancels the automation', async () => {
  const { run, contact } = await setup();
  await advanceAutomation(options, run);
  const [message] = await sql`select id from messages`;
  await withTenant(sql, principal, (tx) =>
    reserveSendingQuota(tx, principal, String(message!.id), [String(contact.email)], 100),
  );
  await sql`update messages set status='held',hold_reason='sending_rate_limited' where id=${message!.id}`;
  await sql`update contacts set unsubscribed=true where id=${contact.id}`;
  await advanceAutomation(options, run);
  expect((await sql`select status from automation_runs where id=${run}`)[0]?.status).toBe(
    'canceled',
  );
  expect(
    (await sql`select status,hold_reason from messages where id=${message!.id}`)[0],
  ).toMatchObject({ status: 'canceled', hold_reason: null });
  expect(await sql`select * from sending_quota where state='released'`).toHaveLength(1);
  expect(await sql`select * from event_outbox where type='email.canceled'`).toHaveLength(1);
});

it('pauses the same automation step for exhausted quota and resumes it exactly once', async () => {
  await configureMarketingFixture(options, principal);
  const { run, contact } = await setup();
  const prior = (
    await submitEmails(
      options,
      { ...principal, kind: 'session' },
      [{ from: 'sender@example.com', to: ['prior@example.net'], subject: 'Prior', text: 'Prior' }],
      { campaign: { contactId: String(contact.id), topicId: null } },
    )
  ).data[0]!.id;
  let failure: unknown;
  try {
    await advanceAutomation(options, run);
  } catch (error) {
    failure = error;
  }
  expect(failure).toMatchObject({ status: 429, code: 'recipient_quota_exhausted' });
  await failAutomation(sql, run, failure);
  expect(
    (
      await sql`select status,current_step,attempts,error,next_step_at>now() as deferred from automation_runs where id=${run}`
    )[0],
  ).toMatchObject({
    status: 'queued',
    current_step: 'welcome',
    attempts: 0,
    deferred: true,
    error: expect.stringContaining('recipient_quota_exhausted'),
  });
  expect(await sql`select * from automation_steps where run_id=${run}`).toHaveLength(0);
  expect(await advanceAutomation(options, run)).toBeUndefined();
  expect(await sql`select * from messages`).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  await sql`update sending_quota set state='consumed',consumed_at=now()-interval '25 hours' where message_id=${prior}`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  await advanceAutomation(options, run);
  expect(await sql`select * from messages`).toHaveLength(2);
  expect(await sql`select * from messages where automation_run_id=${run}`).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  expect(
    (
      await sql`select status,error from automation_steps where run_id=${run} and step_id='welcome'`
    )[0],
  ).toMatchObject({ status: 'completed', error: null });
});

it('does not consume automation failure retries while operator approval remains blocked', async () => {
  const fixture = await configureMarketingFixture(options, principal);
  const { run } = await setup();
  await fixture.change({ state: 'suspended' });
  for (let attempt = 0; attempt < 6; attempt++) {
    await sql`update automation_runs set next_step_at=now() where id=${run}`;
    try {
      await advanceAutomation(options, run);
    } catch (error) {
      await failAutomation(sql, run, error);
    }
  }
  expect(
    (await sql`select status,current_step,attempts,error from automation_runs where id=${run}`)[0],
  ).toMatchObject({
    status: 'queued',
    current_step: 'welcome',
    attempts: 0,
    error: expect.stringContaining('sending_not_approved'),
  });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from automation_steps`).toHaveLength(0);
  await fixture.change({ state: 'approved' });
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  expect(await sql`select * from messages where automation_run_id=${run}`).toHaveLength(1);
  expect(
    (await sql`select error,current_step from automation_runs where id=${run}`)[0],
  ).toMatchObject({ error: null, current_step: 'pause' });
});

it.each(['domain drift', 'TLS outage', 'route TLS outage'] as const)(
  'pauses automation admission during %s without consuming retries',
  async (block) => {
    await configureMarketingFixture(options, principal);
    const { run } = await setup();
    const transport = options.transports[0]!;
    if (block === 'domain drift')
      await sql`update domains set status='temporary_failure' where id=${domainId}`;
    else {
      await sql`update domains set enforce_tls=true where id=${domainId}`;
      let checks = 0;
      options.transports = [
        {
          ...transport,
          supportsRequiredTls: async () => {
            if (block === 'route TLS outage') {
              if (++checks === 1) return true;
              throw new Error('Temporary route capability lookup failure');
            }
            return false;
          },
        },
      ];
    }
    let failure: unknown;
    try {
      await advanceAutomation(options, run);
    } catch (error) {
      failure = error;
    }
    await failAutomation(sql, run, failure);
    const code = block === 'domain drift' ? 'domain_unverified' : 'required_tls_unavailable';
    expect(
      (
        await sql`select status,current_step,attempts,error,next_step_at>now() as deferred from automation_runs where id=${run}`
      )[0],
    ).toMatchObject({
      status: 'queued',
      current_step: 'welcome',
      attempts: 0,
      error: expect.stringContaining(code),
      deferred: true,
    });
    expect(await sql`select * from automation_steps`).toHaveLength(0);
    expect(await sql`select * from messages`).toHaveLength(0);
    expect(await sql`select * from sending_quota`).toHaveLength(0);
    expect(await sql`select * from transport_attempts`).toHaveLength(0);
    await sql`update domains set status='verified' where id=${domainId}`;
    options.transports = [transport];
    await sql`update automation_runs set next_step_at=now() where id=${run}`;
    await advanceAutomation(options, run);
    await advanceAutomation(options, run);
    expect(await sql`select * from messages where automation_run_id=${run}`).toHaveLength(1);
    expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
    expect(
      (await sql`select status from automation_steps where run_id=${run} and step_id='welcome'`)[0]
        ?.status,
    ).toBe('completed');
  },
);

it('preserves outbox timestamp precision and fans out only automations existing at the exact event time', async () => {
  const { contact } = await setup();
  await sql`delete from event_outbox`;
  const definition = automationSchema.parse({
    trigger: 'contact.created',
    entry: 'wait',
    steps: [{ id: 'wait', name: 'Wait', type: 'wait', seconds: 1, next: null }],
  });
  const earlier = randomUUID(),
    later = randomUUID(),
    eventId = randomUUID();
  await sql`insert into automations(id,org_id,environment_id,identifier,name,definition,enabled,created_at) values
    (${earlier},${org},${env},'precision-earlier','Earlier',${sql.json(definition)},true,'2026-01-01T00:00:00.123455Z'),
    (${later},${org},${env},'precision-later','Later',${sql.json(definition)},true,'2026-01-01T00:00:00.123457Z')`;
  await sql`insert into event_outbox(id,org_id,environment_id,type,data,created_at) values(${eventId},${org},${env},'contact.created',${sql.json({ id: contact.id })},'2026-01-01T00:00:00.123456Z')`;
  await fanOutAutomationEvents(sql);
  const [event] =
    await sql`select id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as timestamp from automation_events where external_id=${`outbox:${eventId}`}`;
  expect(event!.timestamp).toBe('2026-01-01T00:00:00.123456Z');
  expect(await sql`select automation_id from automation_runs where event_id=${event!.id}`).toEqual([
    { automation_id: earlier },
  ]);
  await fanOutAutomationEvents(sql);
  expect(
    await sql`select automation_id from automation_runs where event_id=${event!.id}`,
  ).toHaveLength(1);
});

it('matches wait events against exact start and deadline boundaries without admitting earlier microseconds', async () => {
  const { run, contact } = await setup();
  await sql`update automation_runs set current_step='conversion' where id=${run}`;
  await advanceAutomation(options, run);
  await sql`update automation_steps set started_at='2026-01-01T00:00:00.123455Z',wake_at='2026-01-01T00:00:00.123457Z' where run_id=${run} and step_id='conversion'`;
  const early = randomUUID(),
    valid = randomUUID(),
    late = randomUUID();
  await sql`insert into automation_events(id,org_id,environment_id,contact_id,name,external_id,data,created_at) values
    (${early},${org},${env},${contact.id},'purchased','microsecond-early','{}','2026-01-01T00:00:00.123454Z'),
    (${valid},${org},${env},${contact.id},'purchased','microsecond-valid','{}','2026-01-01T00:00:00.123456Z'),
    (${late},${org},${env},${contact.id},'purchased','microsecond-late','{}','2026-01-01T00:00:00.123458Z')`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  expect(
    (
      await sql`select matched_event_id from automation_steps where run_id=${run} and step_id='conversion'`
    )[0]!.matched_event_id,
  ).toBe(valid);
  expect(
    (await sql`select current_step from automation_runs where id=${run}`)[0]!.current_step,
  ).toBe('branch');
});

it('does not match an event one microsecond before a wait begins', async () => {
  const { run, contact } = await setup();
  await sql`update automation_runs set current_step='conversion' where id=${run}`;
  await advanceAutomation(options, run);
  await sql`update automation_steps set started_at='2026-01-01T00:00:00.123455Z',wake_at='2026-01-01T00:00:01.123457Z' where run_id=${run} and step_id='conversion'`;
  await sql`insert into automation_events(org_id,environment_id,contact_id,name,external_id,data,created_at) values
    (${org},${env},${contact.id},'purchased','before-wait-microsecond','{}','2026-01-01T00:00:00.123454Z')`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  await advanceAutomation(options, run);
  expect(
    (
      await sql`select matched_event_id from automation_steps where run_id=${run} and step_id='conversion'`
    )[0]!.matched_event_id,
  ).toBeNull();
  expect(
    (await sql`select status,current_step from automation_runs where id=${run}`)[0],
  ).toMatchObject({ status: 'completed', current_step: null });
});
it('preserves a waiting step deadline when an unrelated event wakes the run', async () => {
  const { run } = await setup();
  await sql`update automation_runs set current_step='conversion' where id=${run}`;
  await advanceAutomation(options, run);
  await sql`update automation_steps set wake_at='2050-01-01T00:00:00.123456Z' where run_id=${run} and step_id='conversion'`;
  await sql`update automation_runs set next_step_at=now() where id=${run}`;
  expect(await advanceAutomation(options, run)).toEqual({ status: 'waiting' });
  expect(
    (
      await sql`select r.next_step_at=s.wake_at as exact from automation_runs r join automation_steps s on s.run_id=r.id and s.step_id='conversion' where r.id=${run}`
    )[0]!.exact,
  ).toBe(true);
});
