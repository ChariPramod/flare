import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { decrypt } from '../../packages/shared/dist/index.js';
import { json, pause, session, sql, until } from './common.mjs';

const phase = process.argv[2];
assert.ok(['prepare', 'proxy', 'proxy-stop', 'interrupted', 'verify', 'observe'].includes(phase));
const fixturePath = '/acceptance/dispatch-crash.json';
const markerPath = '/acceptance/dispatch-crash-gate.json';
const save = (path, value) => writeFileSync(path, JSON.stringify(value), { mode: 0o600 });
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
let fixture;
try {
  if (phase === 'prepare') {
    const { api, org, env } = await session();
    const id = randomUUID();
    fixture = {
      orgId: org.id,
      environmentId: env.id,
      subscriber: `dispatch-crash-${id}`,
      workflowId: `dispatch-crash-${id}`,
      transactionId: randomUUID(),
      control: randomUUID(),
      body: `Dispatch crash receipt ${id}`,
    };
    await api('/subscribers', 'POST', { subscriberId: fixture.subscriber });
    await api('/workflows', 'POST', {
      workflowId: fixture.workflowId,
      name: fixture.workflowId,
      steps: [
        {
          stepId: 'inbox',
          name: 'Durable receipt',
          type: 'in_app',
          controlValues: { body: fixture.body },
        },
      ],
    });
    const accepted = await api('/events/trigger', 'POST', {
      name: fixture.workflowId,
      to: fixture.subscriber,
      transactionId: fixture.transactionId,
    });
    assert.equal(accepted.ids.length, 1);
    assert.equal(accepted.transactionId, fixture.transactionId);
    fixture.id = accepted.ids[0];
    const state = await api(`/activity/${fixture.id}`);
    assert.equal(state.status, 'queued', 'Normal worker must be stopped before fixture submission');
    assert.equal(state.attempts, 0);
    save(fixturePath, fixture);
    console.log('Dispatcher crash fixture: durable run queued before gated worker startup.');
  } else fixture = read(fixturePath);

  if (phase === 'proxy') {
    const target = new URL(process.env.NOVU_API_URL);
    assert.equal(
      target.origin,
      'http://novu-api:3000',
      'Proxy forwards only to internal pinned Novu',
    );
    let requests = 0;
    const held = new Set();
    const server = createServer((req, res) => {
      if (req.method === 'POST' && req.url === `/stop/${fixture.control}`) {
        res.end('stopped');
        for (const response of held) response.destroy();
        server.close();
        server.closeIdleConnections();
        return;
      }
      if (req.method !== 'POST' || req.url !== '/v1/events/trigger') {
        res.writeHead(404).end();
        return;
      }
      void (async () => {
        const startedAt = Date.now();
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          assert.ok(size <= 16384, 'Bounded synthetic trigger body');
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const payload = JSON.parse(body);
        assert.equal(payload.transactionId, fixture.transactionId);
        assert.equal(payload.name, fixture.workflowId);
        requests++;
        assert.equal(requests, 1, 'No repeated submission through acceptance gate');
        const authorization = req.headers.authorization;
        assert.equal(typeof authorization, 'string');
        const upstream = await fetch(`${target.origin}/v1/events/trigger`, {
          method: 'POST',
          body,
          headers: {
            Authorization: authorization,
            'Content-Type': 'application/json',
            'Idempotency-Key': fixture.id,
          },
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(5000),
        });
        assert.ok(upstream.ok, 'Real native engine accepted the trigger');
        await upstream.arrayBuffer();
        let notificationId;
        await until(
          async () => {
            const response = await fetch(
              `${target.origin}/v1/notifications?transactionId=${encodeURIComponent(fixture.transactionId)}`,
              {
                headers: { Authorization: authorization },
                redirect: 'error',
                signal: globalThis.AbortSignal.timeout(2000),
              },
            );
            assert.ok(response.ok);
            const value = await response.json();
            const notifications = value.data ?? value;
            assert.ok(Array.isArray(notifications));
            assert.ok(notifications.length <= 1);
            notificationId = notifications[0]?._id;
            return typeof notificationId === 'string';
          },
          'native identity before dispatcher interruption',
          4000,
        );
        const [run] =
          await sql`select status,claim_id,lease_until,attempts from workflow_runs where id=${fixture.id}`;
        assert.equal(run.status, 'dispatching');
        assert.equal(run.attempts, 1);
        assert.ok(run.claim_id);
        assert.ok(
          Date.now() - startedAt < 10000,
          'Leave time to kill worker before its 15s timeout',
        );
        held.add(res);
        res.once('close', () => held.delete(res));
        // Never serialize request headers, credentials, payloads or native responses.
        save(markerPath, {
          state: 'accepted',
          requests,
          startedAt,
          notificationId,
          leaseUntil: run.lease_until,
        });
        // Intentionally leave this response open until the dispatcher is killed.
      })().catch(() => {
        save(markerPath, { state: 'failed', requests });
        res.writeHead(503).end('Acceptance gate failed');
      });
    });
    server.requestTimeout = 15000;
    server.headersTimeout = 15000;
    server.listen(4315, '0.0.0.0');
    await once(server, 'listening');
    save(markerPath, { state: 'ready' });
    await once(server, 'close');
  }
  if (phase === 'proxy-stop') {
    const response = await fetch(`http://localhost:4315/stop/${fixture.control}`, {
      method: 'POST',
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(5000),
    });
    assert.ok(response.ok);
    await response.body?.cancel();
  }
  if (phase === 'interrupted') {
    const marker = read(markerPath);
    assert.equal(marker.state, 'accepted');
    assert.equal(marker.requests, 1);
    const [run] =
      await sql`select status,claim_id,lease_until,attempts from workflow_runs where id=${fixture.id}`;
    assert.equal(
      run.status,
      'dispatching',
      'SIGKILL preceded local acceptance or timeout persistence',
    );
    assert.equal(run.attempts, 1);
    assert.ok(run.claim_id);
    assert.ok(new Date(run.lease_until).getTime() > Date.now(), 'Original lease has not expired');
    const attempts =
      await sql`select status,kind,ordinal,finished_at from workflow_attempts where run_id=${fixture.id}`;
    assert.equal(attempts.length, 1);
    assert.deepEqual(attempts[0], {
      status: 'started',
      kind: 'trigger',
      ordinal: 1,
      finished_at: null,
    });
    console.log(
      'Dispatcher killed after native acceptance: original claim and unfinished attempt remain durable.',
    );
  }
  if (phase === 'verify' || phase === 'observe') {
    const { api, headers, org, env } = await session();
    assert.equal(org.id, fixture.orgId);
    assert.equal(env.id, fixture.environmentId);
    const marker = read(markerPath);
    assert.equal(marker.state, 'accepted');
    assert.equal(marker.requests, 1);
    const [environment] = await sql`select novu_key_cipher from environments where id=${env.id}`;
    const key = decrypt(
      environment.novu_key_cipher,
      process.env.FLARE_ENCRYPTION_KEY,
      `${org.id}/${env.id}`,
    );
    const native = (path) =>
      json(`${process.env.NOVU_API_URL}/v1${path}`, {
        headers: { Authorization: `ApiKey ${key}` },
      });
    const access = await api(`/subscribers/${fixture.subscriber}/inbox-token`);
    const initialized = await json(`${process.env.NOVU_API_URL}/v1/inbox/session`, {
      method: 'POST',
      body: {
        applicationIdentifier: access.applicationIdentifier,
        subscriberHash: access.subscriberHash,
        subscriber: { subscriberId: fixture.subscriber },
      },
    });
    await until(
      async () => {
        const run = await api(`/activity/${fixture.id}`);
        assert.ok(['dispatching', 'ambiguous'].includes(run.status));
        assert.equal(run.attempts, 1);
        return run.status === 'ambiguous';
      },
      'actual one-minute lease expiry quarantines interrupted dispatch',
      90000,
    );
    assert.ok(
      Date.now() >= new Date(marker.leaseUntil).getTime(),
      'Recovery waited for the actual lease',
    );
    const check = async () => {
      const state = await api(`/activity/${fixture.id}`);
      assert.equal(state.status, 'ambiguous');
      assert.equal(state.transaction_id, fixture.transactionId);
      assert.equal(state.attempts, 1);
      assert.equal(state.redrives, 0);
      assert.equal(state.claim_id, null);
      assert.equal(state.lease_until, null);
      assert.equal(state.cancellation_status, 'none');
      const attempts =
        await sql`select status,kind,ordinal,finished_at from workflow_attempts where run_id=${fixture.id}`;
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'ambiguous');
      assert.equal(attempts[0].kind, 'trigger');
      assert.equal(attempts[0].ordinal, 1);
      assert.ok(attempts[0].finished_at);
      const events =
        await sql`select type,data from event_outbox where org_id=${org.id} and environment_id=${env.id} and data->>'id'=${fixture.id} and type in ('workflow.accepted','workflow.ambiguous')`;
      assert.equal(events.length, 1, 'One durable ambiguity event, never a false local acceptance');
      assert.equal(events[0].type, 'workflow.ambiguous');
      assert.equal(events[0].data.transactionId, fixture.transactionId);
      const notifications = await native(
        `/notifications?transactionId=${encodeURIComponent(fixture.transactionId)}`,
      );
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]._id, marker.notificationId);
      const feed = await json(`${process.env.NOVU_API_URL}/v1/inbox/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${initialized.token}` },
      });
      assert.equal(
        feed.filter((item) => item.body === fixture.body).length,
        1,
        'Exactly one native Inbox side effect',
      );
      const [count] =
        await sql`select count(*) as n from workflow_runs where org_id=${org.id} and environment_id=${env.id} and transaction_id=${fixture.transactionId}`;
      assert.equal(Number(count.n), 1);
    };
    await check();
    const letters = await api('/dead-letters?limit=100');
    assert.ok(Array.isArray(letters));
    const letter = letters.find((item) => item.kind === 'workflow' && item.id === fixture.id);
    assert.ok(letter, 'Interrupted operation is visible to the tenant operator');
    assert.equal(letter.status, 'ambiguous');
    assert.equal(letter.redrivable, false);
    const redrive = await fetch(
      `http://localhost:4000/v1/dead-letters/workflow/${fixture.id}/redrive`,
      {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(30000),
      },
    );
    assert.equal(redrive.status, 409);
    await redrive.body?.cancel();
    const audits =
      await sql`select id from audit_logs where org_id=${org.id} and resource_id=${fixture.id} and action='dead_letter.workflow.redriven'`;
    assert.equal(audits.length, 0, 'Rejected redrive never records a successful mutation');
    if (phase === 'observe') {
      const untilAt = Date.now() + 30000;
      do {
        await check();
        await pause(2000);
      } while (Date.now() < untilAt);
    }
    console.log(
      phase === 'verify'
        ? 'Dispatcher crash recovered by real lease expiry: one ambiguous attempt/event, stable native identity, one Inbox delivery, redrive rejected.'
        : 'Second dispatcher restart: interrupted acceptance remained quarantined with no replay or duplicate Inbox delivery for 30 seconds.',
    );
  }
} finally {
  await sql.end();
}
