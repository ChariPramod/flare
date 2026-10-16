import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { decrypt } from '../../packages/shared/dist/index.js';
import { json, pause, session, sql, until } from './common.mjs';

// Native Mongo activity survives loss of the Redis queues. That evidence is not
// proof of delivery, nor permission to submit the logical operation a second time.
const fixturePath = '/acceptance/crash-recovery.json';
const phase = process.argv[2];
assert.ok(['prepare', 'verify', 'cancel'].includes(phase), 'Known queue-loss phase');
let latestJobs = [];
try {
  const { api, org, env, headers } = await session();
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
  const detail = async (run) => {
    const notifications = await native(
      `/notifications?transactionId=${encodeURIComponent(run.transactionId)}`,
    );
    assert.ok(Array.isArray(notifications));
    assert.ok(notifications.length <= 1, 'Queue loss must not create another native notification');
    if (!notifications.length) return null;
    if (run.notificationId)
      assert.equal(notifications[0]._id, run.notificationId, 'Native identity remains stable');
    else run.notificationId = notifications[0]._id;
    const notification = await native(`/notifications/${notifications[0]._id}`);
    latestJobs.push(notification.jobs.map(({ type, status }) => ({ type, status })));
    latestJobs = latestJobs.slice(-2);
    return notification;
  };
  let fixture;
  if (phase === 'prepare') {
    const id = randomUUID();
    fixture = { orgId: org.id, environmentId: env.id, subscriber: `queue-loss-${id}`, runs: [] };
    await api('/subscribers', 'POST', { subscriberId: fixture.subscriber });
    for (const type of ['delay', 'digest']) {
      const workflowId = `queue-loss-${type}-${id}`;
      const body = `Queue-loss ${type} receipt ${id}`;
      await api('/workflows', 'POST', {
        workflowId,
        name: workflowId,
        steps: [
          {
            stepId: 'wait',
            name: 'Pending during queue loss',
            type,
            controlValues: { type: 'regular', amount: 180, unit: 'seconds' },
          },
          { stepId: 'inbox', name: 'Durable receipt', type: 'in_app', controlValues: { body } },
        ],
      });
      // The timer cannot have started before its trigger. Keep a conservative
      // lower bound so the shell can reject a missed fault-injection window.
      fixture.earliestDeadline ??= Date.now() + 180000;
      const accepted = await api('/events/trigger', 'POST', {
        name: workflowId,
        to: fixture.subscriber,
        transactionId: randomUUID(),
      });
      assert.equal(accepted.ids.length, 1);
      fixture.runs.push({ type, body, id: accepted.ids[0], transactionId: accepted.transactionId });
    }
    await until(
      async () => {
        const pending = await Promise.all(
          fixture.runs.map(async (run) => {
            const state = await api(`/activity/${run.id}`);
            assert.ok(['queued', 'dispatching', 'accepted'].includes(state.status));
            if (state.status !== 'accepted') return false;
            const notification = await detail(run);
            const wait = notification?.jobs.find((job) => job.type === run.type);
            assert.notEqual(
              wait?.status,
              'completed',
              'Queue-loss fixture missed its pending window',
            );
            return (
              wait?.status === 'delayed' &&
              notification.jobs.some((job) => job.type === 'in_app' && job.status === 'pending')
            );
          }),
        );
        return pending.every(Boolean);
      },
      'native delay and digest persisted before destructive queue test',
      60000,
    );
    // Conservative deadline: measured after both native timers were already started.
    fixture.deadline = Date.now() + 185000;
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    console.log('Queue-loss fixture: one accepted delay and one accepted digest persisted.');
  } else {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.orgId, org.id);
    assert.equal(fixture.environmentId, env.id);
  }
  if (phase === 'verify' || phase === 'cancel') {
    const access = await api(`/subscribers/${fixture.subscriber}/inbox-token`);
    const base = `${process.env.NOVU_API_URL}/v1/inbox`;
    const initialized = await json(`${base}/session`, {
      method: 'POST',
      body: {
        applicationIdentifier: access.applicationIdentifier,
        subscriberHash: access.subscriberHash,
        subscriber: { subscriberId: fixture.subscriber },
      },
    });
    const check = async (canceled = false) => {
      const feed = await json(`${base}/notifications?limit=100`, {
        headers: { Authorization: `Bearer ${initialized.token}` },
      });
      for (const run of fixture.runs) {
        assert.equal(
          feed.filter((item) => item.body === run.body).length,
          0,
          'No Inbox side effect',
        );
        const state = await api(`/activity/${run.id}`);
        assert.equal(state.id, run.id);
        assert.equal(state.transaction_id, run.transactionId);
        assert.equal(state.status, canceled ? 'canceled' : 'accepted');
        assert.equal(state.attempts, 1, 'Accepted work is never automatically resubmitted');
        assert.equal(state.redrives, 0);
        assert.equal(state.cancellation_status, canceled ? 'confirmed' : 'none');
        if (!canceled) {
          assert.equal(state.engine_observation.status, 'available');
          assert.ok(state.engine, 'Pending native evidence remains accessible to the operator');
          assert.equal(state.engine_observation.partial, false);
          const observed = state.engine_observation.notifications;
          assert.equal(observed.length, 1);
          assert.equal(observed[0].id, run.notificationId);
          assert.equal(observed[0].status, 'pending');
          for (const type of [run.type, 'in_app'])
            assert.equal(
              observed[0].jobs.find((job) => job.type === type)?.status,
              type === 'in_app' ? 'pending' : 'delayed',
              'Normalized operator evidence exposes stranded native jobs',
            );
        }
        const notification = await detail(run);
        assert.ok(notification);
        for (const type of [run.type, 'in_app']) {
          const job = notification.jobs.find((item) => item.type === type);
          assert.equal(
            job?.status,
            canceled ? 'canceled' : type === 'in_app' ? 'pending' : 'delayed',
          );
        }
        const [count] =
          await sql`select count(*) as n from workflow_runs where org_id=${org.id} and environment_id=${env.id} and transaction_id=${run.transactionId}`;
        assert.equal(Number(count.n), 1, 'One durable logical operation after queue loss');
      }
    };
    const inspectReadOnly = async (canceled = false) => {
      const ids = fixture.runs.map((run) => run.id);
      const savedRuns =
        () => sql`select id,status,attempts,redrives,transaction_id,parent_transaction_id,cancellation_status
        from workflow_runs where org_id=${org.id} and environment_id=${env.id} and id in ${sql(ids)} order by id`;
      const beforeReads = await savedRuns();
      assert.equal(beforeReads.length, fixture.runs.length);
      const before = new Date().toISOString(),
        found = new Set(),
        seen = new Set();
      let cursor = null,
        exhausted = false;
      // Inventory is read-only and bounded independently of native detail calls.
      // Stop early once the two accepted fixtures are found; canceled fixtures must be absent.
      for (let page = 0; page < 20; page++) {
        const query = new URLSearchParams({ before, limit: '20', ...(cursor ? { cursor } : {}) });
        // The shared API helper unwraps `data`; keep this paginated envelope intact.
        const response = await fetch(`http://localhost:4000/v1/activity/reconciliation?${query}`, {
          headers,
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(30000),
        });
        assert.equal(response.status, 200, 'Reconciliation inventory is readable');
        const inventory = await response.json();
        assert.equal(inventory.before, before);
        assert.ok(inventory.data.length <= 20);
        for (const row of inventory.data) {
          assert.equal(seen.has(row.id), false, 'Cursor inventory never repeats a run');
          seen.add(row.id);
          assert.equal(row.status, 'accepted');
          assert.equal(row.queue_presence, 'unknown');
          assert.equal(row.replay_allowed, false);
          for (const field of ['payload', 'engine', 'error', 'subscriber', 'content'])
            assert.equal(Object.hasOwn(row, field), false, 'Inventory exposes metadata only');
          if (ids.includes(row.id)) found.add(row.id);
        }
        if (inventory.next_cursor === null) {
          exhausted = true;
          break;
        }
        assert.notEqual(inventory.next_cursor, cursor, 'Inventory cursor makes progress');
        cursor = inventory.next_cursor;
        if (!canceled && found.size === ids.length) break;
      }
      if (canceled) {
        assert.equal(
          exhausted,
          true,
          'Canceled-work inventory exclusion was checked within 400 runs',
        );
        assert.equal(found.size, 0, 'Canceled work is absent from accepted inventory');
      } else
        assert.equal(
          found.size,
          ids.length,
          'Both native-loss fixtures appear in bounded accepted inventory',
        );
      for (const run of fixture.runs) {
        const report = await api(`/activity/${run.id}/inspection`);
        assert.equal(report.id, run.id);
        assert.equal(report.transaction_id, run.transactionId);
        assert.equal(report.status, canceled ? 'canceled' : 'accepted');
        assert.equal(
          report.queue_presence,
          'unknown',
          'Native database status cannot establish queue membership',
        );
        assert.equal(
          report.replay_allowed,
          false,
          'Read-only reconciliation never recommends replay',
        );
        assert.equal(report.attempts, 1);
        for (const field of ['payload', 'engine', 'error', 'subscriber', 'content'])
          assert.equal(Object.hasOwn(report, field), false, 'Inspection exposes metadata only');
        assert.equal(JSON.stringify(report).includes(run.body), false);
        assert.equal(JSON.stringify(report).includes(fixture.subscriber), false);
        assert.equal(JSON.stringify(report).includes(key), false);
        if (canceled) {
          assert.equal(report.cancellation.eligible, false);
          assert.equal(report.engine_observation.status, 'not_requested');
        } else {
          assert.equal(report.partial, false);
          assert.equal(report.engine_observation.status, 'available');
          assert.equal(report.engine_observation.partial, false);
          assert.equal(report.engine_observation.notifications.length, 1);
          assert.equal(report.engine_observation.notifications[0].id, run.notificationId);
          assert.equal(report.engine_observation.notifications[0].status, 'pending');
          assert.equal(
            report.cancellation.eligible,
            true,
            'Inspection offers advice without performing cancellation',
          );
          assert.ok(Number.isFinite(report.observation_age_ms) && report.observation_age_ms >= 0);
          assert.ok(Number.isFinite(Date.parse(report.engine_observation.checked_at)));
        }
      }
      // These accepted/confirmed fixtures have settled local dispatch/compensation.
      // Native progress timestamps may change; compare only durable operation identity/state.
      assert.deepEqual(
        await savedRuns(),
        beforeReads,
        'GET inspection does not alter dispatch, cancellation or redrive state',
      );
      console.log(
        `Read-only native reconciliation passed for ${fixture.runs.length} ${canceled ? 'canceled' : 'accepted'} queue-loss fixtures; queue presence remains unknown and replay disabled.`,
      );
    };
    const rejectRedrive = async () => {
      for (const run of fixture.runs) {
        const response = await fetch(
          `http://localhost:4000/v1/dead-letters/workflow/${run.id}/redrive`,
          {
            method: 'POST',
            headers,
            redirect: 'error',
            signal: globalThis.AbortSignal.timeout(30000),
          },
        );
        assert.equal(response.status, 409, 'Accepted or canceled operations cannot be redriven');
        await response.body?.cancel();
      }
    };
    if (phase === 'verify') {
      await rejectRedrive();
      const end = Math.max(Date.now() + 30000, fixture.deadline + 30000);
      assert.ok(end - Date.now() <= 240000, 'Queue-loss observation is bounded');
      do {
        await check();
        await pause(2000);
      } while (Date.now() < end);
      await check();
      await inspectReadOnly();
      console.log(
        'Complete native queue DB2 loss: delay/digest remain pending beyond their deadlines, with no Inbox delivery, no resubmission, stable identities, and redrive rejected. Native Mongo evidence alone cannot diagnose queue loss.',
      );
    } else {
      for (const run of fixture.runs) {
        const canceled = await api(`/events/trigger/${run.transactionId}`, 'DELETE');
        assert.equal(canceled.canceled, 1);
      }
      await until(
        async () => {
          const states = await Promise.all(fixture.runs.map((run) => api(`/activity/${run.id}`)));
          for (const state of states) assert.notEqual(state.cancellation_status, 'failed');
          return states.every((state) => state.cancellation_status === 'confirmed');
        },
        'explicit cancellation closes orphaned native activity',
        60000,
      );
      await rejectRedrive();
      await check(true);
      await inspectReadOnly(true);
      console.log(
        'Queue-loss cleanup: explicit cancellation confirmed for delay/digest; no automatic recovery or delivery guarantee claimed.',
      );
    }
  }
} catch (error) {
  console.error('Queue-loss native job metadata:', JSON.stringify(latestJobs));
  throw error;
} finally {
  await sql.end();
}
