import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { connectDatabase, withTenant } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { storageIdentity } from './storage.js';
import { sweepObjectUploads, putManagedObject } from './object-uploads.js';

const org = randomUUID(),
  env = randomUUID(),
  foreignOrg = randomUUID(),
  foreignEnv = randomUUID();
const identity = storageIdentity('http://localhost:9000', 'us-east-1', 'flare');
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')", [
    org,
    foreignOrg,
  ]);
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$4,'Development')",
    [env, org, foreignEnv, foreignOrg],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});

it('canonicalizes storage identity without retaining endpoints or accepting credential-bearing URLs', () => {
  expect(identity).toMatch(/^[0-9a-f]{64}$/);
  expect(identity).toBe(storageIdentity('http://LOCALHOST:9000/', 'us-east-1', 'flare'));
  expect(identity).not.toBe(storageIdentity('http://localhost:9000', 'us-east-1', 'other'));
  expect(identity).not.toBe(storageIdentity('http://localhost:9000', 'other', 'flare'));
  for (const endpoint of [
    'http://name:secret@localhost',
    'http://localhost?token=secret',
    'http://localhost#secret',
    'file:///tmp/storage',
  ])
    expect(() => storageIdentity(endpoint, 'us-east-1', 'flare')).toThrow();
});

it('isolates upload intents, restricts tenant mutations and retains tombstones across tenant deletion attempts', async () => {
  const id = randomUUID(),
    key = `fixture/${id}`;
  await sql`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${id},${org},${env},${identity},${key})`;
  await expect(
    sql`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${randomUUID()},${org},${foreignEnv},${identity},${randomUUID()})`,
  ).rejects.toThrow(/foreign key/);
  expect(
    await withTenant(
      sql,
      { orgId: foreignOrg, environmentId: foreignEnv },
      (tx) => tx`select id from object_uploads`,
    ),
  ).toHaveLength(0);
  await expect(
    withTenant(
      sql,
      { orgId: org, environmentId: env },
      (tx) =>
        tx`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${randomUUID()},${org},${env},${identity},'forged')`,
    ),
  ).rejects.toThrow(/permission denied/);
  await withTenant(
    sql,
    { orgId: org, environmentId: env },
    (tx) => tx`update object_uploads set state='adopted',adopted_at=now() where id=${id}`,
  );
  await expect(sql`update object_uploads set object_key='changed' where id=${id}`).rejects.toThrow(
    /immutable/,
  );
  await sql`update object_uploads set state='tombstoned' where id=${id}`;
  await expect(
    withTenant(
      sql,
      { orgId: org, environmentId: env },
      (tx) => tx`update object_uploads set state='adopted',adopted_at=now() where id=${id}`,
    ),
  ).rejects.toThrow(/Only prepared/);
  await expect(
    withTenant(
      sql,
      { orgId: org, environmentId: env },
      (tx) => tx`delete from object_uploads where id=${id}`,
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(sql`delete from environments where id=${env}`).rejects.toThrow(/foreign key/);
  await expect(
    sql`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key) values(${randomUUID()},${org},${env},${identity},${key})`,
  ).rejects.toThrow(/unique/);
});

it('only collects due journal entries for the exact store and keeps tombstones for late PUTs', async () => {
  const id = randomUUID(),
    key = `fixture/${id}`,
    other = randomUUID();
  await sql`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key,next_check_at) values(${id},${org},${env},${identity},${key},now()-interval '1 day'),(${other},${org},${env},${'f'.repeat(64)},${other},now()-interval '1 day')`;
  const objects = new Set([key, other, 'legacy-unknown']);
  const store = {
    identity,
    assertUnversioned: async () => undefined,
    put: async () => undefined,
    get: async () => Buffer.alloc(0),
    remove: async (k: string) => {
      objects.delete(k);
    },
  };
  expect((await sweepObjectUploads(sql, store)).deleted).toBe(1);
  expect(objects).toEqual(new Set([other, 'legacy-unknown']));
  const [row] = await sql`select state,delete_attempts from object_uploads where id=${id}`;
  expect(row).toMatchObject({ state: 'tombstoned', delete_attempts: 1 });
  // Simulate the server completing a previously accepted PUT after deletion.
  objects.add(key);
  await sql`update object_uploads set next_check_at=now()-interval '1 second' where id=${id}`;
  expect((await sweepObjectUploads(sql, store)).deleted).toBe(1);
  expect(objects.has(key)).toBe(false);
  const [again] = await sql`select state,delete_attempts from object_uploads where id=${id}`;
  expect(again).toMatchObject({ state: 'tombstoned', delete_attempts: 2 });
  await expect(
    sweepObjectUploads(sql, {
      ...store,
      assertUnversioned: async () => {
        throw new Error('Versioning suspended');
      },
    }),
  ).rejects.toThrow('Versioning suspended');
  expect(objects.has('legacy-unknown')).toBe(true);
});

it('preserves every committed inbound and outbound reference, including cross-tenant references', async () => {
  const domain = randomUUID(),
    message = randomUUID(),
    inbound = randomUUID();
  const keys = Array.from({ length: 5 }, () => `${org}/${env}/${randomUUID()}`);
  await sql`insert into domains(id,org_id,environment_id,name,dkim_selector,dkim_public,dkim_private_cipher) values(${domain},${foreignOrg},${foreignEnv},'foreign.example','test','public','cipher')`;
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,mime_key,envelope_from,status) values(${message},${foreignOrg},${foreignEnv},${domain},${sql.json({ attachments: [{ key: keys[1]! }] })},${keys[0]!},'sender@foreign.example','queued')`;
  await sql`insert into inbound_messages(id,org_id,environment_id,domain_id,postal_id,content_hash,mail_from,rcpt_to,raw_key,body_key,size) values(${inbound},${foreignOrg},${foreignEnv},${domain},'fixture','hash','sender@foreign.example','rcpt@foreign.example',${keys[2]!},${keys[3]!},1)`;
  await sql`insert into inbound_attachments(org_id,environment_id,inbound_id,filename,content_type,size,object_key) values(${foreignOrg},${foreignEnv},${inbound},'attachment','text/plain',1,${keys[4]!})`;
  for (const key of keys)
    await sql`insert into object_uploads(id,org_id,environment_id,storage_identity,object_key,next_check_at) values(${randomUUID()},${org},${env},${identity},${key},now()-interval '1 day')`;
  let deleted = 0;
  const result = await sweepObjectUploads(sql, {
    identity,
    assertUnversioned: async () => undefined,
    put: async () => undefined,
    get: async () => Buffer.alloc(0),
    remove: async () => {
      deleted++;
    },
  });
  expect(result.referenced).toBe(5);
  expect(deleted).toBe(0);
  expect(
    await sql`select id from object_uploads where object_key in ${sql(keys)} and state='tombstoned'`,
  ).toHaveLength(0);
});

it('rejects foreign or ambiguous object keys before attempting storage or journal access', async () => {
  let puts = 0;
  const store = {
    put: async () => {
      puts++;
    },
    get: async () => Buffer.alloc(0),
    remove: async () => undefined,
  };
  for (const key of [
    'legacy',
    `${foreignOrg}/${foreignEnv}/key`,
    `${org}/${env}/../key`,
    `${org}/${env}//key`,
    `${org}/${env}/a?secret`,
  ])
    await expect(
      putManagedObject(
        sql,
        {} as Transaction,
        store,
        { orgId: org, environmentId: env },
        key,
        Buffer.alloc(0),
        'text/plain',
      ),
    ).rejects.toThrow('tenant');
  expect(puts).toBe(0);
});
