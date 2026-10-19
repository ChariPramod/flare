import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { gzipSync } from 'node:zlib';
import express from 'express';
import type { Request } from 'express';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  dashboardForwardingHeaders,
  dashboardForwardingSkewSeconds,
  signDashboardForwarding,
} from '@flare/shared/dashboard-forwarding';
import {
  createDashboardForwardingMiddleware,
  verifiedDashboardClientAddress,
} from '../src/dashboard-forwarding.js';
import { integrationTargets } from '../../worker/tests/targets.mjs';

const { redisUrl } = integrationTargets();
const redisOptions = {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  connectTimeout: 1000,
  commandTimeout: 1000,
};
const redis = new Redis(redisUrl, redisOptions);
redis.on('error', () => undefined);
const secret = `fdp_${randomBytes(32).toString('base64')}`;
const clientIp = '203.0.113.19';
const claimedKeys = new Set<string>();
const claims: { key: string; ttl: number }[] = [];
const replay = {
  async set(key: string, value: string, _expiry: 'EX', ttl: number, _onlyNew: 'NX') {
    claimedKeys.add(key);
    claims.push({ key, ttl });
    return redis.set(key, value, 'EX', ttl, 'NX');
  },
};
let now = Math.floor(Date.now() / 1000) * 1000;
let server: Server;
const headers = {
  authorization: 'Bearer fixture-authorization',
  'x-org-id': '00000000-0000-4000-8000-000000000001',
  'x-environment-id': '00000000-0000-4000-8000-000000000002',
  'idempotency-key': 'fixture-submission',
  'content-type': 'application/json',
  traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
};

async function listen(options: {
  secret?: string;
  redis: Parameters<typeof createDashboardForwardingMiddleware>[0]['redis'];
}) {
  const app = express();
  app.use(
    express.json({
      type: ['application/json', 'text/plain'],
      limit: '1mb',
      verify: (req, _res, body) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(body);
      },
    }),
  );
  app.use(createDashboardForwardingMiddleware({ ...options, now: () => now }));
  app.use((req, res) => {
    res.json({
      clientIp: verifiedDashboardClientAddress(req) ?? null,
      socketIp: req.ip,
      assignedPrincipal: Object.hasOwn(req, 'principal'),
      assignedOperator: Object.hasOwn(req, 'operator'),
      authorization: req.get('authorization') ?? null,
      body: req.body ?? null,
    });
  });
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  return listener;
}
async function close(listener: Server) {
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
}
type HttpOptions = {
  method?: string;
  target?: string;
  headers?: Record<string, string>;
  duplicate?: [string, string];
  body?: string | Buffer;
};
function http(options: HttpOptions, listener = server) {
  const body = Buffer.isBuffer(options.body)
    ? options.body
    : Buffer.from(options.body ?? '', 'utf8');
  const outgoingHeaders = Object.entries(options.headers ?? {}).flat();
  if (options.duplicate) outgoingHeaders.push(...options.duplicate);
  // Node does not synthesize Host when using a raw header array for duplicate-header tests.
  // HTTP/1.1 otherwise rejects the request before it can reach Express or this middleware.
  outgoingHeaders.push(
    'Host',
    `127.0.0.1:${(listener.address() as AddressInfo).port}`,
    'Content-Length',
    String(body.length),
    'Connection',
    'close',
  );
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const outgoing = request(
      {
        hostname: '127.0.0.1',
        port: (listener.address() as AddressInfo).port,
        path: options.target ?? '/v1/probe',
        method: options.method ?? 'GET',
        headers: outgoingHeaders,
      },
      (response) => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          text += chunk;
        });
        response.once('end', () => resolve({ status: response.statusCode ?? 0, text }));
        response.once('error', reject);
      },
    );
    outgoing.setTimeout(5000, () => outgoing.destroy(new Error('Local HTTP test timed out')));
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}
function signed(options: HttpOptions = {}, timestamp = now): HttpOptions {
  const input = {
    method: options.method ?? 'GET',
    target: options.target ?? '/v1/probe',
    body: options.body,
    headers: options.headers ?? headers,
  };
  return {
    ...input,
    headers: {
      ...input.headers,
      ...signDashboardForwarding(secret, input, clientIp, { now: timestamp }),
    },
  };
}

beforeAll(async () => {
  if (redis.status !== 'ready') await once(redis, 'ready');
  await redis.ping();
  server = await listen({ secret, redis: replay });
});
beforeEach(() => {
  now = Math.floor(Date.now() / 1000) * 1000;
  claims.length = 0;
});
afterAll(async () => {
  if (server) await close(server);
  if (claimedKeys.size) await redis.del(...claimedKeys);
  await redis.quit();
});

it('accepts exact Unicode bytes and exposes only the verified address, not tenant or operator authority', async () => {
  const body = '{"text":"Hello 🌍","count":1}';
  const input = signed({ method: 'POST', body });
  const response = await http({
    ...input,
    headers: {
      ...input.headers,
      'x-forwarded-for': '198.51.100.77',
      'x-flare-client-ip': '198.51.100.78',
    },
  });
  expect(response.status).toBe(200);
  expect(JSON.parse(response.text)).toMatchObject({
    clientIp,
    assignedPrincipal: false,
    assignedOperator: false,
    authorization: headers.authorization,
    body: { text: 'Hello 🌍', count: 1 },
  });
});

it('allows exactly one concurrent claim for a signed nonce using real Redis', async () => {
  const input = signed({ method: 'POST', body: '{"send":true}' });
  const results = await Promise.all(Array.from({ length: 12 }, () => http(input)));
  expect(results.filter((result) => result.status === 200)).toHaveLength(1);
  expect(results.filter((result) => result.status === 401)).toHaveLength(11);
  expect(new Set(claims.map((claim) => claim.key)).size).toBe(1);
  expect(await redis.ttl(claims[0]!.key)).toBeGreaterThan(0);
});

it('retains future-skew nonces through the full inclusive validity window without waiting', async () => {
  const start = now;
  const input = signed({}, start + dashboardForwardingSkewSeconds * 1000);
  expect((await http(input)).status).toBe(200);
  const claim = claims[0]!;
  expect(claim.ttl).toBe(dashboardForwardingSkewSeconds * 2 + 1);
  expect(await redis.ttl(claim.key)).toBeGreaterThan(dashboardForwardingSkewSeconds);
  now = start + dashboardForwardingSkewSeconds * 2 * 1000;
  expect((await http(input)).status).toBe(401);
  // Remove only this test's key to prove expired signatures fail independently of replay state.
  await redis.del(claim.key);
  const count = claims.length;
  now += 1000;
  expect((await http(input)).status).toBe(401);
  expect(claims).toHaveLength(count);
});

it('accepts the exact past skew boundary with one second of replay retention and rejects outside it', async () => {
  const input = signed({}, now - dashboardForwardingSkewSeconds * 1000);
  expect((await http(input)).status).toBe(200);
  expect(claims[0]?.ttl).toBe(1);
  const count = claims.length;
  expect((await http(signed({}, now - (dashboardForwardingSkewSeconds + 1) * 1000))).status).toBe(
    401,
  );
  expect((await http(signed({}, now + (dashboardForwardingSkewSeconds + 1) * 1000))).status).toBe(
    401,
  );
  expect(claims).toHaveLength(count);
});

it('rejects repeated proof and bound headers even when Node discards or combines duplicate values', async () => {
  for (const name of [...Object.keys(headers), ...Object.values(dashboardForwardingHeaders)]) {
    const input = signed();
    const result = await http({ ...input, duplicate: [name.toUpperCase(), input.headers![name]!] });
    expect(result.status, name).toBe(401);
  }
  expect(claims).toHaveLength(0);
});

it('rejects target, method and bound-header tampering before reserving a nonce', async () => {
  const input = signed({ target: '/v1/probe?tag=first&tag=second' });
  for (const target of [
    '/v1/Probe?tag=first&tag=second',
    '/v1/probe?tag=second&tag=first',
    '/v1/probe?tag=first&tag=second&extra=1',
  ])
    expect((await http({ ...input, target })).status, target).toBe(401);
  expect((await http({ ...input, method: 'POST' })).status).toBe(401);
  for (const [name, value] of Object.entries({
    authorization: 'Bearer another-session',
    'x-org-id': '00000000-0000-4000-8000-000000000003',
    'x-environment-id': '00000000-0000-4000-8000-000000000004',
    'idempotency-key': 'another-submission',
    'content-type': 'text/plain',
    traceparent: '00-0123456789abcdef0123456789abcdef-1123456789abcdef-01',
    [dashboardForwardingHeaders.clientIp]: '203.0.113.20',
  }))
    expect(
      (await http({ ...input, headers: { ...input.headers, [name]: value } })).status,
      name,
    ).toBe(401);
  expect(claims).toHaveLength(0);
});

it('binds raw JSON representation and rejects content encodings that transform signed bytes', async () => {
  const input = signed({ method: 'POST', body: '{"value":1}' });
  expect((await http({ ...input, body: '{ "value": 1 }' })).status).toBe(401);
  expect((await http({ ...input, body: '{"value":2}' })).status).toBe(401);
  expect(
    (
      await http({
        ...input,
        body: gzipSync(Buffer.from('{"value":1}')),
        headers: { ...input.headers, 'content-encoding': 'gzip' },
      })
    ).status,
  ).toBe(401);
  const unsupported = signed({
    method: 'POST',
    body: 'opaque',
    headers: { 'content-type': 'application/octet-stream' },
  });
  expect((await http(unsupported)).status).toBe(401);
  expect(claims).toHaveLength(0);
  const text = signed({
    method: 'POST',
    body: '{"value":1}',
    headers: { 'content-type': 'text/plain' },
  });
  expect((await http(text)).status).toBe(200);
});

it('fails closed when a dedicated Redis connection is unavailable', async () => {
  const unavailable = new Redis(redisUrl, { ...redisOptions, lazyConnect: true });
  unavailable.on('error', () => undefined);
  unavailable.disconnect();
  const listener = await listen({ secret, redis: unavailable });
  try {
    expect((await http(signed(), listener)).status).toBe(503);
  } finally {
    await close(listener);
    unavailable.disconnect();
  }
});

it('keeps unsigned self-hosted traffic working without accepting caller-provided address proofs', async () => {
  for (const listener of [server, await listen({ redis: replay })]) {
    try {
      const response = await http(
        { headers: { 'x-forwarded-for': clientIp, 'x-flare-client-ip': clientIp } },
        listener,
      );
      expect(response.status).toBe(200);
      expect(JSON.parse(response.text)).toMatchObject({
        clientIp: null,
        assignedPrincipal: false,
        assignedOperator: false,
      });
      expect(
        (await http({ headers: { [dashboardForwardingHeaders.clientIp]: clientIp } }, listener))
          .status,
      ).toBe(listener === server ? 401 : 503);
      if (listener !== server) expect((await http(signed(), listener)).status).toBe(503);
    } finally {
      if (listener !== server) await close(listener);
    }
  }
  expect(claims).toHaveLength(0);
});
