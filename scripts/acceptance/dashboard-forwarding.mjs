import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { signDashboardForwarding } from '../../packages/shared/dist/dashboard-forwarding.js';
import { session, sql, until } from './common.mjs';

// This runs only inside the disposable acceptance container, against the actual
// compiled Nest API. The addresses are limiter identities, never network targets.
const base = 'http://127.0.0.1:4021';
const secret = `fdp_${randomBytes(32).toString('base64')}`;
const clientIp = () => `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g).join(':')}`;
const fixtureClient = clientIp();
const end = Date.now() + 180_000;
let child;
let spawnFailed = false;

function signed(target, { method = 'GET', headers = {}, body, address = fixtureClient } = {}) {
  const bound = { ...headers };
  if (body !== undefined) bound['Content-Type'] = 'application/json';
  return {
    target,
    method,
    body,
    headers: {
      ...bound,
      ...signDashboardForwarding(secret, { method, target, headers: bound, body }, address),
    },
  };
}

async function request(input, expected) {
  const remaining = end - Date.now();
  assert.ok(remaining > 0, 'Signed forwarding acceptance stays within its deadline');
  const response = await fetch(`${base}${input.target}`, {
    method: input.method ?? 'GET',
    headers: input.headers,
    body: input.body,
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(Math.min(10_000, remaining)),
  });
  // Only this fixed response classification is diagnostic; never print proofs,
  // request/response bodies, credentials, or arbitrary upstream header values.
  const proxyError = response.headers.get('x-flare-proxy-error');
  const classification = ['invalid-proof', 'unavailable'].includes(proxyError)
    ? proxyError
    : proxyError === null
      ? 'none'
      : 'unrecognized';
  await response.body?.cancel();
  assert.equal(
    response.status,
    expected,
    `Signed forwarding ${input.target.split('?')[0]} status (proxy: ${classification})`,
  );
  return response;
}

async function invalidProof(input) {
  const response = await request(input, 401);
  assert.equal(response.headers.get('x-flare-proxy-error'), 'invalid-proof');
}

try {
  const { headers } = await session();
  child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      PORT: '4021',
      PUBLIC_API_URL: base,
      FLARE_DASHBOARD_PROXY_SECRET: secret,
      TRUST_PROXY: '',
      // A slow refill keeps the second request deterministic even on a busy CI host.
      AUTH_RATE_LIMIT: '0.001',
      AUTH_RATE_BURST: '1',
    },
    // Child diagnostics can contain application configuration; keep them private.
    stdio: 'ignore',
  });
  child.once('error', () => {
    spawnFailed = true;
  });
  // /health only proves the child is listening. Its Redis client intentionally
  // fails closed before connecting; wait for /ready to verify dependencies
  // before generating any single-use proof. Signed requests are never retried.
  await until(
    async () => {
      assert.equal(spawnFailed, false, 'Isolated signed forwarding API starts');
      assert.equal(child.exitCode, null, 'Isolated signed forwarding API remains running');
      assert.equal(child.signalCode, null, 'Isolated signed forwarding API remains running');
      try {
        const response = await fetch(`${base}/ready`, {
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(2000),
        });
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    },
    'isolated signed forwarding API dependency readiness',
    60_000,
  );

  const me = signed('/v1/auth/me', { headers });
  await request(me, 200);
  await invalidProof(me);

  // A valid envelope does not provide a user, membership, or operator identity.
  const noBearer = await request(signed('/v1/auth/me'), 401);
  assert.equal(noBearer.headers.get('x-flare-proxy-error'), null);
  const noOperator = await request(signed('/v1/operator/session'), 401);
  assert.equal(noOperator.headers.get('x-flare-proxy-error'), null);
  const wrongTenant = await request(
    signed('/v1/auth/me', {
      headers: { ...headers, 'x-org-id': randomUUID() },
    }),
    403,
  );
  assert.equal(wrongTenant.headers.get('x-flare-proxy-error'), null);

  // Controller validation proves the actual parser retained and verified these UTF-8 bytes.
  const body = '{ "fixture": "Bonjour 🌅" }';
  const parsed = await request(
    signed('/v1/auth/login', {
      method: 'POST',
      body,
      address: clientIp(),
    }),
    400,
  );
  assert.equal(parsed.headers.get('x-flare-proxy-error'), null);
  await invalidProof({
    ...signed('/v1/auth/login', { method: 'POST', body, address: clientIp() }),
    body: '{"fixture":"Bonjour 🌅"}',
  });
  await invalidProof({ ...signed('/v1/auth/me', { headers }), target: '/v1/auth/me?changed=1' });
  await invalidProof({ ...signed('/v1/auth/me', { headers }), target: '/v1/auth/me/' });
  const changedAuthorization = signed('/v1/auth/me', { headers });
  changedAuthorization.headers.Authorization = 'Bearer altered-fixture';
  await invalidProof(changedAuthorization);

  // New nonces do not evade the real public-auth bucket. A different signed IP is isolated.
  const limitedClient = clientIp();
  const first = await request(signed('/v1/auth/config', { address: limitedClient }), 200);
  const limited = await request(signed('/v1/auth/config', { address: limitedClient }), 429);
  assert.equal(first.headers.get('ratelimit-limit'), '1');
  assert.equal(limited.headers.get('ratelimit-remaining'), '0');
  const retryAfter = Number(limited.headers.get('retry-after'));
  assert.ok(Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 1000);
  assert.equal(limited.headers.get('x-flare-proxy-error'), null);
  await request(signed('/v1/auth/config', { address: clientIp() }), 200);

  // Direct authenticated clients remain supported even when a proxy key is configured.
  await request({ target: '/v1/auth/me', headers }, 200);
  console.log(
    'Actual Nest API signed forwarding, raw UTF-8 body verification, replay rejection, tenant/operator boundaries, per-client auth throttling and unsigned-client compatibility passed; Vercel deployment remains unverified.',
  );
} finally {
  try {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const deadline = setTimeout(() => child.kill('SIGKILL'), 10_000);
      deadline.unref();
      await exited;
      globalThis.clearTimeout(deadline);
      assert.equal(child.exitCode, 0, 'Isolated signed forwarding API shuts down gracefully');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
