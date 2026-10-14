import assert from 'node:assert/strict';
import { sql, session, until, json } from './common.mjs';

// Contracts are pinned to Novu v3.19.0 inbox.controller.ts and InboxNotificationDto.
// The authenticated browser proxy is exercised separately in tests/live/inbox.spec.ts.
try {
  const { api } = await session();
  const subscriberId = 'acceptance-inbox-reader';
  const otherId = 'acceptance-inbox-other';
  const body = 'Acceptance inbox notification delivered by Novu';
  for (const id of [subscriberId, otherId])
    await api('/subscribers', 'POST', { subscriberId: id, email: `${id}@example.net` });
  await api('/workflows', 'POST', {
    workflowId: 'acceptance-inbox-feed',
    name: 'Acceptance inbox feed',
    steps: [{ stepId: 'inbox', name: 'Inbox delivery', type: 'in_app', controlValues: { body } }],
  });
  const run = await api('/events/trigger', 'POST', {
    name: 'acceptance-inbox-feed',
    to: subscriberId,
  });
  await until(async () => {
    const current = await api(`/activity/${run.ids[0]}`);
    assert.ok(
      !['failed', 'ambiguous', 'canceled'].includes(current.status),
      `Inbox dispatch reached ${current.status}`,
    );
    return current.status === 'accepted';
  }, 'Inbox workflow dispatch');

  const base = `${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}/v1/inbox`;
  async function connect(id) {
    const access = await api(`/subscribers/${id}/inbox-token`);
    const initialized = await json(`${base}/session`, {
      method: 'POST',
      body: {
        applicationIdentifier: access.applicationIdentifier,
        subscriberHash: access.subscriberHash,
        subscriber: { subscriberId: id },
      },
    });
    assert.equal(typeof initialized.token, 'string');
    return { Authorization: `Bearer ${initialized.token}` };
  }
  const headers = await connect(subscriberId);
  const feed = () => json(`${base}/notifications?limit=100`, { headers });
  let delivered;
  await until(async () => {
    const matches = (await feed()).filter((item) => item.body === body);
    assert.ok(matches.length <= 1, 'One trigger must produce one Inbox notification');
    delivered = matches[0];
    return Boolean(delivered);
  }, 'native Inbox feed delivery');
  assert.equal(delivered.to.subscriberId, subscriberId);
  assert.equal(delivered.isRead, false);
  const otherHeaders = await connect(otherId);
  assert.ok(
    !(await json(`${base}/notifications?limit=100`, { headers: otherHeaders })).some(
      (item) => item.id === delivered.id,
    ),
    'Inbox feed must isolate subscribers',
  );
  const forbidden = await fetch(`${base}/notifications/${delivered.id}/read`, {
    method: 'PATCH',
    headers: otherHeaders,
    signal: globalThis.AbortSignal.timeout(15000),
    redirect: 'error',
  });
  assert.equal(forbidden.status, 404, 'Another subscriber cannot mutate a notification');
  const read = await json(`${base}/notifications/${delivered.id}/read`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(read.isRead, true);
  assert.equal((await feed()).find((item) => item.id === delivered.id).isRead, true);
  const unread = await json(`${base}/notifications/${delivered.id}/unread`, {
    method: 'PATCH',
    headers,
  });
  assert.equal(unread.isRead, false);
  console.log(
    'Pinned Novu Inbox delivery, subscriber isolation, and persisted read/unread passed.',
  );
} finally {
  await sql.end();
}
