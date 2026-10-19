import { describe, expect, it } from 'vitest';
import {
  dashboardForwardingHeaders as proofNames,
  hasDashboardForwardingHeaders,
  signDashboardForwarding,
  validateDashboardProxySecret,
  verifyDashboardForwarding,
} from './dashboard-forwarding.js';
import type { DashboardForwardingRequest } from './dashboard-forwarding.js';

const secret = `fdp_${Buffer.alloc(32, 7).toString('base64')}`;
const now = 1_800_000_000_000;
const clientIp = '2001:db8::25';
const nonce = '0123456789abcdef0123456789abcdef';
const request = (): DashboardForwardingRequest => ({
  method: 'POST',
  target: '/v1/email?cursor=a%2Fb&limit=20',
  body: '{ "subject": "Bonjour 🌅" }',
  headers: {
    authorization: 'Bearer session-fixture',
    'x-org-id': 'org-fixture',
    'x-environment-id': 'env-fixture',
    'idempotency-key': 'submission-fixture',
    'content-type': 'application/json',
    traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    'x-flare-inbox-authorization': 'Bearer inbox-fixture',
  },
});
function signed(input = request(), at = now) {
  return {
    ...input,
    headers: {
      ...input.headers,
      ...signDashboardForwarding(secret, input, clientIp, { now: at, nonce }),
    },
  };
}

describe('dashboard forwarding proof', () => {
  it('round trips UTF-8 bytes and returns the full replay lifetime', () => {
    const input = signed();
    input.body = Buffer.from(input.body as string);
    expect(verifyDashboardForwarding(secret, input, { now })).toEqual({
      clientIp,
      nonce,
      timestamp: now / 1000,
      replayTtlSeconds: 61,
    });
    expect(Object.keys(signDashboardForwarding(secret, request(), clientIp))).toHaveLength(5);
  });

  it.each(Object.keys(request().headers))('binds the final %s header', (name) => {
    const input = signed();
    input.headers = { ...input.headers, [name]: 'tampered' };
    expect(() => verifyDashboardForwarding(secret, input, { now })).toThrow();
  });

  it.each([
    { method: 'PUT' },
    { target: '/v1/email?limit=20&cursor=a%2Fb' },
    { target: '/v1/email?cursor=a%2fb&limit=20' },
    { body: '{"subject":"Bonjour 🌅"}' },
    { body: Buffer.from([0xff]) },
  ])('rejects altered method, exact target, or original bytes: %j', (change) => {
    expect(() => verifyDashboardForwarding(secret, { ...signed(), ...change }, { now })).toThrow();
  });

  it.each(Object.values(proofNames))('rejects missing proof field %s', (name) => {
    const input = signed();
    input.headers = { ...input.headers, [name]: undefined };
    expect(() => verifyDashboardForwarding(secret, input, { now })).toThrow();
  });

  it('checks canonical timestamp boundaries and covers future skew through expiry', () => {
    const input = signed(request(), now + 60_000);
    expect(verifyDashboardForwarding(secret, input, { now }).replayTtlSeconds).toBe(121);
    expect(verifyDashboardForwarding(secret, input, { now: now + 120_999 }).replayTtlSeconds).toBe(
      1,
    );
    expect(() => verifyDashboardForwarding(secret, input, { now: now - 1000 })).toThrow();
    expect(() => verifyDashboardForwarding(secret, input, { now: now + 121_000 })).toThrow();
    const old = signed(request(), now - 60_000);
    expect(verifyDashboardForwarding(secret, old, { now }).replayTtlSeconds).toBe(1);
    expect(() => verifyDashboardForwarding(secret, old, { now: now + 1000 })).toThrow();
  });

  it('binds the address, nonce, version and timestamp', () => {
    for (const [name, value] of [
      [proofNames.clientIp, '192.0.2.1'],
      [proofNames.nonce, 'a'.repeat(32)],
      [proofNames.version, '2'],
      [proofNames.timestamp, String(now / 1000 + 1)],
      [proofNames.timestamp, `0${now / 1000}`],
    ]) {
      const input = signed();
      input.headers = { ...input.headers, [name!]: value };
      expect(() => verifyDashboardForwarding(secret, input, { now })).toThrow();
    }
  });

  it('rejects duplicate protected headers even when Node discarded their duplicate value', () => {
    const input = signed();
    for (const name of ['Authorization', 'Content-Type', 'Idempotency-Key', proofNames.nonce]) {
      expect(() =>
        verifyDashboardForwarding(secret, input, {
          now,
          rawHeaders: [name, 'one', name.toUpperCase(), 'two'],
        }),
      ).toThrow();
    }
    expect(() =>
      verifyDashboardForwarding(secret, input, { now, rawHeaders: ['Authorization'] }),
    ).toThrow();
  });

  it.each([
    { authorization: ['Bearer one', 'Bearer two'] },
    { Authorization: 'Bearer second' },
    { authorization: 'Bearer fixture\nsecond' },
    { authorization: ' Bearer padded' },
    { authorization: 'Bearer naïve' },
    { authorization: 'a'.repeat(8193) },
    { 'x-flare-proxy-future': 'unrecognized' },
  ])('rejects unsafe protected header shape: %j', (headers) => {
    const input = signed();
    input.headers = { ...input.headers, ...headers };
    expect(() => verifyDashboardForwarding(secret, input, { now })).toThrow();
  });

  it.each(['127.0.0.1,192.0.2.1', ' 192.0.2.1', 'fe80::1%en0', 'not-an-address'])(
    'rejects non-single IP %s',
    (ip) => {
      expect(() => signDashboardForwarding(secret, request(), ip)).toThrow();
    },
  );

  it.each([
    'https://api.test/v1/email',
    '//api.test/v1/email',
    '/a/../email',
    '/v1/email#hash',
    '/x%zz',
    '/x\\y',
  ])('rejects an ambiguous request target %s', (target) => {
    expect(() => signDashboardForwarding(secret, { ...request(), target }, clientIp)).toThrow();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('requires truly empty %s bodies', (method) => {
    expect(() => signDashboardForwarding(secret, { ...request(), method }, clientIp)).toThrow();
    expect(() =>
      signDashboardForwarding(secret, { ...request(), method, body: '' }, clientIp),
    ).not.toThrow();
  });

  it('requires a dedicated canonically encoded 32-byte key', () => {
    expect(() => validateDashboardProxySecret(secret)).not.toThrow();
    for (const value of [
      '',
      'session-secret',
      secret.slice(4),
      `${secret}\n`,
      `fdp_${Buffer.alloc(31).toString('base64')}`,
    ])
      expect(() => validateDashboardProxySecret(value)).toThrow();
    const other = `fdp_${Buffer.alloc(32, 8).toString('base64')}`;
    expect(() => verifyDashboardForwarding(other, signed(), { now })).toThrow();
  });

  it('treats any reserved header as requiring verification, including Inbox auth', () => {
    expect(
      hasDashboardForwardingHeaders({
        authorization: 'Bearer direct',
        'x-forwarded-for': '192.0.2.1',
      }),
    ).toBe(false);
    expect(hasDashboardForwardingHeaders({ 'X-Flare-Proxy-Future': 'present' })).toBe(true);
    expect(hasDashboardForwardingHeaders({ 'X-Flare-Inbox-Authorization': 'Bearer inbox' })).toBe(
      true,
    );
    expect(() => signDashboardForwarding(secret, signed(), clientIp)).toThrow();
  });
});
