import { readFileSync, readdirSync } from 'node:fs';
import { randomBytes, randomUUID, generateKeyPairSync, sign } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
import type { Principal } from '../../packages/shared/src/index.js';
import { generateDomain, verifyPostal } from '../../packages/mail/src/index.js';
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
  await sql`truncate inbound_messages,forwarding_rules cascade`;
  await sql`update domains set receiving=true,status='verified',checked_at=now(),records=${sql.json([{ purpose: 'receiving', type: 'MX', name: 'example.com', value: 'postal.example.com', status: 'verified' }])}`;
  objects.clear();
});
afterAll(async () => {
  await sql.end();
  await server.stop();
  await db.close();
});

import {
  acceptInbound,
  parseInbound,
  forwardInbound,
  validateForwardingRule,
} from '../../packages/platform/src/inbound.js';
const rawMail = (extra = '') =>
  Buffer.from(
    `From: Original <original@example.net>\r\nTo: visible@example.com\r\nSubject: Test inbound\r\n${extra}MIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=flaretest\r\n\r\n--flaretest\r\nContent-Type: text/plain\r\n\r\nHello inbound\r\n--flaretest\r\nContent-Type: text/plain; name=hello.txt\r\nContent-Disposition: attachment; filename=hello.txt\r\nContent-Transfer-Encoding: base64\r\n\r\naGVsbG8=\r\n--flaretest--\r\n`,
  );
function payload(mime = rawMail(), id = 1) {
  return {
    id,
    rcpt_to: 'hidden@example.com',
    mail_from: 'original@example.net',
    message:
      mime
        .toString('base64')
        .match(/.{1,60}/g)!
        .join('\n') + '\n',
    base64: true,
    size: mime.length,
  };
}
it('persists raw MIME, deduplicates receipt and parsing, preserves the envelope and emits metadata only', async () => {
  const body = payload(),
    first = await acceptInbound(sql, options.store, domainId, body);
  expect(await acceptInbound(sql, options.store, domainId, body)).toMatchObject({
    id: first.id,
    duplicate: true,
  });
  await expect(
    acceptInbound(sql, options.store, domainId, payload(rawMail('X-Changed: yes\r\n'))),
  ).rejects.toThrow('conflicts');
  await parseInbound(sql, options.store, first.id);
  await parseInbound(sql, options.store, first.id);
  const [row] = await sql`select * from inbound_messages where id=${first.id}`;
  expect(row).toMatchObject({ status: 'parsed', rcpt_to: 'hidden@example.com', attempts: 1 });
  const [file] = await sql`select * from inbound_attachments where inbound_id=${first.id}`;
  expect(file).toMatchObject({ filename: 'hello.txt', size: 5 });
  expect(objects.get(String(file!.object_key))?.toString()).toBe('hello');
  const events = await sql`select * from event_outbox where type='email.received'`;
  expect(events).toHaveLength(1);
  expect(events[0]!.data).toMatchObject({
    inbound_id: first.id,
    to: 'hidden@example.com',
    attachment_count: 1,
  });
  expect(JSON.stringify(events[0]!.data)).not.toContain('Hello inbound');
  expect(
    await withTenant(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      (tx) => tx`select * from inbound_messages`,
    ),
  ).toHaveLength(0);
  expect(
    await withTenant(
      sql,
      { orgId: org, environmentId: otherEnv },
      (tx) => tx`select * from inbound_attachments`,
    ),
  ).toHaveLength(0);
  await expect(
    withTenant(
      sql,
      { orgId: otherOrg, environmentId: foreignEnv },
      (tx) =>
        tx`insert into inbound_attempts(org_id,environment_id,inbound_id,ordinal,status) values(${otherOrg},${foreignEnv},${first.id},2,'parsed')`,
    ),
  ).rejects.toThrow();
});
it('rejects unverified domains, mismatched recipients and malformed encoding; stores permanent parsing failure once', async () => {
  await expect(
    acceptInbound(sql, options.store, domainId, { ...payload(), rcpt_to: 'recipient@other.com' }),
  ).rejects.toThrow('Verified');
  await sql`update domains set status='pending' where id=${domainId}`;
  await expect(acceptInbound(sql, options.store, domainId, payload())).rejects.toThrow('Verified');
  await sql`update domains set status='verified' where id=${domainId}`;
  await expect(
    acceptInbound(sql, options.store, domainId, { ...payload(), message: '!!!!' }),
  ).rejects.toThrow('base64');
  const result = await acceptInbound(
    sql,
    options.store,
    domainId,
    payload(Buffer.from('not MIME')),
  );
  await expect(parseInbound(sql, options.store, result.id)).rejects.toThrow('headers');
  await parseInbound(sql, options.store, result.id);
  expect(
    (await sql`select status,attempts from inbound_messages where id=${result.id}`)[0],
  ).toMatchObject({ status: 'failed', attempts: 1 });
  expect(await sql`select * from event_outbox`).toHaveLength(0);
});
it('requires fresh verified receiving MX separately from domain ownership', async () => {
  await sql`update domains set checked_at=now()-interval '25 hours' where id=${domainId}`;
  await expect(acceptInbound(sql, options.store, domainId, payload())).rejects.toThrow('Verified');
  await sql`update domains set checked_at=now(),records=${sql.json([{ purpose: 'receiving', type: 'MX', name: 'example.com', status: 'failed' }])} where id=${domainId}`;
  await expect(acceptInbound(sql, options.store, domainId, payload())).rejects.toThrow('Verified');
  await sql`update domains set records=${sql.json([{ purpose: 'receiving', type: 'MX', name: 'other.example.com', status: 'verified' }])} where id=${domainId}`;
  await expect(acceptInbound(sql, options.store, domainId, payload())).rejects.toThrow('Verified');
  expect(await sql`select * from inbound_messages`).toHaveLength(0);
  expect(objects.size).toBe(0);
});
it('retries storage errors without acknowledging failed writes or losing pending parsing work', async () => {
  const broken = {
    ...options.store,
    put: async () => {
      throw new Error('offline');
    },
  };
  await expect(acceptInbound(sql, broken, domainId, payload())).rejects.toThrow('offline');
  expect(await sql`select * from inbound_messages`).toHaveLength(0);
  const first = await acceptInbound(sql, options.store, domainId, payload());
  await expect(parseInbound(sql, broken, first.id)).rejects.toThrow('offline');
  expect((await sql`select status,attempts from inbound_messages`)[0]).toMatchObject({
    status: 'pending',
    attempts: 1,
  });
  await sql`update inbound_messages set next_attempt_at=now()`;
  await parseInbound(sql, options.store, first.id);
  expect(await sql`select * from inbound_attempts`).toHaveLength(2);
  expect(await sql`select * from inbound_attachments`).toHaveLength(1);
});
it('forwards atomically through the mail pipeline, retains Reply-To, suppresses and prevents loops', async () => {
  const rule = await withTenant(sql, principal, (tx) =>
    validateForwardingRule(tx, principal, {
      domain_id: domainId,
      sender: 'forward@example.com',
      destinations: ['destination@example.net'],
    }),
  );
  await sql`insert into forwarding_rules(org_id,environment_id,domain_id,sender,destinations) values(${org},${env},${domainId},${rule.sender},${sql.json(rule.destinations)})`;
  const first = await acceptInbound(sql, options.store, domainId, payload());
  await parseInbound(sql, options.store, first.id);
  const [job] = await sql`select * from inbound_forwards`;
  await forwardInbound(options, String(job!.id));
  await forwardInbound(options, String(job!.id));
  const messages = await sql`select * from messages`;
  expect(messages).toHaveLength(1);
  const mime = objects.get(String(messages[0]!.mime_key))!.toString();
  expect(mime).toContain('Reply-To: original@example.net');
  expect(mime).toContain('X-Flare-Forwarded:');
  expect(mime).not.toContain('Bcc:');
  for (const [index, header] of [
    'X-Flare-Forwarded: previous\r\n',
    'Auto-Submitted: auto-generated\r\n',
  ].entries()) {
    const next = await acceptInbound(
      sql,
      options.store,
      domainId,
      payload(rawMail(header), index + 2),
    );
    await parseInbound(sql, options.store, next.id);
    expect(
      (await sql`select status from inbound_forwards where inbound_id=${next.id}`)[0]!.status,
    ).toBe('skipped');
  }
  await sql`insert into suppressions(org_id,address,reason) values(${org},'destination@example.net','manual')`;
  const next = await acceptInbound(sql, options.store, domainId, payload(rawMail(), 5));
  await parseInbound(sql, options.store, next.id);
  await forwardInbound(
    options,
    String((await sql`select id from inbound_forwards where inbound_id=${next.id}`)[0]!.id),
  );
  expect((await sql`select status from messages order by created_at desc limit 1`)[0]!.status).toBe(
    'suppressed',
  );
  await expect(
    withTenant(sql, principal, (tx) =>
      validateForwardingRule(tx, principal, {
        domain_id: domainId,
        sender: 'forward@example.com',
        destinations: ['loop@example.com'],
      }),
    ),
  ).rejects.toThrow('loop');
  await expect(
    withTenant(sql, { ...principal, domainId: randomUUID() }, (tx) =>
      validateForwardingRule(
        tx,
        { ...principal, domainId: randomUUID() },
        { domain_id: domainId, sender: 'forward@example.com', destinations: ['dest@example.net'] },
      ),
    ),
  ).rejects.toThrow('unavailable');
});
it('enforces decoded attachment limits and verifies native Postal signatures against exact request bytes', async () => {
  process.env.INBOUND_ATTACHMENT_LIMIT = '4';
  try {
    const result = await acceptInbound(sql, options.store, domainId, payload());
    await expect(parseInbound(sql, options.store, result.id)).rejects.toThrow('attachments');
    expect(await sql`select * from inbound_attachments`).toHaveLength(0);
  } finally {
    delete process.env.INBOUND_ATTACHMENT_LIMIT;
  }
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const bytes = Buffer.from(JSON.stringify(payload())),
    signature = sign('sha256', bytes, keys.privateKey).toString('base64');
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  expect(() => verifyPostal(bytes, signature, publicKey)).not.toThrow();
  expect(() =>
    verifyPostal(Buffer.concat([bytes, Buffer.from(' ')]), signature, publicKey),
  ).toThrow();
});
