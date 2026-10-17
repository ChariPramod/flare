import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { connectDatabase } from '../../../packages/db/src/index.js';
import type { Sql } from '../../../packages/db/src/index.js';
import { collectOperationalMetrics, readOperationalSnapshot } from './operational-metrics.js';
import { registry } from '@flare/shared';
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
const org = randomUUID(),
  production = randomUUID(),
  development = randomUUID(),
  domain = randomUUID(),
  operator = randomUUID();
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql') && !file.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate organizations,users cascade`;
  await sql`insert into organizations(id,name,slug) values(${org},'Metrics fixture','metrics')`;
  await sql`insert into environments(id,org_id,name) values(${production},${org},'Production'),(${development},${org},'Development')`;
  await sql`insert into users(id,email,name) values(${operator},'metrics@example.test','Metrics operator')`;
  await sql`insert into domains(id,org_id,environment_id,name,status,checked_at,dkim_selector,dkim_public,dkim_private_cipher) values(${domain},${org},${production},'metrics.example.test','verified',now(),'fixture','fixture','fixture')`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function message(status = 'queued') {
  const id = randomUUID();
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status) values(${id},${org},${production},${domain},'{}','sender@example.test',${status})`;
  return id;
}
it('exports zeroes for all fixed categories when there is no eligible work', async () => {
  const snapshot = await readOperationalSnapshot(sql);
  expect(Object.keys(snapshot.due)).toHaveLength(9);
  expect(Object.values(snapshot.due).every((value) => value.count === 0 && value.age === 0)).toBe(
    true,
  );
  expect(Object.values(snapshot.failed).every((value) => value === 0)).toBe(true);
  expect(Object.values(snapshot.safety).every((value) => value === 0)).toBe(true);
});
it('measures age from eligibility and excludes future schedules, retries and held mail', async () => {
  const eligible = await message(),
    future = await message('scheduled'),
    retry = await message(),
    held = await message('held');
  await sql`update messages set scheduled_at=now()-interval '3 hours',next_attempt_at=now()-interval '7 minutes' where id=${eligible}`;
  await sql`update messages set scheduled_at=now()+interval '1 hour' where id=${future}`;
  await sql`update messages set next_attempt_at=now()+interval '1 hour' where id=${retry}`;
  await sql`update messages set next_attempt_at=now()-interval '1 day' where id=${held}`;
  const snapshot = await readOperationalSnapshot(sql);
  expect(snapshot.due.email.count).toBe(1);
  expect(snapshot.due.email.age).toBeGreaterThanOrEqual(420);
  expect(snapshot.due.email.age).toBeLessThan(425);
  expect(snapshot.pending.email).toBe(3);
  expect(snapshot.safety.held_email).toBe(1);
});
it('matches persisted failures and counts ambiguous email identities once across attempts', async () => {
  const id = await message('failed');
  await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,recipients) values(${org},${production},${id},'postal',1,'ambiguous','[]'),(${org},${production},${id},'postal',2,'ambiguous','[]')`;
  for (const status of ['failed', 'ambiguous', 'canceled'])
    await sql`insert into workflow_runs(org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload,status,cancellation_status) values(${org},${production},'fixture',${randomUUID()},'fixture','{}',${status},${status === 'canceled' ? 'failed' : 'none'})`;
  await sql`update sending_policies set state='suspended' where org_id=${org}`;
  const snapshot = await readOperationalSnapshot(sql);
  expect(snapshot.failed.email).toBe(1);
  expect(snapshot.failed.workflow).toBe(3);
  expect(snapshot.safety.ambiguous_email).toBe(1);
  expect(snapshot.safety.ambiguous_workflow).toBe(1);
  expect(snapshot.safety.suspended_organizations).toBe(1);
});
it('restricts staleness to existing Production sending evidence without certifying missing evidence', async () => {
  const devDomain = randomUUID();
  await sql`insert into domains(id,org_id,environment_id,name,status,checked_at,dkim_selector,dkim_public,dkim_private_cipher) values(${devDomain},${org},${development},'dev.example.test','verified',now()-interval '2 days','fixture','fixture','fixture')`;
  await sql`update domains set checked_at=now()-interval '25 hours' where id=${domain}`;
  await sql`insert into domain_transport_readiness(org_id,environment_id,domain_id,transport_instance,evidence,config_fingerprint,actor_id,checked_at,revoked_at) values(${org},${production},${domain},'old','{}','fixture',${operator},now()-interval '25 hours',null),(${org},${production},${domain},'revoked','{}','fixture',${operator},now()-interval '25 hours',now()),(${org},${development},${devDomain},'development','{}','fixture',${operator},now()-interval '25 hours',null)`;
  const snapshot = await readOperationalSnapshot(sql);
  expect(snapshot.safety.stale_dns).toBe(1);
  expect(snapshot.safety.stale_transport).toBe(1);
  await sql`update domains set sending=false where id=${domain}`;
  const disabled = await readOperationalSnapshot(sql);
  expect(disabled.safety.stale_dns).toBe(0);
  expect(disabled.safety.stale_transport).toBe(0);
});
it('does not report a later publication item as eligible while an earlier item is backed off', async () => {
  const operation = randomUUID();
  await sql`insert into publication_operations(id,org_id,environment_id,target_environment_id,actor_id,snapshot_hash) values(${operation},${org},${development},${production},${operator},'fixture')`;
  await sql`insert into publication_items(org_id,environment_id,operation_id,ordinal,kind,identifier,snapshot,next_attempt_at) values(${org},${development},${operation},0,'workflow','first','{}',now()+interval '1 hour'),(${org},${development},${operation},1,'workflow','second','{}',now()-interval '1 hour')`;
  expect((await readOperationalSnapshot(sql)).due.publication.count).toBe(0);
  await sql`update publication_items set status='completed' where operation_id=${operation} and ordinal=0`;
  expect((await readOperationalSnapshot(sql)).due.publication.count).toBe(1);
});
it('caps counts and retains the true oldest eligibility timestamp', async () => {
  await sql`insert into workflow_runs(org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload,next_attempt_at) select ${org},${production},'fixture',n::text,'fixture','{}',now()-n*interval '1 second' from generate_series(1,10005) n`;
  const snapshot = await readOperationalSnapshot(sql);
  expect(snapshot.pending.workflow).toBe(10001);
  expect(snapshot.due.workflow.count).toBe(10001);
  expect(snapshot.due.workflow.age).toBeGreaterThanOrEqual(10005);
});
it('exports shared-dependency failures and retains the snapshot timestamp on database failure', async () => {
  await collectOperationalMetrics(sql, {
    redis: async () => undefined,
    objects: async () => {
      throw new Error('unavailable');
    },
  });
  const first = await registry
    .getSingleMetric('flare_operational_collection_timestamp_seconds')!
    .get();
  const text = await registry.metrics();
  expect(text).toContain('flare_dependency_ready{dependency="objects",service="flare"} 0');
  expect(text).toContain('flare_dependency_ready{dependency="redis",service="flare"} 1');
  expect(text).not.toContain('metrics.example.test');
  await expect(
    collectOperationalMetrics(
      {
        begin: async () => {
          throw new Error('database down');
        },
      } as unknown as Sql,
      { redis: async () => undefined, objects: async () => undefined },
    ),
  ).rejects.toThrow('database down');
  expect(
    (await registry.getSingleMetric('flare_operational_collection_timestamp_seconds')!.get())
      .values,
  ).toEqual(first.values);
  expect(
    (await registry.getSingleMetric('flare_operational_collection_success')!.get()).values[0]!
      .value,
  ).toBe(0);
});
