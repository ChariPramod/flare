import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql, session, until, json } from './common.mjs';

// Contracts are pinned to Novu v3.19.0 inbox.controller.ts and InboxNotificationDto.
// The authenticated browser proxy is exercised separately in tests/live/inbox.spec.ts.
try {
  const { api, headers: sessionHeaders, org, env } = await session();
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
    const response = await fetch(
      `http://localhost:4000/v1/subscribers/${encodeURIComponent(id)}/inbox-token`,
      {
        headers: sessionHeaders,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(15000),
      },
    );
    assert.equal(response.status, 200);
    const value = await response.json();
    const access = value.data ?? value;
    assert.equal(typeof access.subscriberHash, 'string');
    assert.ok(access.subscriberHash.length > 0);
    const requestId = response.headers.get('x-request-id');
    assert.ok(requestId, 'Inbox credential issuance must retain request correlation');
    let recorded;
    await until(async () => {
      [recorded] = await sql`select * from request_logs where id=${requestId}`;
      return Boolean(recorded);
    }, 'Inbox credential log persistence');
    assert.equal(recorded.org_id, org.id);
    assert.equal(recorded.environment_id, env.id);
    assert.equal(recorded.status, 200);
    assert.equal(
      JSON.stringify(recorded).includes(access.subscriberHash),
      false,
      'Reusable Inbox credentials must not be persisted in request logs',
    );
    // A synthetic pre-fix row proves read-time protection without deleting historical data.
    for (const [path, oldResponse] of [
      ['/V1/SUBSCRIBERS/:id/INBOX-TOKEN', { subscriberHash: access.subscriberHash }],
      [
        '/v1/logs',
        { data: [{ response_body: JSON.stringify({ subscriberHash: access.subscriberHash }) }] },
      ],
    ]) {
      const legacyId = randomUUID();
      await sql`insert into request_logs(id,org_id,environment_id,method,path,status,latency_ms,request_body,response_body)
        values(${legacyId},${org.id},${env.id},'GET',${path},200,7,
          ${sql.json({ query: { subscriber_hash: access.subscriberHash } })},
          ${sql.json(oldResponse)})`;
      const listed = await api(`/logs?q=${legacyId}`);
      assert.equal(listed.length, 1);
      const detail = await api(`/logs/${legacyId}`);
      for (const row of [listed[0], detail]) {
        assert.equal(row.id, legacyId);
        assert.equal(row.status, 200);
        assert.equal(row.latency_ms, 7);
        assert.equal(typeof row.created_at, 'string');
        assert.equal(
          JSON.stringify(row).includes(access.subscriberHash),
          false,
          'Historical Inbox credentials must not be returned by log APIs',
        );
      }
    }
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
    'Pinned Novu Inbox delivery, subscriber isolation, persisted read/unread and credential log protection passed.',
  );
} finally {
  await sql.end();
}
