import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, request as httpsRequest } from 'node:https';
import { createRequire } from 'node:module';
import { URLSearchParams } from 'node:url';
import { sql, session, until } from './common.mjs';
import { totp } from '../../packages/shared/dist/index.js';

// A real, TLS-authenticated local issuer. No external IdP account, insecure-HTTP
// production option, static token, or mocked openid-client code is involved.
const requireApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { exportJWK, generateKeyPair, SignJWT } = await import(requireApi.resolve('jose'));
const { privateKey, publicKey } = await generateKeyPair('RS256');
const rogue = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'acceptance', alg: 'RS256', use: 'sig' };
const certPath = '/app/ops/certs/relay.crt';
const cert = readFileSync(certPath);
const apiBase = 'http://localhost:4313';
// Isolate fixture auth traffic from the primary acceptance API's IP bucket.
// Only the private test child trusts this loopback hop; production is unchanged.
const fixtureClient = { 'x-forwarded-for': '198.18.0.14' };
const issuer = 'https://localhost:4314';
const clientId = 'flare-local-acceptance';
const clientSecret = randomBytes(32).toString('base64url');
const email = `oidc-${randomBytes(8).toString('hex')}@example.test`;
const codes = new Map();
let jwksRequests = 0;
let validatedPkce = 0;
let discoveryUnavailable = true;
let fixtureError;
const server = createServer(
  { cert, key: readFileSync('/app/ops/certs/relay.key') },
  async (req, res) => {
    try {
      const url = new URL(req.url, issuer);
      const send = (status, body) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname === '/.well-known/openid-configuration') {
        if (discoveryUnavailable) return send(503, { error: 'temporarily_unavailable' });
        return send(200, {
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          response_types_supported: ['code'],
          subject_types_supported: ['public'],
          id_token_signing_alg_values_supported: ['RS256'],
          token_endpoint_auth_methods_supported: ['client_secret_post'],
          code_challenge_methods_supported: ['S256'],
        });
      }
      if (url.pathname === '/jwks') {
        jwksRequests++;
        return send(200, { keys: [jwk] });
      }
      if (url.pathname === '/authorize') {
        const p = url.searchParams;
        assert.equal(p.get('client_id'), clientId);
        assert.equal(p.get('response_type'), 'code');
        assert.equal(p.get('redirect_uri'), `${apiBase}/v1/auth/oidc/callback`);
        assert.equal(p.get('code_challenge_method'), 'S256');
        assert.ok(p.get('nonce'));
        assert.ok(p.get('state'));
        const code = randomBytes(32).toString('base64url');
        codes.set(code, {
          nonce: p.get('nonce'),
          challenge: p.get('code_challenge'),
          mode: p.get('mode') ?? 'valid',
        });
        const callback = new URL(p.get('redirect_uri'));
        callback.searchParams.set('state', p.get('state'));
        callback.searchParams.set('code', code);
        res.writeHead(302, { Location: callback.href });
        return res.end();
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          assert.ok(size <= 8192, 'Bounded fixture token request');
          chunks.push(chunk);
        }
        const form = new URLSearchParams(Buffer.concat(chunks).toString());
        assert.equal(form.get('client_id'), clientId);
        assert.ok(form.get('client_secret') === clientSecret, 'Confidential client authentication');
        assert.equal(form.get('grant_type'), 'authorization_code');
        assert.equal(form.get('redirect_uri'), `${apiBase}/v1/auth/oidc/callback`);
        const authorization = codes.get(form.get('code'));
        codes.delete(form.get('code'));
        if (!authorization) return send(400, { error: 'invalid_grant' });
        const challenge = createHash('sha256')
          .update(form.get('code_verifier') ?? '')
          .digest('base64url');
        if (authorization.mode === 'pkce' || challenge !== authorization.challenge)
          return send(400, { error: 'invalid_grant' });
        validatedPkce++;
        const { mode, nonce } = authorization;
        const claims = {
          nonce: mode === 'nonce' ? 'wrong-nonce' : nonce,
          email: mode === 'unknown-user' ? 'uninvited@example.test' : email,
          email_verified: mode !== 'unverified-email',
        };
        if (mode === 'missing-nonce') delete claims.nonce;
        if (mode === 'missing-email') delete claims.email;
        if (mode === 'changed-email') claims.email = 'renamed@example.test';
        const idToken = await new SignJWT(claims)
          .setProtectedHeader({ alg: 'RS256', kid: 'acceptance' })
          .setIssuer(mode === 'issuer' ? `${issuer}/wrong` : issuer)
          .setAudience(mode === 'audience' ? 'another-client' : clientId)
          .setSubject(mode === 'unknown-user' ? 'uninvited-subject' : 'invited-subject')
          .setIssuedAt()
          .setExpirationTime(mode === 'expired' ? Math.floor(Date.now() / 1000) - 600 : '5m')
          .sign(mode === 'signature' ? rogue.privateKey : privateKey);
        return send(200, {
          token_type: 'Bearer',
          access_token: randomBytes(24).toString('base64url'),
          id_token: idToken,
        });
      }
      send(404, { error: 'not_found' });
    } catch (error) {
      fixtureError = error;
      res.writeHead(500);
      res.end();
    }
  },
);
let child;
const request = async (path, { body, headers, expected = 200 } = {}) => {
  const response = await fetch(`${apiBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...fixtureClient, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual',
    signal: globalThis.AbortSignal.timeout(30000),
  });
  assert.equal(response.status, expected, `OIDC fixture API ${path.split('?')[0]} status`);
  return response;
};
const authorize = (url) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(url, { ca: cert, method: 'GET', timeout: 10000 }, (res) => {
      res.resume();
      if (res.statusCode !== 302) reject(new Error('Local issuer authorization failed'));
      else resolve(res.headers.location);
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Local issuer timeout')));
    req.end();
  });
const begin = async (mode = 'valid') => {
  const start = await request('/v1/auth/oidc', { expected: 302 });
  const cookies = start.headers.get('set-cookie');
  assert.ok(cookies.includes('HttpOnly') && cookies.includes('SameSite=Lax'));
  const cookie = cookies.split(';')[0];
  const location = new URL(start.headers.get('location'));
  assert.equal(location.origin, issuer);
  location.searchParams.set('mode', mode);
  const callback = new URL(await authorize(location));
  if (fixtureError) throw fixtureError;
  return { cookie, callback: callback.pathname + callback.search };
};
const callback = async ({ cookie, callback }, expected = 302) => {
  const response = await request(callback, { headers: { cookie }, expected });
  if (expected !== 302) {
    assert.equal(
      response.headers.get('location'),
      null,
      'Rejected grants never redirect with an exchange',
    );
    return;
  }
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, new URL(process.env.WEB_ORIGIN).origin);
  assert.equal(location.pathname, '/login');
  assert.ok(response.headers.get('set-cookie').includes('flare_oidc_state=;'));
  const code = location.searchParams.get('code');
  assert.ok(code && code.length >= 32);
  return code;
};
try {
  await new Promise((resolve) => server.listen(4314, '127.0.0.1', resolve));
  child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      PORT: '4313',
      PUBLIC_API_URL: apiBase,
      OIDC_ISSUER: issuer,
      OIDC_CLIENT_ID: clientId,
      OIDC_CLIENT_SECRET: clientSecret,
      NODE_EXTRA_CA_CERTS: certPath,
      AUTH_RATE_BURST: '500',
      TRUST_PROXY: '127.0.0.1',
    },
    // Provider URLs and codes must never be printed by child diagnostics.
    stdio: 'ignore',
  });
  await until(
    async () => {
      assert.equal(child.exitCode, null, 'Isolated OIDC API remains running');
      try {
        return (await fetch(`${apiBase}/health`, { signal: globalThis.AbortSignal.timeout(5000) }))
          .ok;
      } catch {
        return false;
      }
    },
    'isolated OIDC API startup',
    60000,
  );
  // A transient discovery failure is recoverable without restarting the API.
  await request('/v1/auth/oidc', { expected: 500 });
  discoveryUnavailable = false;
  const { api, org, env } = await session();
  const invite = await api('/team/invites', 'POST', { email, role: 'developer' });
  const password = randomBytes(32).toString('base64url');
  const accepted = await (
    await request('/v1/auth/accept-invite', {
      expected: 201,
      body: {
        token: new URL(invite.accept_url).searchParams.get('token'),
        name: 'OIDC acceptance',
        password,
      },
    })
  ).json();
  const countSessions = async () =>
    Number(
      (await sql`select count(*) as count from sessions where user_id=${accepted.user.id}`)[0]
        .count,
    );
  const initialSessions = await countSessions();
  for (const mode of [
    'signature',
    'nonce',
    'missing-nonce',
    'issuer',
    'audience',
    'expired',
    'pkce',
    'unverified-email',
    'missing-email',
    'unknown-user',
  ]) {
    const flow = await begin(mode);
    await callback(flow, mode === 'unknown-user' ? 403 : 401);
    await callback(flow, 401);
    assert.equal(await countSessions(), initialSessions, `${mode} must not create a session`);
  }
  const valid = await begin();
  await callback({ ...valid, cookie: 'flare_oidc_state=wrong' }, 401);
  await callback({ ...valid, cookie: '' }, 401);
  const exchange = await callback(valid);
  await callback(valid, 401);
  const exchanges = await Promise.all(
    [1, 2].map(async () => {
      const res = await fetch(`${apiBase}/v1/auth/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...fixtureClient },
        body: JSON.stringify({ code: exchange }),
        signal: globalThis.AbortSignal.timeout(30000),
      });
      return { status: res.status, body: await res.json() };
    }),
  );
  assert.deepEqual(exchanges.map((r) => r.status).sort(), [201, 401]);
  assert.equal(
    await countSessions(),
    initialSessions + 1,
    'Concurrent exchange issues exactly one session',
  );
  const login = exchanges.find((r) => r.status === 201).body;
  assert.equal(login.user.id, accepted.user.id);
  const headers = {
    Authorization: `Bearer ${login.token}`,
    'x-org-id': org.id,
    'x-environment-id': env.id,
  };
  await request('/v1/auth/me', { headers });
  const setup = await (
    await request('/v1/auth/mfa/setup', { headers, body: { password }, expected: 201 })
  ).json();
  const enabled = await (
    await request('/v1/auth/mfa/enable', {
      headers,
      body: { code: totp(setup.secret, Math.floor(Date.now() / 30000)) },
      expected: 201,
    })
  ).json();
  // A linked issuer/subject stays stable when the verified email changes.
  const mfaExchange = await callback(await begin('changed-email'));
  await request('/v1/auth/exchange', { body: { code: mfaExchange }, expected: 401 });
  await request('/v1/auth/exchange', {
    body: { code: mfaExchange, mfa_code: 'invalid' },
    expected: 401,
  });
  const mfaLogin = await (
    await request('/v1/auth/exchange', {
      body: { code: mfaExchange, mfa_code: enabled.recovery_codes[0] },
      expected: 201,
    })
  ).json();
  assert.equal(mfaLogin.user.id, accepted.user.id);
  assert.equal(mfaLogin.user.mfa_enabled, true);
  await request('/v1/auth/exchange', {
    body: { code: mfaExchange, mfa_code: enabled.recovery_codes[1] },
    expected: 401,
  });
  const freshExchange = await callback(await begin());
  await request('/v1/auth/exchange', {
    body: { code: freshExchange, mfa_code: enabled.recovery_codes[0] },
    expected: 401,
  });
  const mfaHeaders = { ...headers, Authorization: `Bearer ${mfaLogin.token}` };
  await request('/v1/auth/logout', { headers: mfaHeaders, body: {}, expected: 201 });
  await request('/v1/auth/me', { headers: mfaHeaders, expected: 403 });
  assert.ok(jwksRequests > 0, 'ID-token signatures use issuer JWKS');
  assert.ok(validatedPkce >= 10, 'Real code grants validate S256 PKCE');
  if (fixtureError) throw fixtureError;
  console.log(
    'Local TLS OIDC discovery recovery, JWKS tampering, claims, state/nonce/PKCE, invitation gating, concurrent exchange, local MFA and session revocation passed; external IdP interoperability remains pending.',
  );
} finally {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const deadline = setTimeout(() => child.kill('SIGKILL'), 10000);
    deadline.unref();
    await exited;
    globalThis.clearTimeout(deadline);
  }
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await sql.end();
}
