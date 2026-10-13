import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { submitEmails, generateDomain, deliverEmail } from '../../packages/mail/src/index.js';
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
  await sql`truncate contacts,contact_properties,audience_topics,audience_segments,email_templates,broadcasts,messages,event_outbox,idempotency,suppressions cascade`;
  objects.clear();
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
