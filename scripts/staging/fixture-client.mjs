import assert from 'node:assert/strict';
import { request } from 'node:http';
import { networkInterfaces } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const hosts = {
  web: 'dashboard.staging.example.com',
  api: 'api.staging.example.com',
  track: 'track.staging.example.com',
  ws: 'ws.staging.example.com',
};
const clientIp = Object.values(networkInterfaces())
  .flat()
  .find((address) => address?.family === 'IPv4' && !address.internal)?.address;
assert.ok(clientIp, 'Fixture must have an isolated network address');
const get = (host, path, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = request(
      { hostname: 'ingress', port: 80, path, headers: { host, ...headers }, timeout: 3000 },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Fixture request timed out')));
    req.on('error', reject);
    req.end();
  });

let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await get(hosts.web, '/login')).status === 200) {
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
for (const host of Object.values(hosts)) {
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
    assert.equal(
      (await get(host, path)).status,
      404,
      `Private route must be blocked: ${host}${path}`,
    );
    blocked++;
  }
}
for (const [host, path] of [
  [hosts.api, '/docs'],
  [hosts.api, '/v2/workflows'],
  [hosts.ws, '/v1/environments'],
]) {
  assert.equal((await get(host, path)).status, 404, 'Native/admin route must remain private');
  blocked++;
}
for (const [host, path, service] of [
  [hosts.web, '/login', 'web'],
  [hosts.api, '/v1/domains', 'api'],
  [hosts.track, '/v1/t/fixture/open', 'api'],
  [hosts.ws, '/socket.io/?EIO=4&transport=polling', 'ws'],
]) {
  const response = await get(host, path);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body).service, service);
  assert.equal(JSON.parse(response.body).path, path);
}
const spoofed = await get(hosts.web, '/api/auth/config', {
  'X-Flare-Client-IP': '198.51.100.10',
  'X-Forwarded-For': '198.51.100.11, 198.51.100.12',
  'X-Real-IP': '198.51.100.13',
});
assert.equal(spoofed.status, 200);
const received = JSON.parse(spoofed.body);
assert.equal(received.client, clientIp, 'Ingress-owned client header must overwrite caller input');
assert.equal(
  received.forwarded,
  clientIp,
  'Caddy must discard an untrusted caller forwarding chain',
);
console.log(
  `Caddy runtime boundaries passed: ${blocked} private-route checks, four upstream routes, and client-IP spoof rejection.`,
);
