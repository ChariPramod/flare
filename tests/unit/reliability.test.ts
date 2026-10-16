import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { connectDatabase } from '../../packages/db/src/index.js';
import type { Sql } from '../../packages/db/src/index.js';
const org = randomUUID(),
  env = randomUUID(),
  otherOrg = randomUUID(),
  otherEnv = randomUUID(),
  foreignEnv = randomUUID();
const principal = {
  orgId: org,
  environmentId: env,
  actorId: randomUUID(),
  kind: 'session' as const,
  role: 'owner' as const,
  production: false,
};
let sql: Sql, db: PGlite, server: PGLiteSocketServer;
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
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  sql = connectDatabase(`postgres://postgres:postgres@${server.getServerConn()}/postgres`, {
    max: 1,
  }).client;
  sql.options.onnotice = () => undefined;
}, 30000);
beforeEach(async () => {
  await sql`truncate workflow_runs,messages,domains cascade`;
});
afterAll(async () => {
  await sql?.end();
  await server?.stop();
  await db?.close();
});
import {
  dispatchWorkflow,
  cancelWorkflow,
  recoverWorkflowRuns,
  sendWorkflowRequest,
} from '../../packages/platform/src/workflow-delivery.js';
import { redriveDeadLetter, listDeadLetters } from '../../packages/platform/src/dead-letters.js';
async function run() {
  const id = randomUUID();
  await sql`insert into workflow_runs(id,org_id,environment_id,workflow_id,transaction_id,parent_transaction_id,payload) values(${id},${org},${env},'welcome',${id},${id},${sql.json({ name: 'welcome', transactionId: id })})`;
  return id;
}
it('omits empty native context without changing durable request or transaction identity', async () => {
  const payload = { name: 'welcome', to: 'subscriber', context: {}, transactionId: randomUUID() };
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{"data":{"acknowledged":true}}'));
  vi.stubGlobal('fetch', fetcher);
  try {
    const row = { id: randomUUID(), transaction_id: payload.transactionId, payload };
    await sendWorkflowRequest('https://engine.test', 'key', row, false);
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'welcome',
      to: 'subscriber',
      transactionId: payload.transactionId,
    });
    expect(payload.context).toEqual({});
    await sendWorkflowRequest(
      'https://engine.test',
      'key',
      { ...row, payload: { ...payload, context: { tenant: 'acme' } } },
      false,
    );
    expect(JSON.parse(String((fetcher.mock.calls[1]![1] as RequestInit).body)).context).toEqual({
      tenant: 'acme',
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
it('claims once, cancels during dispatch, and recovers durable compensation independently of queue callbacks', async () => {
  const id = await run();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let sends = 0;
  const first = dispatchWorkflow(sql, id, async () => {
    sends++;
    entered();
    await gate;
    return { kind: 'accepted' };
  });
  await ready;
  await dispatchWorkflow(sql, id, async () => {
    sends++;
    return { kind: 'accepted' };
  });
  await cancelWorkflow(sql, principal, id);
  await dispatchWorkflow(sql, id, async () => {
    throw new Error('Must not compensate before the in-flight trigger settles');
  });
  release();
  await first;
  expect(sends).toBe(1);
  expect(
    (await sql`select status,cancellation_status from workflow_runs where id=${id}`)[0],
  ).toMatchObject({ status: 'canceled', cancellation_status: 'pending' });
  await dispatchWorkflow(sql, id, async (_run, cancel) => {
    expect(cancel).toBe(true);
    return { kind: 'transient', error: 'Retry cancellation' };
  });
  await sql`update workflow_runs set next_attempt_at=now() where id=${id}`;
  await dispatchWorkflow(sql, id, async (_run, cancel) => {
    expect(cancel).toBe(true);
    return { kind: 'accepted' };
  });
  expect(
    (
      await sql`select status,cancellation_status,cancellation_attempts from workflow_runs where id=${id}`
    )[0],
  ).toMatchObject({
    status: 'canceled',
    cancellation_status: 'confirmed',
    cancellation_attempts: 2,
  });
  await expect(redriveDeadLetter(sql, principal, 'workflow', id)).rejects.toThrow(
    'Failed inactive',
  );
});
it('persists retry exhaustion and audited redrive without changing transaction identity', async () => {
  const id = await run();
  for (let i = 0; i < 4; i++) {
    await dispatchWorkflow(sql, id, async () => ({ kind: 'transient', error: 'Refused' }));
    await sql`update workflow_runs set next_attempt_at=now() where id=${id}`;
  }
  expect((await sql`select status,attempts from workflow_runs where id=${id}`)[0]).toMatchObject({
    status: 'failed',
    attempts: 4,
  });
  expect(await listDeadLetters(sql, principal)).toHaveLength(1);
  expect(
    await listDeadLetters(sql, { ...principal, orgId: otherOrg, environmentId: foreignEnv }),
  ).toHaveLength(0);
  await expect(
    redriveDeadLetter(
      sql,
      { ...principal, orgId: otherOrg, environmentId: foreignEnv },
      'workflow',
      id,
    ),
  ).rejects.toThrow();
  await expect(
    redriveDeadLetter(sql, { ...principal, role: 'viewer' }, 'workflow', id),
  ).rejects.toThrow('Write access');
  await redriveDeadLetter(sql, principal, 'workflow', id);
  await dispatchWorkflow(sql, id, async (row) => {
    expect(row.transaction_id).toBe(id);
    return { kind: 'accepted' };
  });
  expect(
    (await sql`select status,attempts,redrives from workflow_runs where id=${id}`)[0],
  ).toMatchObject({ status: 'accepted', attempts: 5, redrives: 1 });
  expect(
    await sql`select * from audit_logs where resource_id=${id} and action='dead_letter.workflow.redriven'`,
  ).toHaveLength(1);
  await expect(redriveDeadLetter(sql, principal, 'workflow', id)).rejects.toThrow();
});
it('quarantines unknown acceptance and expired claims instead of silently resending', async () => {
  const id = await run();
  await dispatchWorkflow(sql, id, async () => {
    throw new Error('Connection lost after acceptance');
  });
  expect((await sql`select status from workflow_runs where id=${id}`)[0]!.status).toBe('ambiguous');
  await expect(redriveDeadLetter(sql, principal, 'workflow', id)).rejects.toThrow();
  await sql`update workflow_runs set status='dispatching',claim_id=${randomUUID()},lease_until=now()-interval '1 second' where id=${id}`;
  await recoverWorkflowRuns(sql);
  expect((await sql`select status,claim_id from workflow_runs where id=${id}`)[0]).toMatchObject({
    status: 'ambiguous',
    claim_id: null,
  });
  await dispatchWorkflow(sql, id, async () => {
    throw new Error('Must not send');
  });
});
it('redrives failed email recipients only and blocks uncertain provider acceptance', async () => {
  const domain = { selector: 'test', publicKey: 'test-public' };
  const did = randomUUID(),
    id = randomUUID();
  await sql`insert into domains(id,org_id,environment_id,name,region,status,dkim_selector,dkim_public,dkim_private_cipher,records) values(${did},${org},${env},'mail.example.test','us-east-1','verified',${domain.selector},${domain.publicKey},'encrypted','[]')`;
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,status,envelope_from,delivery_finished_at) values(${id},${org},${env},${did},'{}','failed','a@mail.example.test',now())`;
  await sql`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${org},${env},${id},'ok@example.test','to','sent'),(${org},${env},${id},'retry@example.test','bcc','failed')`;
  await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,recipients) values(${org},${env},${id},'smtp',1,'ambiguous','[]')`;
  await expect(redriveDeadLetter(sql, principal, 'email', id)).rejects.toThrow('Ambiguous');
  await sql`update transport_attempts set status='transient_failure' where message_id=${id}`;
  await redriveDeadLetter(sql, principal, 'email', id);
  expect((await sql`select redrives from messages where id=${id}`)[0]!.redrives).toBe(1);
  expect(
    await sql`select address,status from message_recipients where message_id=${id} order by address`,
  ).toEqual([
    { address: 'ok@example.test', status: 'sent' },
    { address: 'retry@example.test', status: 'queued' },
  ]);
});
it('interprets HTTP rejection, unknown acceptance and unconfirmed cancellation distinctly', async () => {
  const row = { id: randomUUID(), transaction_id: 'stable', payload: {} };
  for (const [status, kind] of [
    [429, 'transient'],
    [422, 'rejected'],
    [500, 'ambiguous'],
    [409, 'ambiguous'],
  ] as const) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status })),
    );
    expect((await sendWorkflowRequest('https://engine.test', 'key', row, false)).kind).toBe(kind);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"data":false}')),
  );
  expect((await sendWorkflowRequest('https://engine.test', 'key', row, true)).kind).toBe(
    'transient',
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"data":true}')),
  );
  expect((await sendWorkflowRequest('https://engine.test', 'key', row, true)).kind).toBe(
    'accepted',
  );
  vi.unstubAllGlobals();
});

it('bounds crash-recovered cancellation attempts, preserves backoff and rejects late completion', async () => {
  const id = await run();
  await dispatchWorkflow(sql, id, async () => ({ kind: 'accepted' }));
  await cancelWorkflow(sql, principal, id);
  for (let ordinal = 1; ordinal <= 4; ordinal++) {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const sending = dispatchWorkflow(sql, id, async (_row, cancel) => {
      expect(cancel).toBe(true);
      entered();
      await gate;
      return { kind: 'accepted' };
    });
    await ready;
    await sql`update workflow_runs set lease_until=now()-interval '1 second' where id=${id}`;
    try {
      await recoverWorkflowRuns(sql);
      const [state] =
        await sql`select status,cancellation_status,cancellation_attempts,claim_id,next_attempt_at>now() as deferred from workflow_runs where id=${id}`;
      expect(state).toMatchObject({
        status: 'canceled',
        cancellation_status: ordinal < 4 ? 'pending' : 'failed',
        cancellation_attempts: ordinal,
        claim_id: null,
      });
      if (ordinal < 4) expect(state!.deferred).toBe(true);
      const forbidden = vi.fn(async () => ({ kind: 'accepted' as const }));
      await dispatchWorkflow(sql, id, forbidden);
      expect(forbidden).not.toHaveBeenCalled();
    } finally {
      release();
      await sending;
    }
    expect(
      (await sql`select cancellation_status from workflow_runs where id=${id}`)[0]!
        .cancellation_status,
    ).toBe(ordinal < 4 ? 'pending' : 'failed');
    await sql`update workflow_runs set next_attempt_at=now() where id=${id}`;
  }
  await recoverWorkflowRuns(sql);
  const sender = vi.fn(async () => ({ kind: 'accepted' as const }));
  await dispatchWorkflow(sql, id, sender);
  expect(sender).not.toHaveBeenCalled();
  expect(
    await sql`select ordinal from workflow_attempts where run_id=${id} and kind='cancel' and status='ambiguous' order by ordinal`,
  ).toEqual([{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }, { ordinal: 4 }]);
  const events =
    await sql`select type,data from event_outbox where type='workflow.cancellation.failed' and data->>'id'=${id}`;
  expect(events).toHaveLength(1);
  expect(events[0]!.data.transactionId).toBe(id);
  expect(events[0]!.data.error).toContain('unknown');
});

it('keeps expired in-flight trigger cancellation pending without replaying the trigger', async () => {
  const id = await run();
  await sql`update workflow_runs set status='dispatching',claim_id=${randomUUID()},lease_until=now()-interval '1 second',attempts=1 where id=${id}`;
  await sql`insert into workflow_attempts(org_id,environment_id,run_id,kind,ordinal) values(${org},${env},${id},'trigger',1)`;
  await cancelWorkflow(sql, principal, id);
  await recoverWorkflowRuns(sql);
  expect(
    (
      await sql`select status,cancellation_status,cancellation_attempts from workflow_runs where id=${id}`
    )[0],
  ).toMatchObject({ status: 'canceled', cancellation_status: 'pending', cancellation_attempts: 0 });
  await sql`update workflow_runs set next_attempt_at=now() where id=${id}`;
  await dispatchWorkflow(sql, id, async (_row, cancel) => {
    expect(cancel).toBe(true);
    return { kind: 'accepted' };
  });
  expect(
    (
      await sql`select cancellation_status,attempts,cancellation_attempts from workflow_runs where id=${id}`
    )[0],
  ).toMatchObject({ cancellation_status: 'confirmed', attempts: 1, cancellation_attempts: 1 });
});
it('does not advertise workflow redrive when cancellation compensation exists', async () => {
  const id = await run();
  await sql`update workflow_runs set status='failed',cancellation_status='failed' where id=${id}`;
  expect((await listDeadLetters(sql, principal)).find((row) => row.id === id)).toMatchObject({
    redrivable: false,
  });
  await expect(redriveDeadLetter(sql, principal, 'workflow', id)).rejects.toThrow(
    'Failed inactive',
  );
  await sql`update workflow_runs set cancellation_status='none' where id=${id}`;
  expect((await listDeadLetters(sql, principal)).find((row) => row.id === id)).toMatchObject({
    redrivable: true,
  });
});
