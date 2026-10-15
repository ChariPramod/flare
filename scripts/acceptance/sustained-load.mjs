import assert from 'node:assert/strict';
import { randomUUID, sign } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { sql, session, json, pause, until } from './common.mjs';
import {
  loadConfig,
  percentile,
  remember,
  assertExactReceipts,
} from './sustained-load-helpers.mjs';

// Generated Mailpit-only acceptance stack. This tests service capacity, not live
// provider delivery or the 100/day pilot quota (MAIL_SANDBOX explicitly bypasses it).
assert.equal(process.env.MAIL_SANDBOX, 'true');
const config = loadConfig();
const run = randomUUID();
const prefix = `Sustained ${run}`;
const workflow = `soak-${run}`;
const deadline = globalThis.setTimeout(
  () => {
    console.error('Sustained acceptance exceeded its bounded overall deadline.');
    process.exit(1);
  },
  (config.seconds + 300) * 1000,
);
const headers = {
  Authorization: `Bearer ${process.env.SEED_API_KEY}`,
  'Content-Type': 'application/json',
};
const emails = new Map(),
  inbound = new Map(),
  workflows = new Map();
const latencies = [],
  successfulLatencies = [],
  samples = [];
const pending = new Set();
let failure,
  requests = 0,
  offered = 0,
  successes = 0,
  throttled = 0,
  skipped = 0,
  peakConcurrency = 0;
const phasePath = '/acceptance/sustained-load-phase.json';
const phase = () => JSON.parse(readFileSync(phasePath, 'utf8')).phase;
const persist = (name, value) =>
  writeFileSync(`/acceptance/${name}.json`, JSON.stringify(value), { mode: 0o600 });
const startRequest = (operation) => {
  const task = operation()
    .catch((error) => {
      failure ??= error;
    })
    .finally(() => pending.delete(task));
  pending.add(task);
  peakConcurrency = Math.max(peakConcurrency, pending.size);
  return task;
};
async function request(path, body, key) {
  offered++;
  const start = performance.now();
  const response = await fetch(`http://localhost:4000/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(15000),
  });
  const value = await response.json();
  const elapsed = performance.now() - start;
  latencies.push(elapsed);
  requests++;
  assert.equal(
    Number(response.headers.get('ratelimit-limit')),
    10,
    'Workload assumes the configured default 10/s key limit',
  );
  if (response.status === 429) {
    assert.ok(Number(response.headers.get('retry-after')) >= 1);
    throttled++;
    return null;
  }
  assert.ok(response.ok, `Sustained API request failed: ${response.status}`);
  successes++;
  successfulLatencies.push(elapsed);
  return value;
}
async function sendEmail(ordinal) {
  const value = await request(
    '/emails',
    {
      from: 'sender@acceptance.test',
      to: 'sustained@example.net',
      subject: `${prefix} ${ordinal}`,
      text: 'Disposable sustained load',
    },
    `soak-${run}-${ordinal}`,
  );
  if (value) remember(emails, ordinal, value.id);
}
async function sample() {
  const snapshot = { at: Date.now(), phase: phase() };
  for (const [name, host] of [
    ['api', 'localhost:4000'],
    ['worker', 'flare-worker:4001'],
  ]) {
    if (name === 'worker' && snapshot.phase === 'paused') continue;
    let response;
    try {
      response = await fetch(`http://${host}/internal/metrics`, {
        headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` },
        signal: globalThis.AbortSignal.timeout(5000),
      });
    } catch (error) {
      // Only network interruption is expected when the host begins its stop.
      if (
        name !== 'worker' ||
        phase() !== 'paused' ||
        !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
      )
        throw error;
      snapshot.phase = 'paused';
      continue;
    }
    assert.ok(response.ok);
    const bytes = Number(
      (await response.text()).match(
        /^flare_process_resident_memory_bytes(?:\{[^}]*\})? (\d+)/m,
      )?.[1],
    );
    assert.ok(
      bytes > 0 && bytes < config.memoryMax,
      `${name} sampled RSS outside configured bound`,
    );
    snapshot[name] = bytes;
  }
  const states = await sql`
    select 'mail' as kind,count(*)::int as pending,coalesce(max(extract(epoch from clock_timestamp()-created_at)),0)::float as oldest from messages where request->>'subject' like ${prefix + ' %'} and status not in ('sent','delivered')
    union all select 'inbound',count(*)::int,coalesce(max(extract(epoch from clock_timestamp()-created_at)),0)::float from inbound_messages where postal_id like ${`soak-${run}-%`} and status<>'parsed'
    union all select 'workflow',count(*)::int,coalesce(max(extract(epoch from clock_timestamp()-created_at)),0)::float from workflow_runs where workflow_id=${workflow} and status<>'accepted'`;
  snapshot.pending = states.reduce((sum, state) => sum + state.pending, 0);
  snapshot.backlog = Object.fromEntries(states.map((state) => [state.kind, state.pending]));
  snapshot.oldestSeconds = Math.max(...states.map((state) => state.oldest));
  assert.ok(snapshot.oldestSeconds < 120, 'Accepted operation backlog exceeded 120 seconds');
  samples.push(snapshot);
  return snapshot;
}
persist('sustained-load-pid', { pid: process.pid });
try {
  const { api, env } = await session();
  const domain = (await api('/domains')).find((item) => item.name === 'acceptance.test');
  assert.equal(domain?.status, 'verified');
  const subscriber = `soak-${run}`;
  await api('/subscribers', 'POST', {
    subscriberId: subscriber,
    email: 'sustained-inbox@example.net',
  });
  await api('/workflows', 'POST', {
    workflowId: workflow,
    name: 'Sustained Inbox',
    steps: [
      {
        stepId: 'inbox',
        name: 'Inbox',
        type: 'in_app',
        controlValues: { body: `${prefix} Inbox {{payload.ordinal}}` },
      },
    ],
  });
  const access = await api(`/subscribers/${subscriber}/inbox-token`);
  const base = `${process.env.NOVU_API_URL}/v1/inbox`;
  const inboxSession = await json(`${base}/session`, {
    method: 'POST',
    body: {
      applicationIdentifier: access.applicationIdentifier,
      subscriberHash: access.subscriberHash,
      subscriber: { subscriberId: subscriber },
    },
  });
  const inboxHeaders = { Authorization: `Bearer ${inboxSession.token}` };
  const feed = () => json(`${base}/notifications?limit=100`, { headers: inboxHeaders });
  const postalKey = readFileSync('/acceptance-postal.key');
  async function receive(ordinal) {
    const raw = Buffer.from(
      `From: incoming@example.net\r\nTo: visible@acceptance.test\r\nSubject: ${prefix} inbound ${ordinal}\r\n\r\nDisposable incoming body\r\n`,
    );
    const body = JSON.stringify({
      id: `soak-${run}-${ordinal}`,
      mail_from: 'incoming@example.net',
      rcpt_to: 'sustained@acceptance.test',
      message: raw.toString('base64'),
      base64: true,
      size: raw.length,
    });
    const signature = sign('RSA-SHA256', Buffer.from(body), postalKey).toString('base64');
    const responses = await Promise.all(
      [0, 1].map(async () => {
        const response = await fetch(`http://localhost:4000/v1/inbound/postal/${domain.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-postal-signature-256': signature },
          body,
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(15000),
        });
        assert.ok(response.ok, `Signed inbound receipt failed: ${response.status}`);
        return response.json();
      }),
    );
    for (const value of responses) remember(inbound, ordinal, value.id);
  }
  async function trigger(ordinal) {
    const value = await request(
      '/events/trigger',
      { name: workflow, to: subscriber, payload: { ordinal } },
      `soak-inbox-${run}-${ordinal}`,
    );
    if (value) remember(workflows, ordinal, value.ids[0]);
  }
  await pause(1200);
  const started = performance.now();
  persist('sustained-load-started', { seconds: config.seconds });
  let tick = 0,
    nextSample = 0,
    nextInbound = 0,
    nextBurst = 0;
  while (performance.now() - started < config.seconds * 1000) {
    if (failure) throw failure;
    const elapsed = performance.now() - started;
    const second = Math.floor(elapsed / 1000);
    if (elapsed >= nextSample) {
      await sample();
      await feed();
      nextSample = elapsed + 5000;
    }
    if (elapsed >= nextInbound) {
      startRequest(() => receive(Math.floor(second / 10)));
      nextInbound = elapsed + 10000;
    }
    if (elapsed >= nextBurst) {
      // A bounded 40-request concurrent burst repeats one logical send.
      await Promise.all(Array.from({ length: 40 }, () => startRequest(() => sendEmail(second))));
      nextBurst = elapsed + 60000;
    }
    if (pending.size < 16) {
      const slot = tick % 10;
      if (slot < 2) startRequest(() => sendEmail(second));
      else if (slot === 2 && second % 20 < 2) startRequest(() => trigger(Math.floor(second / 20)));
      else startRequest(() => request(slot % 2 ? '/inbound?limit=10' : '/sending-policy'));
    } else skipped++;
    tick++;
    // No catch-up stampede: concurrency is bounded and scheduler lag remains observable.
    await pause(Math.max(0, 100 - (performance.now() - started - elapsed)));
  }
  await Promise.all(pending);
  if (failure) throw failure;
  assert.equal(phase(), 'resumed', 'Controlled worker outage must finish during admission');
  assert.ok(throttled > 0, 'Concurrent bursts must produce explicit throttling');
  assert.ok(
    requests >= config.seconds * 7,
    'Sustained scheduler offered insufficient request load',
  );
  assert.ok(successes >= config.seconds * 6, 'Configured rate made insufficient API progress');
  assert.ok(
    emails.size >= config.seconds * 0.6,
    'Fresh email work did not continue across the workload',
  );
  assert.ok(inbound.size >= Math.floor(config.seconds / 12), 'Insufficient fresh inbound work');
  assert.ok(workflows.size >= Math.floor(config.seconds / 25), 'Insufficient fresh Inbox work');
  assert.ok(
    samples.some((item) => item.phase === 'paused' && item.pending > 0),
    'Controlled worker pause must produce a durable backlog',
  );
  const drainStart = performance.now();
  await until(
    async () => {
      await sample();
      const [mail] =
        await sql`select count(*)::int as n from messages where id in ${sql([...emails.values()])} and status='sent'`;
      const [received] =
        await sql`select count(*)::int as n from inbound_messages where id in ${sql([...inbound.values()])} and status='parsed'`;
      const [runs] =
        await sql`select count(*)::int as n from workflow_runs where id in ${sql([...workflows.values()])} and status='accepted'`;
      const notifications = await feed();
      return (
        mail.n === emails.size &&
        received.n === inbound.size &&
        runs.n === workflows.size &&
        notifications.length >= workflows.size
      );
    },
    'sustained workload drains with no lost accepted operations',
    180000,
  );
  const drainMs = performance.now() - drainStart;
  const attempts =
    await sql`select message_id,count(*)::int as n from transport_attempts where message_id in ${sql([...emails.values()])} group by message_id`;
  assert.equal(attempts.length, emails.size);
  assert.ok(
    attempts.every((row) => row.n === 1),
    'Sustained email caused duplicate provider attempts',
  );
  const mailRows =
    await sql`select id from messages where request->>'subject' like ${prefix + ' %'}`;
  assert.equal(mailRows.length, emails.size, 'Duplicate logical email rows');
  const receipts =
    await sql`select id from inbound_messages where domain_id=${domain.id} and postal_id like ${`soak-${run}-%`}`;
  assert.equal(receipts.length, inbound.size, 'Duplicate logical inbound receipts');
  const receivedEvents =
    await sql`select data->>'inbound_id' as id,count(*)::int as n from event_outbox where type='email.received' and data->>'inbound_id' in ${sql([...inbound.values()])} group by data->>'inbound_id'`;
  assert.equal(receivedEvents.length, inbound.size);
  assert.ok(
    receivedEvents.every((row) => row.n === 1),
    'Duplicate received outbox event',
  );
  const runRows =
    await sql`select id from workflow_runs where environment_id=${env.id} and workflow_id=${workflow}`;
  assert.equal(runRows.length, workflows.size, 'Duplicate logical Inbox runs');
  const notifications = await feed();
  assert.equal(
    notifications.length,
    workflows.size,
    'Inbox feed contains duplicate or missing deliveries',
  );
  assert.deepEqual(
    notifications.map((item) => item.body).sort(),
    [...workflows.keys()].map((ordinal) => `${prefix} Inbox ${ordinal}`).sort(),
  );
  const mailpit = [];
  for (let start = 0; start < 6000; start += 100) {
    const page = await json(`http://mailpit:8025/api/v1/messages?start=${start}&limit=100`);
    mailpit.push(...page.messages);
    if (start + page.messages.length >= page.total) break;
    assert.ok(page.messages.length > 0, 'Mailpit pagination stopped before total');
    assert.ok(start < 5900, 'Mailpit acceptance retention bound exceeded');
  }
  assertExactReceipts(
    [...emails.keys()].map((ordinal) => `${prefix} ${ordinal}`),
    mailpit,
  );
  const p95Ms = percentile(successfulLatencies, 0.95);
  assert.ok(p95Ms < config.latencyMax, 'Successful request p95 exceeds configured latency bound');
  const report = {
    seconds: config.seconds,
    requests,
    offered,
    successes,
    throttled,
    skipped,
    peakConcurrency,
    emails: emails.size,
    inbound: inbound.size,
    inbox: workflows.size,
    p50Ms: percentile(successfulLatencies, 0.5),
    p95Ms,
    allResponseP95Ms: percentile(latencies, 0.95),
    drainMs,
    peakApiRss: Math.max(...samples.map((item) => item.api ?? 0)),
    peakWorkerRss: Math.max(...samples.map((item) => item.worker ?? 0)),
    peakBacklog: Math.max(...samples.map((item) => item.pending)),
    oldestBacklogSeconds: Math.max(...samples.map((item) => item.oldestSeconds)),
    samples,
  };
  persist('sustained-load-report', report);
  console.log(
    `Sustained mixed load passed: ${JSON.stringify({ ...report, samples: samples.length })}. Mailpit sandbox only; sampled memory is not a leak proof.`,
  );
} finally {
  globalThis.clearTimeout(deadline);
  await sql.end();
}
