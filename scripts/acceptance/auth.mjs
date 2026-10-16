import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { sql, session } from './common.mjs';
import { hashToken, totp } from '../../packages/shared/dist/index.js';

// A separate invited account keeps the demo owner's browser credentials unchanged.
// All enrollment, login and recovery mutations go through the real HTTP API.
try {
  const { api, org, env } = await session();
  // Express accepts route casing variants; the public authentication limiter
  // must cover exactly those same routes before any credentials are processed.
  const limits = [];
  for (const path of ['/v1/auth/config', '/V1/AUTH/CONFIG']) {
    const response = await fetch(`http://localhost:4000${path}`, {
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, 'Authentication config route is reachable');
    assert.ok(response.headers.has('ratelimit-limit'), 'Authentication rate limit is applied');
    assert.ok(response.headers.has('ratelimit-remaining'), 'Authentication capacity is reported');
    limits.push(response.headers.get('ratelimit-limit'));
    await response.json();
  }
  assert.equal(limits[0], limits[1], 'Route casing must not change the authentication limit');
  const email = 'mfa-acceptance@example.test';
  const password = randomBytes(32).toString('base64url');
  const invite = await api('/team/invites', 'POST', { email, role: 'developer' });
  const request = async (path, body, token, expected = 201) => {
    const response = await fetch(`http://localhost:4000/v1/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token
          ? {
              Authorization: `Bearer ${token}`,
              'x-org-id': org.id,
              'x-environment-id': env.id,
            }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(30000),
    });
    assert.equal(response.status, expected, `Authentication ${path} HTTP status`);
    return response.json();
  };
  const token = new URL(invite.accept_url).searchParams.get('token');
  const account = await request('accept-invite', { token, name: 'MFA acceptance', password });
  const olderSession = await request('login', { email, password });
  await request('mfa/setup', { password: randomBytes(32).toString('hex') }, account.token, 401);
  const setup = await request('mfa/setup', { password }, account.token);
  const setupCounter = Math.floor(Date.now() / 30000);
  const setupCode = totp(setup.secret, setupCounter);
  const enabled = await request('mfa/enable', { code: setupCode }, account.token);
  assert.equal(enabled.recovery_codes.length, 10);
  assert.equal(new Set(enabled.recovery_codes).size, 10);
  assert.equal((await request('me', undefined, account.token, 200)).user.mfa_enabled, true);
  await request('me', undefined, olderSession.token, 403);
  await request('login', { email, password }, undefined, 401);
  await request('login', { email, password, code: setupCode }, undefined, 401);

  const [stored] =
    await sql`select mfa_secret, mfa_pending, recovery_hashes from users where id=${account.user.id}`;
  assert.ok(stored.mfa_secret.startsWith('v1.'), 'TOTP secret is encrypted at rest');
  assert.ok(stored.mfa_secret !== setup.secret, 'Plaintext secret is not persisted');
  assert.equal(stored.mfa_pending, null);
  assert.ok(
    enabled.recovery_codes.every((code) => stored.recovery_hashes.includes(hashToken(code))),
    'Only recovery hashes are persisted',
  );

  // The verifier's documented +/- one-step tolerance permits the next counter,
  // avoiding a 30-second sleep while still exercising atomic replay protection.
  const nextCounter = Math.max(setupCounter + 1, Math.floor(Date.now() / 30000));
  const code = totp(setup.secret, nextCounter);
  const concurrentLogin = async (candidate) => {
    const response = await fetch('http://localhost:4000/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, code: candidate }),
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(30000),
    });
    return { status: response.status, body: await response.json() };
  };
  const attempts = await Promise.all([concurrentLogin(code), concurrentLogin(code)]);
  assert.deepEqual(attempts.map((value) => value.status).sort(), [201, 401]);
  const authenticated = attempts.find((value) => value.status === 201).body;
  await request('logout', {}, authenticated.token);
  await request('me', undefined, authenticated.token, 403);

  const recovery = enabled.recovery_codes[0];
  const recoveryAttempts = await Promise.all([
    concurrentLogin(recovery),
    concurrentLogin(recovery),
  ]);
  assert.deepEqual(recoveryAttempts.map((value) => value.status).sort(), [201, 401]);
  await request('login', { email, password, code: recovery }, undefined, 401);
  const [after] = await sql`select recovery_hashes from users where id=${account.user.id}`;
  assert.equal(after.recovery_hashes.length, 9);
  assert.ok(!after.recovery_hashes.includes(hashToken(recovery)));

  await request('mfa/disable', { password, code: 'invalid-code' }, account.token, 401);
  assert.equal((await request('me', undefined, account.token, 200)).user.mfa_enabled, true);
  await request('mfa/disable', { password, code: enabled.recovery_codes[1] }, account.token);
  assert.equal((await request('me', undefined, account.token, 200)).user.mfa_enabled, false);
  await request('login', { email, password });
  console.log(
    'Real HTTP invitation, local MFA enrollment, concurrent TOTP/recovery replay protection and session revocation passed; external OIDC remains separate.',
  );
} finally {
  await sql.end();
}
