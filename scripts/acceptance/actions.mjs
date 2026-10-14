import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { decrypt } from '../../packages/shared/dist/index.js';
import { sql, session, until, json } from './common.mjs';

// This listener exists only for this script in the disposable stack. No published port,
// external destination, provider credentials, or production SSRF exception is required.
const nonce = randomUUID();
const receipts = [];
const observedJobs = new Map();
const server = createServer(async (req, res) => {
  if (req.method !== 'POST' || !req.url?.startsWith(`/${nonce}/`)) {
    res.writeHead(404).end();
    return;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) {
      res.writeHead(413).end();
      req.destroy();
      return;
    }
    chunks.push(chunk);
  }
  const label = req.url.slice(nonce.length + 2);
  receipts.push({
    label,
    at: Date.now(),
    body: Buffer.concat(chunks).toString('utf8'),
    signed: typeof req.headers['novu-signature'] === 'string',
  });
  res.writeHead(label.startsWith('fail-') ? 500 : 200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ acknowledged: label }));
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
server.listen(4312, '0.0.0.0');

try {
  await once(server, 'listening');
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
  const received = (label) => receipts.filter((receipt) => receipt.label === label);
  const request = (stepId, label, extra = {}) => ({
    stepId,
    name: stepId,
    type: 'http_request',
    controlValues: {
      method: 'POST',
      url: `http://flare-api:4312/${nonce}/${label}`,
      body: '{"value":"{{payload.value}}"}',
      ...extra,
    },
  });
  const action = (type, controlValues) => ({ stepId: type, name: type, type, controlValues });
  const workflow = (workflowId, steps) =>
    api('/workflows', 'POST', { workflowId, name: workflowId, steps });
  await api('/subscribers', 'POST', { subscriberId: 'acceptance-actions' });
  const trigger = (name, value) =>
    api('/events/trigger', 'POST', {
      name,
      to: 'acceptance-actions',
      payload: { value },
      transactionId: randomUUID(),
    });
  const detail = async (run) => {
    const state = await api(`/activity/${run.ids[0]}`);
    assert.ok(
      !['failed', 'ambiguous', 'canceled'].includes(state.status),
      `Action workflow dispatch ${state.status}`,
    );
    if (state.status !== 'accepted') return null;
    const notifications = await native(
      `/notifications?transactionId=${encodeURIComponent(run.transactionId)}`,
    );
    assert.ok(Array.isArray(notifications), 'Native activity response contains an array');
    if (!notifications.length) return null;
    assert.equal(notifications.length, 1, 'One native notification per logical action trigger');
    const notification = await native(`/notifications/${notifications[0]._id}`);
    observedJobs.set(
      run.transactionId,
      notification.jobs?.map(({ type, status }) => ({ type, status })) ?? [],
    );
    return notification;
  };
  const job = (notification, type) => notification?.jobs?.find((item) => item.type === type);
  const completed = async (run, type) => {
    let result;
    await until(async () => {
      result = await detail(run);
      return job(result, type)?.status === 'completed';
    }, `${type} native completion`);
    return result;
  };

  await workflow('acceptance-action-delay', [
    request('before', 'delay-before'),
    action('delay', { type: 'regular', amount: 2, unit: 'seconds' }),
    request('after', 'delay-after'),
  ]);
  const delayed = await trigger('acceptance-action-delay', 'rendered-payload');
  await until(() => received('delay-after').length === 1, 'delay downstream execution');
  assert.equal(received('delay-before').length, 1);
  assert.ok(
    received('delay-after')[0].at - received('delay-before')[0].at >= 1900,
    'Delay must wait two seconds before executing its child (100ms clock tolerance)',
  );
  assert.equal(JSON.parse(received('delay-after')[0].body).value, 'rendered-payload');
  assert.ok(received('delay-after')[0].signed, 'Native HTTP step attaches its signature header');
  await completed(delayed, 'delay');

  await workflow('acceptance-action-digest', [
    action('digest', { type: 'regular', amount: 10, unit: 'seconds' }),
    request('after', 'digest-after'),
  ]);
  const digested = await Promise.all([
    trigger('acceptance-action-digest', 'first'),
    trigger('acceptance-action-digest', 'second'),
  ]);
  await until(async () => {
    const details = await Promise.all(digested.map(detail));
    const jobs = details.map((item) => job(item, 'digest'));
    return (
      jobs.filter((item) => item?.status === 'completed').length === 1 &&
      jobs.filter((item) => item?.status === 'merged').length === 1 &&
      jobs.some((item) => item?.digest?.events?.length === 2) &&
      received('digest-after').length === 1
    );
  }, 'two triggers merge into one digest with both events');

  await workflow('acceptance-action-throttle', [
    action('throttle', { type: 'fixed', amount: 1, unit: 'minutes', threshold: 1 }),
    request('after', 'throttle-after'),
  ]);
  const nativeThrottleWorkflow = await json(
    `${process.env.NOVU_API_URL}/v2/workflows/acceptance-action-throttle`,
    { headers: { Authorization: `ApiKey ${key}` } },
  );
  const nativeThrottleStep = nativeThrottleWorkflow.steps.find((step) => step.type === 'throttle');
  const nativeThrottleControls =
    nativeThrottleStep?.controlValues ?? nativeThrottleStep?.controls?.values;
  assert.equal(nativeThrottleControls?.type, 'fixed');
  assert.equal(nativeThrottleControls?.amount, 1);
  assert.equal(nativeThrottleControls?.unit, 'minutes');
  assert.equal(nativeThrottleControls?.threshold, 1);
  const throttled = await Promise.all(
    Array.from({ length: 4 }, (_, index) => trigger('acceptance-action-throttle', String(index))),
  );
  await until(async () => {
    const details = await Promise.all(throttled.map(detail));
    const statuses = details.map((item) => job(item, 'throttle')?.status);
    return (
      statuses.filter((status) => status === 'completed').length === 1 &&
      statuses.filter((status) => status === 'skipped').length === 3
    );
  }, 'one concurrent throttle winner and three skipped runs');
  await until(() => received('throttle-after').length === 1, 'only throttle winner executes child');
  for (const run of throttled) {
    const notification = await detail(run);
    if (job(notification, 'throttle')?.status === 'skipped') {
      assert.equal(job(notification, 'http_request')?.status, 'skipped');
    }
  }

  await workflow('acceptance-action-halt', [
    request('failing', 'fail-halt'),
    request('after', 'halt-after'),
  ]);
  const halted = await trigger('acceptance-action-halt', 'halt');
  await until(async () => {
    const notification = await detail(halted);
    const requests = notification?.jobs?.filter((item) => item.type === 'http_request') ?? [];
    return (
      requests.length === 2 &&
      requests.some((item) => item.status === 'failed') &&
      requests.some((item) => item.status === 'canceled')
    );
  }, 'HTTP failure persists failed action and cancels its child');
  assert.ok(received('fail-halt').length >= 1);
  assert.equal(received('halt-after').length, 0);

  await workflow('acceptance-action-continue', [
    request('failing', 'fail-continue', { continueOnFailure: true }),
    request('after', 'continue-after'),
  ]);
  const continued = await trigger('acceptance-action-continue', 'continue');
  await until(async () => {
    const notification = await detail(continued);
    const requests = notification?.jobs?.filter((item) => item.type === 'http_request') ?? [];
    return (
      requests.length === 2 &&
      requests.some((item) => item.status === 'failed') &&
      requests.some((item) => item.status === 'completed') &&
      received('continue-after').length === 1
    );
  }, 'explicit HTTP continueOnFailure executes child and retains failed action');

  // Novu 3.19.0 RedisThrottleService adds its default 30s TTL buffer to the
  // configured 60s window. It checks set cardinality until that TTL expires,
  // so a fresh trigger at 61s is still skipped. Preserve the native setting:
  // assert renewal after 90s plus 1s tolerance rather than changing engine behavior.
  // https://github.com/novuhq/novu/blob/v3.19.0/libs/application-generic/src/services/throttle/redis-throttle.service.ts
  const firstThrottledDelivery = received('throttle-after')[0].at;
  await until(
    () => Date.now() >= firstThrottledDelivery + 61000,
    'native throttle configured window elapsed',
    65000,
  );
  const buffered = await trigger('acceptance-action-throttle', 'within-retention-buffer');
  await until(
    async () => {
      const notification = await detail(buffered);
      return (
        job(notification, 'throttle')?.status === 'skipped' &&
        job(notification, 'http_request')?.status === 'skipped'
      );
    },
    'throttle retains reservation during its default buffer',
    15000,
  );
  assert.equal(received('throttle-after').length, 1);
  const windowEnds = firstThrottledDelivery + 91000;
  await until(() => Date.now() >= windowEnds, 'native throttle reservation TTL expiration', 95000);
  const renewed = await trigger('acceptance-action-throttle', 'after-window');
  await completed(renewed, 'throttle');
  await until(() => received('throttle-after').length === 2, 'throttle permits next window');
  assert.equal(received('digest-after').length, 1, 'Merged digest never sends a second child');
  assert.equal(received('halt-after').length, 0, 'Failed action never executes canceled child');
  console.log(
    'Pinned Novu delay, digest, concurrent throttle/expiration, HTTP payload, failure halt and explicit continuation passed.',
  );
} catch (error) {
  // Print only bounded status metadata, never native credentials, payloads or execution raw logs.
  console.error('Native action job states:', JSON.stringify([...observedJobs.values()]));
  console.error(
    'Native action callback counts:',
    JSON.stringify(
      [...new Set(receipts.map(({ label }) => label))].map((label) => ({
        label,
        count: receipts.filter((receipt) => receipt.label === label).length,
      })),
    ),
  );
  throw error;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await sql.end();
}
