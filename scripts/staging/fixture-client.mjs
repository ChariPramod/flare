import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2] || 'compose';
assert.ok(['compose', 'vercel'].includes(mode));
const hosts = {
  web: 'dashboard.staging.example.com',
  api: 'api.staging.example.com',
  track: 'track.staging.example.com',
  ws: 'ws.staging.example.com',
};
const origin = `https://${hosts.web}`;
const authorization = 'Bearer fixture-transfer-only';
const clientIp = Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === 'IPv4' && !address.internal)?.address;
assert.ok(clientIp, 'Fixture must have an isolated network address');
const call = (host, path, { headers = {}, method = 'GET', body, upgrade = false } = {}) =>
  new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'ingress',
        port: 80,
        method,
        path,
        headers: { host, ...headers },
        timeout: 10000,
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > 8 * 1024 * 1024) res.destroy(new Error('Fixture response exceeded its bound'));
          else chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }),
        );
        res.on('error', reject);
      },
    );
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      if (!upgrade) reject(new Error('Unexpected protocol upgrade'));
      else resolve({ status: res.statusCode, headers: res.headers, body: Buffer.alloc(0) });
    });
    req.on('timeout', () => req.destroy(new Error('Fixture request timed out')));
    req.on('error', reject);
    req.end(body);
  });
const json = (response) => JSON.parse(response.body.toString('utf8'));

let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if (json(await call(hosts.api, '/v1/domains')).service === 'api') {
      ready = true;
      break;
    }
  } catch {
    /* Isolated fixture startup only. */
  }
  await delay(500);
}
assert.ok(ready, 'Caddy and synthetic upstream must become ready');

let blocked = 0;
for (const host of Object.values(hosts).filter(
  (host) => mode === 'compose' || host !== hosts.web,
)) {
  for (const path of [
    '/health',
    '/health-check',
    '/ready',
    '/metrics',
    '/internal',
    '/internal/metrics',
    '/v1/internal',
    '/v1/internal/events',
    '/api/internal/events',
    '/api/internal',
  ]) {
    if (host === hosts.web && path === '/metrics') continue;
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      assert.equal(
        (await call(host, path, { method })).status,
        404,
        `Private route must be blocked: ${method} ${host}${path}`,
      );
      blocked++;
    }
  }
}
for (const [host, path] of [
  [hosts.api, '/docs'],
  [hosts.api, '/v2/workflows'],
  [hosts.api, '/socket.io/?EIO=4&transport=polling'],
  [hosts.ws, '/v1/environments'],
  [hosts.ws, '/socket.io.evil'],
  [hosts.ws, '/api/v1/environments'],
]) {
  assert.equal((await call(host, path)).status, 404, 'Native/admin route must remain private');
  blocked++;
}
for (const [host, path, service] of [
  ...(mode === 'compose'
    ? [
        [hosts.web, '/login', 'web'],
        [hosts.web, '/metrics', 'web'],
      ]
    : []),
  [hosts.api, '/v1/domains', 'api'],
  [hosts.track, '/v1/t/fixture/open', 'api'],
  [hosts.ws, '/socket.io/?EIO=4&transport=polling', mode === 'compose' ? 'ws' : 'api'],
]) {
  const response = await call(host, path);
  assert.equal(response.status, 200);
  assert.equal(json(response).service, service);
  assert.equal(json(response).path, path);
}
if (mode === 'vercel') {
  const unowned = await call(hosts.web, '/login');
  assert.ok(
    !unowned.body.toString('utf8').includes('"service":"web"'),
    'The split backend must not claim the external dashboard hostname',
  );
}
const spoofed = await call(
  mode === 'compose' ? hosts.web : hosts.api,
  mode === 'compose' ? '/api/auth/config' : '/v1/auth/config',
  {
    headers: {
      'X-Flare-Client-IP': '198.51.100.10',
      'X-Forwarded-For': '198.51.100.11, 198.51.100.12',
      'X-Real-IP': '198.51.100.13',
    },
  },
);
assert.equal(spoofed.status, 200);
if (mode === 'compose') assert.equal(json(spoofed).client, clientIp);
assert.equal(json(spoofed).forwarded, clientIp, 'Caddy must discard untrusted forwarding chains');

// Real grant authorization is tested separately; these cases prove preservation through ingress.
const headers = {
  origin,
  authorization,
  'content-type': 'application/json',
  'idempotency-key': 'fixture-repeat-key',
  'x-org-id': 'fixture-org',
  'x-environment-id': 'fixture-env',
};
const preflight = await call(hosts.api, '/v1/emails', {
  method: 'OPTIONS',
  headers: {
    origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers':
      'authorization, content-type, idempotency-key, x-org-id, x-environment-id',
  },
});
assert.equal(preflight.status, 204);
assert.equal(preflight.headers['access-control-allow-origin'], origin);
assert.ok(preflight.headers['access-control-allow-headers'].includes('idempotency-key'));
assert.ok(preflight.headers['access-control-allow-headers'].includes('x-environment-id'));
const body = Buffer.from(JSON.stringify({ html: '✨'.repeat(2 * 1024 * 1024) }), 'utf8');
assert.ok(body.length > 4.5 * 1024 * 1024);
const sent = await call(hosts.api, '/v1/emails', { method: 'POST', headers, body });
assert.equal(sent.status, 200);
assert.equal(json(sent).bytes, body.length);
assert.equal(json(sent).sha256, createHash('sha256').update(body).digest('hex'));
for (const [name, expected] of Object.entries({
  origin,
  authorization,
  idempotency: headers['idempotency-key'],
  contentType: 'application/json',
  organization: 'fixture-org',
  environment: 'fixture-env',
}))
  assert.equal(json(sent)[name], expected);
assert.equal(
  (await call(hosts.api, '/v1/emails', { method: 'POST', headers: { origin }, body: '{}' })).status,
  401,
);
assert.equal(
  (
    await call(hosts.api, '/v1/emails', {
      method: 'OPTIONS',
      headers: { origin: 'https://untrusted.example.com' },
    })
  ).status,
  403,
);
assert.equal(
  (
    await call(hosts.api, '/v1/emails', {
      method: 'POST',
      headers: { ...headers, origin: 'https://untrusted.example.com' },
      body: '{}',
    })
  ).status,
  403,
);

const raw = await call(hosts.api, '/v1/inbound/fixture/raw?format=binary', {
  headers: { origin, authorization },
});
assert.equal(raw.status, 200);
const expected = Buffer.alloc(6 * 1024 * 1024 + 37);
for (let i = 0; i < expected.length; i++) expected[i] = i % 251;
assert.ok(raw.body.equals(expected), 'Large binary download must survive byte-for-byte');
assert.equal(Number(raw.headers['content-length']), expected.length);
assert.equal(raw.headers['content-disposition'], 'attachment; filename="received-message.eml"');
assert.equal(raw.headers['access-control-allow-origin'], origin);
assert.ok(raw.headers['access-control-expose-headers'].includes('Content-Disposition'));
assert.equal(raw.headers['cache-control'], 'private, no-store');

const wsKey = randomBytes(16).toString('base64');
const wsHeaders = {
  origin,
  Upgrade: 'websocket',
  Connection: 'Upgrade',
  'Sec-WebSocket-Version': '13',
  'Sec-WebSocket-Key': wsKey,
};
const wsPath = '/socket.io/?EIO=4&transport=websocket&token=fixture-native-token';
const upgraded = await call(hosts.ws, wsPath, { headers: wsHeaders, upgrade: true });
assert.equal(upgraded.status, 101);
assert.equal(upgraded.headers['x-fixture-upstream'], mode === 'vercel' ? 'api' : 'ws');
assert.equal(
  upgraded.headers['sec-websocket-accept'],
  createHash('sha1').update(`${wsKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64'),
);
assert.equal(
  (
    await call(hosts.ws, wsPath, {
      headers: { ...wsHeaders, origin: 'https://untrusted.example.com' },
      upgrade: true,
    })
  ).status,
  403,
);
assert.equal(
  (
    await call(hosts.ws, '/socket.io/?EIO=4&transport=websocket', {
      headers: wsHeaders,
      upgrade: true,
    })
  ).status,
  403,
);
assert.equal(
  (await call(hosts.ws, '/v1/environments', { headers: wsHeaders, upgrade: true })).status,
  404,
);
assert.equal(
  (
    await call(hosts.ws, '/socket.io/?fixture_failure=1&token=fixture-private-query-marker', {
      headers: {
        Authorization: 'Bearer fixture-private-header-marker',
        'X-Flare-Inbox-Authorization': 'Bearer fixture-private-inbox-marker',
      },
    })
  ).status,
  502,
);
console.log(
  `Caddy ${mode} transport boundaries passed: ${blocked} private-route checks, >6 MiB exact UTF-8 upload/binary download, browser headers and WebSocket upgrade routing. Real API authority is covered separately.`,
);
