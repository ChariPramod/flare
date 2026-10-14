import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { decrypt } from '../../packages/shared/dist/index.js';
import { json, pause, session, sql, until } from './common.mjs';

// These phases run only in the disposable stack. Inbox is the durable observable
// side effect, so no listener needs to survive separate Compose exec processes.
const fixturePath = '/acceptance/engine-restart.json';
const phase = process.argv[2];
assert.ok(
  ['prepare', 'cancel', 'unavailable', 'verify', 'observe'].includes(phase),
  'Known restart phase',
);
let latestJobs = [];
try {
  const { api, org, env } = await session();
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
    assert.ok(notifications.length <= 1, 'One native notification per logical trigger');
    if (!notifications.length) return null;
    if (run.notificationId)
      assert.equal(
        notifications[0]._id,
        run.notificationId,
        'Original native notification survives',
      );
    if (run.nativeId)
      assert.equal(
        notifications[0]._id,
        run.nativeId,
        'Original native notification identity survives',
      );
    else {
      assert.equal(typeof notifications[0]._id, 'string');
      run.nativeId = notifications[0]._id;
    }
    const notification = await native(`/notifications/${notifications[0]._id}`);
    return notification;
  };
  let fixture;
  if (phase === 'prepare') {
    const id = randomUUID();
    fixture = { orgId: org.id, environmentId: env.id, subscriber: `restart-${id}`, runs: [] };
    await api('/subscribers', 'POST', { subscriberId: fixture.subscriber });
    for (const label of ['survive', 'cancel']) {
      const workflowId = `restart-${label}-${id}`;
      const body = `Native restart ${label} ${id}`;
      await api('/workflows', 'POST', {
        workflowId,
        name: workflowId,
        steps: [
          {
            stepId: 'wait',
            name: 'Wait through restart',
            type: 'delay',
            controlValues: { type: 'regular', amount: 180, unit: 'seconds' },
          },
          {
            stepId: 'inbox',
            name: 'Durable restart receipt',
            type: 'in_app',
            controlValues: { body },
          },
        ],
      });
      const accepted = await api('/events/trigger', 'POST', {
        name: workflowId,
        to: fixture.subscriber,
        transactionId: randomUUID(),
      });
      assert.equal(accepted.ids.length, 1);
      fixture.runs.push({
        label,
        body,
        workflowId,
        transactionId: accepted.transactionId,
        id: accepted.ids[0],
      });
    }
    await until(
      async () => {
        const states = await Promise.all(
          fixture.runs.map(async (run) => {
            const current = await api(`/activity/${run.id}`);
            assert.ok(
              ['queued', 'dispatching', 'accepted'].includes(current.status),
              'Dispatch remains recoverable',
            );
            const notification = current.status === 'accepted' ? await detail(run) : null;
            if (notification) {
              assert.equal(typeof notification._id, 'string');
              run.notificationId = notification._id;
            }
            const jobs = notification?.jobs ?? [];
            latestJobs.push(jobs.map(({ type, status }) => ({ type, status })));
            latestJobs = latestJobs.slice(-2);
            if (jobs.some((job) => job.type === 'delay' && job.status === 'completed'))
              throw new Error('Restart fixture missed its pending delay window');
            return (
              jobs.some((job) => job.type === 'delay' && job.status === 'delayed') &&
              jobs.some((job) => job.type === 'in_app' && job.status === 'pending')
            );
          }),
        );
        return states.every(Boolean);
      },
      'both native delays persisted before worker stop',
      60000,
    );
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
    console.log('Native restart fixture: two accepted delayed jobs persisted before interruption.');
  } else {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    assert.equal(fixture.orgId, org.id);
    assert.equal(fixture.environmentId, env.id);
  }
  if (phase === 'cancel') {
    const canceled = fixture.runs.find((run) => run.label === 'cancel');
    const pending = await detail(canceled);
    assert.ok(pending.jobs.some((job) => job.type === 'delay' && job.status === 'delayed'));
    const result = await api(`/events/trigger/${canceled.transactionId}`, 'DELETE');
    assert.equal(result.canceled, 1);
    await until(
      async () => {
        const state = await api(`/activity/${canceled.id}`);
        assert.equal(state.status, 'canceled');
        assert.notEqual(
          state.cancellation_status,
          'failed',
          'Cancellation compensation must succeed',
        );
        return state.cancellation_status === 'confirmed';
      },
      'native cancellation confirmed while native worker stopped',
      60000,
    );
    const nativeCanceled = await detail(canceled);
    for (const type of ['delay', 'in_app']) {
      const job = nativeCanceled.jobs.find((job) => job.type === type);
      assert.equal(job?.status, 'canceled', `Native ${type} canceled before restart`);
    }
    console.log('Native restart fixture: real Flare DELETE compensation canceled delay and child.');
  }
  if (phase === 'unavailable') {
    for (const run of fixture.runs) {
      const state = await api(`/activity/${run.id}`);
      assert.equal(state.id, run.id, 'Local evidence survives native API outage');
      assert.equal(state.transaction_id, run.transactionId);
      assert.equal(state.attempts, 1, 'An observation must never resubmit work');
      assert.equal(state.engine, null);
      assert.equal(state.status, run.label === 'cancel' ? 'canceled' : 'accepted');
      assert.equal(
        state.engine_observation.status,
        run.label === 'cancel' ? 'not_requested' : 'unavailable',
      );
      if (run.label === 'cancel') assert.equal(state.cancellation_status, 'confirmed');
      else assert.ok(Number.isFinite(Date.parse(state.engine_observation.checked_at)));
    }
    console.log(
      'Native API outage: Flare activity preserves local identity and cancellation evidence.',
    );
  }
  if (phase === 'verify' || phase === 'observe') {
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
    const inboxHeaders = { Authorization: `Bearer ${initialized.token}` };
    const check = async () => {
      const feed = await json(`${base}/notifications?limit=100`, { headers: inboxHeaders });
      const surviving = fixture.runs.find((run) => run.label === 'survive');
      const canceled = fixture.runs.find((run) => run.label === 'cancel');
      assert.equal(
        feed.filter((item) => item.body === canceled.body).length,
        0,
        'Canceled work never reaches Inbox',
      );
      const count = feed.filter((item) => item.body === surviving.body).length;
      assert.ok(count <= 1, 'Restart must not duplicate Inbox delivery');
      const details = await Promise.all(fixture.runs.map(detail));
      latestJobs = details.map((n) => n?.jobs?.map(({ type, status }) => ({ type, status })) ?? []);
      for (let index = 0; index < fixture.runs.length; index++) {
        const run = fixture.runs[index];
        assert.ok(details[index], 'Original native notification remains present');
        const [saved] =
          await sql`select status,attempts,cancellation_status from workflow_runs where id=${run.id}`;
        assert.equal(
          saved.attempts,
          1,
          'Flare must not resubmit accepted work after native restart',
        );
        assert.equal(saved.status, run.label === 'cancel' ? 'canceled' : 'accepted');
        assert.equal(
          Number(
            (
              await sql`select count(*) as n from workflow_runs where transaction_id=${run.transactionId} and org_id=${org.id} and environment_id=${env.id}`
            )[0].n,
          ),
          1,
        );
        if (run.label === 'cancel') {
          assert.equal(saved.cancellation_status, 'confirmed');
          for (const type of ['delay', 'in_app'])
            assert.equal(details[index].jobs.find((job) => job.type === type)?.status, 'canceled');
        }
      }
      const survivor = details[fixture.runs.findIndex((run) => run.label === 'survive')];
      return (
        count === 1 &&
        ['delay', 'in_app'].every((type) =>
          survivor.jobs.some((job) => job.type === type && job.status === 'completed'),
        )
      );
    };
    if (phase === 'verify') {
      await until(check, 'one delayed Inbox delivery after native Redis/worker restart', 240000);
      console.log(
        'Native restart fixture: one surviving Inbox delivery; canceled delivery absent.',
      );
    } else {
      const finish = Date.now() + 30000;
      do {
        assert.ok(await check(), 'Terminal native results survive a second worker restart');
        await pause(1000);
      } while (Date.now() < finish);
      console.log(
        'Native AOF-preserving restart and cancellation passed; second worker restart produced no duplicate Inbox delivery in 30 seconds. Total Redis data loss remains unverified.',
      );
    }
  }
} catch (error) {
  console.error('Native restart job status metadata:', JSON.stringify(latestJobs));
  throw error;
} finally {
  await sql.end();
}
