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
  submitEmails,
  generateDomain,
  deliverEmail,
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
  await sql`truncate contacts,contact_properties,audience_topics,audience_segments,email_templates,broadcasts,messages,event_outbox,idempotency,suppressions cascade`;
  objects.clear();
  options.transports = [accepted];
  await sql`update domains set status='verified',enforce_tls=false where id=${domainId}`;
});
afterAll(async () => {
  await sql.end();
  await server.stop();
  await db.close();
});

import { contactSchema, verifyPreferenceToken } from '../../packages/shared/src/index.js';
import {
  importContacts,
  upsertContact,
  updatePreferences,
  segmentWhere,
} from '../../packages/platform/src/audience.js';
import {
  dispatchBroadcast,
  scheduleBroadcast,
  cancelBroadcast,
  broadcastStats,
} from '../../packages/platform/src/broadcasts.js';
async function contact(email: string, extra: Record<string, unknown> = {}) {
  return withTenant(sql, principal, (tx) =>
    upsertContact(tx, principal, contactSchema.parse({ email, ...extra })),
  );
}
async function template() {
  const id = randomUUID();
  await sql`insert into email_templates(id,org_id,environment_id,name,identifier) values(${id},${org},${env},'Welcome','welcome')`;
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html,variables) values(${org},${env},${id},1,'Hello {{first_name}}','<p>{{first_name}}</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>','{}')`;
  return id;
}
async function broadcast(topic: string | null = null, rate = 10) {
  const id = randomUUID(),
    tid = await template();
  await sql`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version,topic_id,rate_per_second) values(${id},${org},${env},'Launch','sender@example.com',${tid},1,${topic},${rate})`;
  return id;
}
it('imports mapped CSV atomically, deduplicates email case and preserves opt-outs', async () => {
  await sql`insert into contact_properties(org_id,environment_id,name,type,fallback) values(${org},${env},'seats','number','1')`;
  await contact('a@example.net', { unsubscribed: true, first_name: 'Keep me' });
  expect(
    await importContacts(
      sql,
      principal,
      'Email,Seats,Optout\nA@example.net,2,false\na@example.net,3,false',
      { Email: 'email', Seats: 'properties.seats', Optout: 'unsubscribed' },
    ),
  ).toEqual({ imported: 1, duplicates: 1 });
  expect((await sql`select properties,unsubscribed,first_name from contacts`)[0]).toMatchObject({
    properties: { seats: 3 },
    unsubscribed: true,
    first_name: 'Keep me',
  });
  await expect(
    importContacts(sql, principal, 'Email,Seats\nb@example.net,2\nc@example.net,nope', {
      Email: 'email',
      Seats: 'properties.seats',
    }),
  ).rejects.toThrow();
  expect(await sql`select * from contacts`).toHaveLength(1);
});
it('evaluates segments with property fallbacks using bound SQL parameters', async () => {
  await sql`insert into contact_properties(org_id,environment_id,name,type,fallback) values(${org},${env},'seats','number','10')`;
  await contact('a@example.net');
  await contact('b@example.net', { properties: { seats: 2 } });
  const matching = await withTenant(
    sql,
    principal,
    (tx) =>
      tx`select c.email from contacts c where ${segmentWhere(tx, { mode: 'all', rules: [{ field: 'properties.seats', op: 'gt', value: 5 }] })}`,
  );
  expect(matching.map((c) => c.email)).toEqual(['a@example.net']);
  const injection = await withTenant(
    sql,
    principal,
    (tx) =>
      tx`select c.email from contacts c where ${segmentWhere(tx, { mode: 'all', rules: [{ field: 'email', op: 'eq', value: "' OR true --" }] })}`,
  );
  expect(injection).toHaveLength(0);
});
it('enforces immutable template versions and tenant-bound template sending', async () => {
  const tid = await template();
  await expect(
    withTenant(
      sql,
      principal,
      (tx) => tx`update template_versions set html='changed' where template_id=${tid}`,
    ),
  ).rejects.toThrow();
  const payload = {
    from: 'sender@example.com',
    to: ['reader@example.net'],
    template: { id: tid, variables: { first_name: '<A>' } },
  };
  const first = await submitEmails(options, principal, [payload], { key: 'template-send' });
  await sql`insert into template_versions(org_id,environment_id,template_id,version,subject,html) values(${org},${env},${tid},2,'New subject','Changed')`;
  await sql`update email_templates set current_version=2 where id=${tid}`;
  expect(await submitEmails(options, principal, [payload], { key: 'template-send' })).toEqual(
    first,
  );
  const row = (await sql`select request from messages`)[0]!;
  expect(row.request.subject).toBe('Hello <A>');
  expect(row.request.html).toContain('&lt;A&gt;');
  expect(row.request.template.version).toBe(1);
  await expect(
    submitEmails(options, { ...principal, orgId: otherOrg, environmentId: foreignEnv }, [payload]),
  ).rejects.toMatchObject({ status: 422 });
});
it('freezes audience membership and skips opt-outs, topic preferences and org-wide suppressions', async () => {
  const topic = randomUUID();
  await sql`insert into audience_topics(id,org_id,environment_id,name) values(${topic},${org},${env},'News')`;
  await contact('yes@example.net', { first_name: 'Alice' });
  await contact('unsub@example.net', { unsubscribed: true });
  const opted = await contact('topic@example.net');
  await updatePreferences(sql, principal, String(opted.id), { topics: { [topic]: false } });
  await contact('suppressed@example.net');
  await sql`insert into suppressions(org_id,address,reason) values(${org},'suppressed@example.net','manual')`;
  const id = await broadcast(topic);
  await scheduleBroadcast(sql, principal, id);
  await contact('late@example.net');
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toEqual({
    processed: 4,
    finished: true,
  });
  expect(await sql`select * from messages`).toHaveLength(1);
  const [message] = await sql`select * from messages`;
  expect(message!.request.html).toContain('Alice');
  const preferenceUrl = /href="([^"]+)"/.exec(String(message!.request.html))![1]!;
  expect(verifyPreferenceToken(preferenceUrl.split('/').at(-1)!, key).orgId).toBe(org);
  const raw = objects.get(String(message!.mime_key))!.toString();
  expect(raw).toContain('List-Unsubscribe:');
  const signedHeaders = /^DKIM-Signature:([\s\S]*?)(?=\r\n[^ \t])/m.exec(raw)![1]!;
  expect(signedHeaders).toMatch(/list-unsubscribe-post/i);
  expect(raw).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click');
  expect((await broadcastStats(sql, principal, id)).recipients).toContainEqual({
    status: 'skipped',
    count: 3,
  });
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toBeUndefined();
});
it('rechecks preferences after a campaign queues mail and before transport', async () => {
  const c = await contact('reader@example.net');
  const id = await broadcast();
  await scheduleBroadcast(sql, principal, id);
  await dispatchBroadcast(options, id, 'https://flare.example.test');
  const [message] = await sql`select id from messages`;
  await updatePreferences(sql, principal, String(c.id), { unsubscribed: true });
  let sends = 0;
  await deliverEmail(
    {
      ...options,
      transports: [
        {
          ...accepted,
          send: async () => {
            sends++;
            throw new Error('must not send');
          },
        },
      ],
    },
    String(message!.id),
  );
  expect(sends).toBe(0);
  expect((await sql`select status from messages`)[0]!.status).toBe('suppressed');
});
it('throttles each chunk, recovers from repeat dispatch and cancels pending mail atomically', async () => {
  await contact('a@example.net');
  await contact('b@example.net');
  const id = await broadcast(null, 1);
  await scheduleBroadcast(sql, principal, id);
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toEqual({
    processed: 1,
    finished: false,
  });
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toBeUndefined();
  expect(await sql`select * from messages`).toHaveLength(1);
  await cancelBroadcast(sql, principal, id);
  expect((await sql`select status from messages`)[0]!.status).toBe('canceled');
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toBeUndefined();
  expect((await sql`select status from broadcasts`)[0]!.status).toBe('canceled');
});
it('isolates audience data and rejects cross-tenant preferences and campaign links', async () => {
  const c = await contact('a@example.net'),
    id = await broadcast();
  const foreign = { orgId: otherOrg, environmentId: foreignEnv };
  expect(await withTenant(sql, foreign, (tx) => tx`select * from contacts`)).toHaveLength(0);
  await expect(
    updatePreferences(sql, foreign, String(c.id), { unsubscribed: true }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    withTenant(
      sql,
      foreign,
      (tx) =>
        tx`insert into broadcast_recipients(org_id,environment_id,broadcast_id,contact_id) values(${otherOrg},${foreignEnv},${id},${c.id})`,
    ),
  ).rejects.toThrow();
});

it('enforces API-key sender scope before scheduling a broadcast', async () => {
  const id = await broadcast();
  await expect(
    scheduleBroadcast(sql, { ...principal, domainId: randomUUID() }, id),
  ).rejects.toThrow('API key cannot send');
  expect((await sql`select status from broadcasts where id=${id}`)[0]?.status).toBe('draft');
  await scheduleBroadcast(sql, { ...principal, domainId }, id);
  expect((await sql`select status from broadcasts where id=${id}`)[0]?.status).toBe('scheduled');
});

it('cancels held and scheduled campaign mail, clears preparation leases and releases only unused quota', async () => {
  for (const email of [
    'one@example.net',
    'two@example.net',
    'three@example.net',
    'four@example.net',
  ])
    await contact(email);
  const id = await broadcast(null, 3);
  await scheduleBroadcast(sql, principal, id);
  const queries: { query: string; parameters: unknown[] }[] = [];
  const debug = sql.options.debug;
  sql.options.debug = (_connection, query, parameters) => {
    queries.push({ query, parameters });
  };
  try {
    await dispatchBroadcast(options, id, 'https://flare.example.test');
  } finally {
    sql.options.debug = debug;
  }
  const organizationLock = queries.findIndex(
    (entry) =>
      entry.query.includes('pg_advisory_xact_lock') &&
      entry.parameters.includes(`${org}/sending-policy`),
  );
  expect(organizationLock).toBeGreaterThanOrEqual(0);
  expect(organizationLock).toBeLessThan(
    queries.findIndex((entry) => /for update/i.test(entry.query)),
  );
  const messages =
    await sql`select m.id,r.address from messages m join message_recipients r on r.message_id=m.id order by m.id`;
  expect(messages).toHaveLength(3);
  // Model existing real-send reservations independently of the sandbox transport fixture.
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
    cancelBroadcast(sql, { orgId: otherOrg, environmentId: foreignEnv }, id),
  ).rejects.toMatchObject({ status: 404 });
  queries.length = 0;
  sql.options.debug = (_connection, query, parameters) => {
    queries.push({ query, parameters });
  };
  try {
    expect(await cancelBroadcast(sql, principal, id)).toMatchObject({ canceled_messages: 2 });
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
  await cancelBroadcast(sql, principal, id);
  expect(await sql`select * from event_outbox where type='email.canceled'`).toHaveLength(2);
  expect(await sql`select * from event_outbox where type='broadcast.canceled'`).toHaveLength(1);
});

it('pauses a broadcast at the same recipient on quota exhaustion and resumes without duplicate accepted mail', async () => {
  await configureMarketingFixture(options, principal);
  await contact('quota-one@example.net');
  await contact('quota-two@example.net');
  const id = await broadcast();
  await scheduleBroadcast(sql, principal, id);
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toMatchObject({
    processed: 1,
    finished: false,
    paused: true,
    retry_after: 60,
  });
  const [first] = await sql`select id from messages`;
  expect(first).toBeDefined();
  const [pending] =
    await sql`select contact_id,error from broadcast_recipients where broadcast_id=${id} and status='pending'`;
  expect(pending!.error).toContain('recipient_quota_exhausted');
  expect(
    (
      await sql`select status,error,next_dispatch_at>now() as deferred from broadcasts where id=${id}`
    )[0],
  ).toMatchObject({
    status: 'sending',
    deferred: true,
    error: expect.stringContaining('recipient_quota_exhausted'),
  });
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toBeUndefined();
  expect(await sql`select * from messages`).toHaveLength(1);
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  // Model the first accepted recipient leaving the rolling day window.
  await sql`update sending_quota set state='consumed',consumed_at=now()-interval '25 hours'`;
  await sql`update broadcasts set next_dispatch_at=now() where id=${id}`;
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toEqual({
    processed: 1,
    finished: true,
  });
  expect(await sql`select * from messages`).toHaveLength(2);
  expect(await sql`select * from messages where id=${first!.id}`).toHaveLength(1);
  expect(
    (
      await sql`select status,error from broadcast_recipients where broadcast_id=${id} and contact_id=${pending!.contact_id}`
    )[0],
  ).toEqual({ status: 'queued', error: null });
  expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toBeUndefined();
});

it('keeps campaign approval blocks pending while permanent content failures remain terminal', async () => {
  const fixture = await configureMarketingFixture(options, principal);
  await contact('approval@example.net');
  const id = await broadcast();
  await scheduleBroadcast(sql, principal, id);
  await fixture.change({ state: 'suspended' });
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toMatchObject({
    processed: 0,
    paused: true,
    retry_after: 300,
  });
  expect(await sql`select * from messages`).toHaveLength(0);
  expect(await sql`select * from broadcast_recipients where status='pending'`).toHaveLength(1);
  await fixture.change({ state: 'approved' });
  await sql`update broadcasts set next_dispatch_at=now() where id=${id}`;
  expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toMatchObject({
    processed: 1,
    finished: true,
  });
  expect(await sql`select * from messages`).toHaveLength(1);
  const invalid = randomUUID();
  await sql`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version) select ${invalid},org_id,environment_id,'Invalid sender',sender,template_id,template_version from broadcasts where id=${id}`;
  await scheduleBroadcast(sql, principal, invalid);
  await sql`update broadcasts set sender='bad@unknown.example' where id=${invalid}`;
  await dispatchBroadcast(options, invalid, 'https://flare.example.test');
  expect(
    await sql`select * from broadcast_recipients where broadcast_id=${invalid} and status='failed'`,
  ).toHaveLength(1);
});

it.each(['domain drift', 'TLS outage', 'route TLS outage'] as const)(
  'pauses broadcast admission during %s and resumes the same recipient once',
  async (block) => {
    await configureMarketingFixture(options, principal);
    await contact('recovery@example.net');
    const id = await broadcast();
    await scheduleBroadcast(sql, principal, id);
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
            if (block === 'route TLS outage' && ++checks === 1) return true;
            throw new Error('Temporary capability lookup failure');
          },
        },
      ];
    }
    const code = block === 'domain drift' ? 'domain_unverified' : 'required_tls_unavailable';
    expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toMatchObject({
      paused: true,
      processed: 0,
      finished: false,
    });
    expect(
      (
        await sql`select status,error,next_dispatch_at>now() as deferred from broadcasts where id=${id}`
      )[0],
    ).toMatchObject({ status: 'sending', error: expect.stringContaining(code), deferred: true });
    expect(
      await sql`select status,message_id from broadcast_recipients where broadcast_id=${id}`,
    ).toEqual([{ status: 'pending', message_id: null }]);
    expect(await sql`select * from messages`).toHaveLength(0);
    expect(await sql`select * from sending_quota`).toHaveLength(0);
    expect(await sql`select * from transport_attempts`).toHaveLength(0);
    await sql`update domains set status='verified' where id=${domainId}`;
    options.transports = [transport];
    await sql`update broadcasts set next_dispatch_at=now() where id=${id}`;
    expect(await dispatchBroadcast(options, id, 'https://flare.example.test')).toMatchObject({
      finished: true,
      processed: 1,
    });
    await dispatchBroadcast(options, id, 'https://flare.example.test');
    expect(await sql`select * from messages where broadcast_id=${id}`).toHaveLength(1);
    expect(await sql`select * from sending_quota where state='reserved'`).toHaveLength(1);
    expect(await sql`select status from broadcast_recipients where broadcast_id=${id}`).toEqual([
      { status: 'queued' },
    ]);
  },
);
