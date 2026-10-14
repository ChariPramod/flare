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
  expect(engine).toHaveBeenCalledExactlyOnceWith(run.transaction, expect.any(AbortSignal));
  expect(
    (await sql`select status,attempts from workflow_runs where id=${run.id}`)[0],
  ).toMatchObject({ status: 'accepted', attempts: 0 });
});
it.each([
  { name: 'empty result', value: [], status: 'not_found' },
  {
    name: 'pending notification',
    value: [{ _id: 'notification', status: 'pending' }],
    status: 'available',
  },
])('preserves a successful engine response: $name', async ({ value, status }) => {
  const run = await createRun();
  const result = await workflowActivity(sql, tenant, run.id, async () => value);
  expect(result.engine).toBe(value);
  expect(result.engine_observation.status).toBe(status);
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
    expect(result.engine_observation).toMatchObject({ status: 'not_requested', checked_at: null });
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

const job = (type: string, status: string) => ({
  _id: randomUUID(),
  type,
  status,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T01:00:00Z',
  payload: { secret: 'must not normalize' },
});
it('normalizes delayed fanout evidence and scopes advisory cancellation to the parent without changing acceptance', async () => {
  const run = await createRun();
  const list = [
    { _id: 'native-one', transactionId: run.transaction },
    { _id: 'native-two', transactionId: run.transaction },
  ];
  const detail = vi.fn(async (id: string, _signal: AbortSignal) => ({
    _id: id,
    transactionId: run.transaction,
    jobs: [job('delay', 'delayed'), job('in_app', 'pending')],
  }));
  const result = await workflowActivity(sql, tenant, run.id, async () => list, detail);
  expect(result.engine).toBe(list);
  expect(result.status).toBe('accepted');
  expect(result.engine_observation).toMatchObject({
    status: 'available',
    partial: false,
    notifications: [{ status: 'pending' }, { status: 'pending' }],
  });
  expect(result.engine_observation.notifications[0]?.jobs[0]).toMatchObject({
    type: 'delay',
    status: 'delayed',
    updated_at: '2026-01-01T01:00:00.000Z',
  });
  expect(JSON.stringify(result.engine_observation)).not.toContain('must not normalize');
  expect(result.cancellation).toEqual({
    eligible: true,
    transaction_id: run.parent,
    scope: 'trigger',
    reason: 'pending_action',
  });
  expect(detail).toHaveBeenCalledTimes(2);
  expect(detail.mock.calls[0]?.[1]).toBe(detail.mock.calls[1]?.[1]);
});
it.each([
  { states: ['completed', 'skipped'], expected: 'completed', reason: 'no_pending_action' },
  { states: ['merged', 'completed'], expected: 'completed', reason: 'no_pending_action' },
  { states: ['completed', 'failed'], expected: 'failed', reason: 'no_pending_action' },
  { states: ['completed', 'canceled'], expected: 'canceled', reason: 'no_pending_action' },
  { states: ['running', 'pending'], expected: 'running', reason: 'no_pending_action' },
  { states: ['new-native-state', 'pending'], expected: 'unknown', reason: 'unknown' },
])('does not offer delayed-work cancellation for $states', async ({ states, expected, reason }) => {
  const run = await createRun();
  const result = await workflowActivity(
    sql,
    tenant,
    run.id,
    async () => [{ _id: 'native' }],
    async () => ({
      _id: 'native',
      jobs: states.map((status, i) => job(i ? 'in_app' : 'delay', status)),
    }),
  );
  expect(result.engine_observation.notifications[0]?.status).toBe(expected);
  expect(result.cancellation).toMatchObject({ eligible: false, reason });
  expect((await sql`select status from workflow_runs where id=${run.id}`)[0]?.status).toBe(
    'accepted',
  );
});
it('bounds fanout detail work and job summaries and marks incomplete evidence', async () => {
  const run = await createRun();
  const detail = vi.fn(async (id: string) => ({
    _id: id,
    jobs: Array.from({ length: 51 }, () => job('delay', 'delayed')),
  }));
  const result = await workflowActivity(
    sql,
    tenant,
    run.id,
    async () => Array.from({ length: 200 }, (_, i) => ({ _id: String(i) })),
    detail,
  );
  expect(detail).toHaveBeenCalledTimes(10);
  expect(result.engine_observation.notifications).toHaveLength(10);
  expect(result.engine_observation.notifications[0]?.jobs).toHaveLength(50);
  expect(result.engine_observation.partial).toBe(true);
  expect(result.cancellation).toMatchObject({ eligible: false, reason: 'unknown' });
});
it('retains good sibling evidence on detail failures and rejects unexpected transactions', async () => {
  const run = await createRun();
  const detail = vi.fn(async (id: string) => {
    if (id === 'gone') throw new Error('private details');
    return { _id: id, jobs: [job('digest', 'delayed')] };
  });
  const result = await workflowActivity(
    sql,
    tenant,
    run.id,
    async () => [{ _id: 'good' }, { _id: 'gone' }, { _id: 'wrong', transactionId: 'another-run' }],
    detail,
  );
  expect(detail).toHaveBeenCalledTimes(2);
  expect(result.engine_observation).toMatchObject({
    status: 'available',
    partial: true,
    notifications: [
      { id: 'good', status: 'pending' },
      { id: 'gone', status: 'unknown' },
    ],
  });
  expect(JSON.stringify(result.engine_observation)).not.toContain('private details');
  expect(result.cancellation.eligible).toBe(false);
});
it('treats missing, malformed and mismatched native evidence as unknown without resubmitting old accepted work', async () => {
  const run = await createRun();
  await sql`update workflow_runs set created_at=now()-interval '1 year' where id=${run.id}`;
  for (const response of [[], { malformed: true }]) {
    const result = await workflowActivity(sql, tenant, run.id, async () => response);
    expect(result.cancellation).toMatchObject({ eligible: false, reason: 'unknown' });
    expect(result.engine_observation.status).toBe(
      Array.isArray(response) ? 'not_found' : 'unavailable',
    );
  }
  const result = await workflowActivity(
    sql,
    tenant,
    run.id,
    async () => [{ _id: 'native' }],
    async () => ({ _id: 'wrong', jobs: [job('delay', 'delayed')] }),
  );
  expect(result.engine_observation.partial).toBe(true);
  expect(result.cancellation.eligible).toBe(false);
  expect(
    (await sql`select status,attempts from workflow_runs where id=${run.id}`)[0],
  ).toMatchObject({ status: 'accepted', attempts: 0 });
});

it('uses a shared deadline and keeps a completed sibling summary when another detail times out', async () => {
  const run = await createRun();
  const timeout = AbortSignal.timeout.bind(AbortSignal);
  const deadline = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => timeout(25));
  try {
    const result = await workflowActivity(
      sql,
      tenant,
      run.id,
      async () => [{ _id: 'ready' }, { _id: 'slow' }],
      async (id, signal) => {
        if (id === 'ready') return { _id: id, jobs: [job('delay', 'delayed')] };
        return new Promise((_, reject) => {
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      },
    );
    expect(deadline).toHaveBeenCalledExactlyOnceWith(5000);
    expect(result.engine_observation).toMatchObject({
      status: 'available',
      partial: true,
      notifications: [
        { id: 'ready', status: 'pending' },
        { id: 'slow', status: 'unknown' },
      ],
    });
    expect(result.cancellation.eligible).toBe(false);
  } finally {
    deadline.mockRestore();
  }
});
