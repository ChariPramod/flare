import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { signDashboardForwarding } from '../../packages/shared/dist/dashboard-forwarding.js';
import { session, sql, until } from './common.mjs';

const { Redis } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('ioredis');
const redis = new Redis(process.env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 2000,
  commandTimeout: 2000,
});
redis.on('error', () => undefined);
const base = 'http://127.0.0.1:4022';
const secret = `fdp_${randomBytes(32).toString('base64')}`;
const address = `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g).join(':')}`;
const deadline = Date.now() + 240_000;
const ownedSessions = new Map(),
  ownedBindings = new Set();
let child,
  spawnFailed = false,
  restoreReadState;

function rememberSession(headers) {
  // These claims come from an already-authenticated local login, solely for fixture cleanup.
  const claims = JSON.parse(
    Buffer.from(headers.Authorization.split('.')[1], 'base64url').toString('utf8'),
  );
  assert.match(claims.jti, /^[0-9a-f-]{36}$/i);
  assert.match(claims.sub, /^[0-9a-f-]{36}$/i);
  ownedSessions.set(claims.jti, claims.sub);
  return claims.jti;
}
function input(headers, route, method = 'GET', body, token) {
  const target = `/v1/dashboard/inbox/${route}`;
  const encoded = body === undefined ? undefined : JSON.stringify(body);
  const bound = {
    ...headers,
    'Content-Type': 'application/json',
    ...(token ? { 'x-flare-inbox-authorization': `Bearer ${token}` } : {}),
  };
  return {
    target,
    method,
    body: encoded,
    headers: {
      ...bound,
      ...signDashboardForwarding(
        secret,
        { method, target, body: encoded, headers: bound },
        address,
      ),
    },
  };
}
async function request(value, expected, label) {
  const remaining = deadline - Date.now();
  assert.ok(remaining > 0, 'Inbox gateway acceptance stays within its deadline');
  const response = await fetch(`${base}${value.target}`, {
    method: value.method,
    headers: value.headers,
    body: value.body,
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(Math.min(20_000, remaining)),
  });
  if (response.status !== expected) await response.body?.cancel();
  assert.equal(response.status, expected, label);
  return response;
}
async function reject(value, status, label) {
  const response = await request(value, status, label);
  await response.body?.cancel();
}
async function initialize(client, id) {
  const access = await client.api(`/subscribers/${encodeURIComponent(id)}/inbox-token`);
  const body = {
    applicationIdentifier: access.applicationIdentifier,
    subscriberHash: access.subscriberHash,
    subscriber: { subscriberId: id },
  };
  const response = await request(
    input(client.headers, 'session', 'POST', body),
    201,
    'Authorized native Inbox bootstrap',
  );
  const envelope = await response.json(),
    value = envelope.data ?? envelope;
  assert.equal(typeof value.token, 'string', 'Native Inbox returns a token');
  const sessionId = rememberSession(client.headers);
  const bindingKey = `dashboard-inbox:v1:${sessionId}:${createHash('sha256').update(value.token).digest('hex')}`;
  ownedBindings.add(bindingKey);
  const requestId = response.headers.get('x-request-id');
  assert.ok(requestId, 'Inbox gateway retains request correlation');
  let recorded;
  await until(
    async () => {
      [recorded] = await sql`select * from request_logs where id=${requestId}`;
      return Boolean(recorded);
    },
    'Inbox gateway redacted request log',
    15_000,
  );
  for (const credential of [access.subscriberHash, value.token, client.headers.Authorization]) {
    assert.equal(
      JSON.stringify(recorded).includes(credential),
      false,
      'Inbox gateway logs omit reusable credentials',
    );
    const log = await client.api(`/logs/${requestId}`);
    assert.equal(
      JSON.stringify(log).includes(credential),
      false,
      'Inbox gateway log reads omit reusable credentials',
    );
  }
  return { token: value.token, body, bindingKey };
}
async function feed(client, token) {
  const response = await request(
    input(client.headers, 'notifications?limit=100', 'GET', undefined, token),
    200,
    'Bound Inbox feed',
  );
  const envelope = await response.json();
  const notifications = envelope.data?.data ?? envelope.data;
  assert.ok(Array.isArray(notifications), 'Native Inbox feed retains SDK envelope');
  return notifications;
}

try {
  const first = await session(),
    second = await session();
  const firstId = rememberSession(first.headers);
  rememberSession(second.headers);
  await redis.connect();
  child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      PORT: '4022',
      PUBLIC_API_URL: base,
      FLARE_DASHBOARD_PROXY_SECRET: secret,
      TRUST_PROXY: '',
    },
    stdio: 'ignore',
  });
  child.once('error', () => {
    spawnFailed = true;
  });
  await until(
    async () => {
      assert.equal(spawnFailed, false, 'Isolated Inbox gateway starts');
      assert.equal(child.exitCode, null, 'Isolated Inbox gateway remains running');
      assert.equal(child.signalCode, null, 'Isolated Inbox gateway remains running');
      try {
        const response = await fetch(`${base}/health`, {
          signal: globalThis.AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
    'isolated Inbox gateway startup',
    60_000,
  );

  const access = await initialize(first, 'acceptance-inbox-reader');
  const nativeToken = access.token;
  const notifications = await feed(first, nativeToken);
  const delivered = notifications.find(
    (item) => item.body === 'Acceptance inbox notification delivered by Novu',
  );
  assert.ok(delivered, 'Existing native Inbox fixture is visible');
  assert.equal(
    delivered.to.subscriberId,
    'acceptance-inbox-reader',
    'Native Inbox identity is preserved',
  );
  assert.equal(delivered.isRead, false, 'Fixture begins unread');

  restoreReadState = { client: first, token: nativeToken, id: delivered.id };
  const read = await request(
    input(first.headers, `notifications/${delivered.id}/read`, 'PATCH', undefined, nativeToken),
    200,
    'Authorized native read',
  );
  await read.body?.cancel();
  assert.equal(
    (await feed(first, nativeToken)).find((item) => item.id === delivered.id)?.isRead,
    true,
    'Read state persists',
  );
  const unread = await request(
    input(first.headers, `notifications/${delivered.id}/unread`, 'PATCH', undefined, nativeToken),
    200,
    'Authorized native unread',
  );
  await unread.body?.cancel();
  assert.equal(
    (await feed(first, nativeToken)).find((item) => item.id === delivered.id)?.isRead,
    false,
    'Unread state is restored for live-browser acceptance',
  );
  restoreReadState = undefined;

  await reject(
    {
      target: '/v1/dashboard/inbox/session',
      method: 'POST',
      headers: { ...first.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(access.body),
    },
    403,
    'Unsigned gateway bootstrap denied',
  );
  await reject(
    input(second.headers, 'notifications', 'GET', undefined, nativeToken),
    401,
    'Native token cannot cross Flare sessions',
  );
  const [otherEnvironment] =
    await sql`select id from environments where org_id=${first.org.id} and id<>${first.env.id} limit 1`;
  assert.ok(otherEnvironment, 'Environment substitution fixture exists');
  await reject(
    input(
      { ...first.headers, 'x-environment-id': otherEnvironment.id },
      'notifications',
      'GET',
      undefined,
      nativeToken,
    ),
    401,
    'Native token cannot cross environments',
  );
  const other = await initialize(first, 'acceptance-inbox-other');
  assert.equal(
    (await feed(first, other.token)).some((item) => item.id === delivered.id),
    false,
    'Other subscriber feed is isolated',
  );
  await reject(
    input(first.headers, `notifications/${delivered.id}/read`, 'PATCH', undefined, other.token),
    404,
    'Native token cannot modify another subscriber notification',
  );
  await reject(
    input(
      first.headers,
      'notifications?subscriberId=acceptance-inbox-other',
      'GET',
      undefined,
      nativeToken,
    ),
    400,
    'Subscriber override query denied',
  );
  await reject(
    input(first.headers, 'users', 'GET', undefined, nativeToken),
    404,
    'Native administration surface denied',
  );
  const tampered = input(first.headers, 'notifications', 'GET', undefined, nativeToken);
  tampered.headers['x-flare-inbox-authorization'] = `Bearer ${other.token}`;
  await reject(tampered, 401, 'Native authorization signature tampering denied');

  await sql`update sessions set revoked_at=now() where id=${firstId} and user_id=${ownedSessions.get(firstId)}`;
  await reject(
    input(first.headers, 'notifications', 'GET', undefined, nativeToken),
    403,
    'Revoked Flare session denied before native access',
  );
  const secondAccess = await initialize(second, 'acceptance-inbox-reader');
  await feed(second, secondAccess.token);
  // Remove only this test's binding to model lost Redis session state without flushing shared data.
  await redis.del(secondAccess.bindingKey);
  await reject(
    input(second.headers, 'notifications', 'GET', undefined, secondAccess.token),
    401,
    'Missing Redis binding fails closed',
  );
  console.log(
    'Actual Nest/private Novu gateway passed: signed bootstrap, feed/read/unread, session/environment/subscriber isolation, revocation, lost binding and credential log redaction. Live Vercel connectivity remains unverified.',
  );
} finally {
  try {
    if (restoreReadState && child?.pid && child.exitCode === null) {
      const { client, token, id } = restoreReadState;
      const response = await request(
        input(client.headers, `notifications/${id}/unread`, 'PATCH', undefined, token),
        200,
        'Restore Inbox fixture unread state',
      );
      await response.body?.cancel();
    }
  } finally {
    try {
      if (child?.pid && child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        const timer = setTimeout(() => child.kill('SIGKILL'), 10_000);
        timer.unref();
        await exited;
        globalThis.clearTimeout(timer);
        assert.equal(child.exitCode, 0, 'Isolated Inbox gateway shuts down gracefully');
      }
    } finally {
      try {
        for (const [id, userId] of ownedSessions)
          await sql`update sessions set revoked_at=coalesce(revoked_at,now()) where id=${id} and user_id=${userId}`;
        if (redis.status === 'ready' && ownedBindings.size) await redis.del(...ownedBindings);
      } finally {
        redis.disconnect();
        await sql.end({ timeout: 5 });
      }
    }
  }
}
