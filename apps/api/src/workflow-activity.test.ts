import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { connectDatabase } from '../../../packages/db/src/index.js';
import type { Sql } from '../../../packages/db/src/index.js';
import { workflowActivity } from './workflow-activity.js';

const orgId = randomUUID(),
  environmentId = randomUUID(),
  otherOrg = randomUUID(),
  otherEnvironment = randomUUID(),
  production = randomUUID();
const tenant = { orgId, environmentId };
let db: PGlite, server: PGLiteSocketServer, sql: Sql;
beforeAll(async () => {
  db = await PGlite.create();
  await db.exec('SET client_min_messages = error');
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((v) => v.endsWith('.sql') && !v.startsWith('0000')))
    await db.exec(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await db.query(
    "insert into organizations(id,name,slug) values($1,'Activity A','activity-a'),($2,'Activity B','activity-b')",
    [orgId, otherOrg],
  );
  await db.query(
    "insert into environments(id,org_id,name) values($1,$2,'Development'),($3,$2,'Production'),($4,$5,'Development')",
    [environmentId, orgId, production, otherEnvironment, otherOrg],
  );
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate workflow_runs cascade`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
async function createRun(status = 'accepted') {
  const id = randomUUID(),
    parent = randomUUID(),
    transaction = `${parent}-1`;
  await sql`insert into workflow_runs(id,org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload,status) values(${id},${orgId},${environmentId},'activity-example',${transaction},${parent},${sql.json({ message: 'Durable local payload' })},${status})`;
  return { id, parent, transaction };
}
it('keeps the durable run readable during an engine outage without leaking upstream details or changing state', async () => {
  const run = await createRun();
  const engine = vi.fn(async () => {
    throw new Error('private provider token and response body');
  });
  const result = await workflowActivity(sql, tenant, run.id, engine);
  expect(result).toMatchObject({
    id: run.id,
    transaction_id: run.transaction,
    parent_transaction_id: run.parent,
    status: 'accepted',
    payload: { message: 'Durable local payload' },
    engine: null,
    engine_observation: { status: 'unavailable' },
  });
  expect(new Date(result.engine_observation.checked_at!).toISOString()).toBe(
    result.engine_observation.checked_at,
  );
  expect(JSON.stringify(result)).not.toContain('private provider');
  expect(engine).toHaveBeenCalledExactlyOnceWith(run.transaction);
  expect(
    (await sql`select status,attempts from workflow_runs where id=${run.id}`)[0],
  ).toMatchObject({ status: 'accepted', attempts: 0 });
});
it.each([
  { name: 'empty result', value: [] },
  { name: 'pending notification', value: [{ _id: 'notification', status: 'pending' }] },
])('preserves a successful engine response: $name', async ({ value }) => {
  const run = await createRun();
  const result = await workflowActivity(sql, tenant, run.id, async () => value);
  expect(result.engine).toBe(value);
  expect(result.engine_observation.status).toBe('available');
  expect(result.engine_observation.checked_at).toEqual(expect.any(String));
  expect(result.status).toBe('accepted');
});
it.each(['queued', 'dispatching', 'failed', 'ambiguous', 'canceled'])(
  'does not request engine evidence for a %s run',
  async (status) => {
    const run = await createRun(status);
    const engine = vi.fn(async () => []);
    const result = await workflowActivity(sql, tenant, run.id, engine);
    expect(result.engine).toBeNull();
    expect(result.engine_observation).toEqual({ status: 'not_requested', checked_at: null });
    expect(engine).not.toHaveBeenCalled();
  },
);
it('returns the same not-found boundary for missing runs, other organizations and other environments before consulting Novu', async () => {
  const run = await createRun();
  const engine = vi.fn(async () => []);
  await expect(workflowActivity(sql, tenant, randomUUID(), engine)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    workflowActivity(sql, { orgId: otherOrg, environmentId: otherEnvironment }, run.id, engine),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    workflowActivity(sql, { orgId, environmentId: production }, run.id, engine),
  ).rejects.toMatchObject({ status: 404 });
  expect(engine).not.toHaveBeenCalled();
});
