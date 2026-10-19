import { createHash, randomUUID } from 'node:crypto';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { decodeJwt, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Principal } from '@flare/shared';
vi.mock('./context.js', () => ({ config: { JWT_SECRET: 'transfer-test-key' }, sql: {} }));
import type { AuthRequest } from './context.js';
import {
  browserTransferCors,
  browserTransferOrigins,
  browserTransferTarget,
  issueBrowserTransfer,
  redeemBrowserTransfer,
} from './browser-transfers-auth.js';
import type {
  BrowserTransferDependencies,
  BrowserTransferInput,
} from './browser-transfers-auth.js';
import { browserTransferDownload } from './browser-transfers-download.js';

const principal: Principal = {
  actorId: randomUUID(),
  sessionId: randomUUID(),
  orgId: randomUUID(),
  environmentId: randomUUID(),
  kind: 'session',
  role: 'developer',
  production: false,
};
const messageId = randomUUID();
const read: BrowserTransferInput = { operation: 'email.detail', message_id: messageId };
const body = '{ "subject": "Hello 🌅" }';
const send: BrowserTransferInput = {
  operation: 'email.send',
  body_sha256: createHash('sha256').update(body).digest('hex'),
  body_bytes: Buffer.byteLength(body),
  idempotency_key: randomUUID(),
};
let now: number;
let current: Principal | undefined;
let expiry: Date;
let options: BrowserTransferDependencies;
function issuance(input: unknown, overrides: Partial<RawBodyRequest<AuthRequest>> = {}) {
  return {
    principal,
    headers: { origin: options.webOrigin },
    rawHeaders: [],
    rawBody: Buffer.from(JSON.stringify(input)),
    ...overrides,
  } as RawBodyRequest<AuthRequest>;
}
function transfer(input: BrowserTransferInput, overrides: Partial<RawBodyRequest<Request>> = {}) {
  const target = browserTransferTarget(input);
  return {
    method: target.method,
    originalUrl: target.target,
    headers: {
      origin: options.webOrigin,
      ...(input.operation === 'email.send'
        ? {
            'content-type': 'application/json',
            'idempotency-key': input.idempotency_key,
            'content-length': String(Buffer.byteLength(body)),
          }
        : {}),
    },
    rawHeaders: [],
    ...(input.operation === 'email.send' ? { rawBody: Buffer.from(body) } : {}),
    ...overrides,
  } as RawBodyRequest<Request>;
}
beforeEach(() => {
  now = 1_800_000_000_000;
  current = { ...principal };
  expiry = new Date(now + 3_600_000);
  options = {
    secret: 'transfer-test-key',
    webOrigin: 'https://web.example.test',
    apiOrigin: 'https://api.example.test',
    maxBodyBytes: 40 * 1024 * 1024,
    now: () => now,
    loadSession: vi.fn(async () =>
      current ? { principal: current, expiresAt: expiry } : undefined,
    ),
    authorizeResource: vi.fn(async () => undefined),
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('session-bound browser transfers', () => {
  it('builds the exact URL and caps lifetime by five minutes and the live session deadline', async () => {
    const grant = await issueBrowserTransfer(issuance(read), read, options);
    expect(grant.url).toBe(`${options.apiOrigin}/v1/emails/${messageId}`);
    expect(grant.method).toBe('GET');
    expect(grant.expires_at).toBe(new Date(now + 300_000).toISOString());
    const claims = decodeJwt(grant.token.slice(4));
    expect(claims).toMatchObject({
      aud: 'flare-browser-transfer',
      sub: principal.actorId,
      session_id: principal.sessionId,
      org_id: principal.orgId,
      environment_id: principal.environmentId,
    });
    expiry = new Date(now + 45_999);
    expect((await issueBrowserTransfer(issuance(read), read, options)).expires_at).toBe(
      new Date(now + 45_000).toISOString(),
    );
  });

  it('allows repeated exact sends and renewed grants while binding original UTF-8 bytes and key', async () => {
    const grant = await issueBrowserTransfer(issuance(send), send, options);
    const again = await issueBrowserTransfer(issuance(send), send, options);
    expect(again.token).not.toBe(grant.token);
    for (const token of [grant.token, grant.token, again.token])
      expect(await redeemBrowserTransfer(transfer(send), token, 'email.send', options)).toEqual(
        current,
      );
    expect(options.authorizeResource).toHaveBeenCalledWith(current, send);
  });

  it('permits viewer downloads but rejects viewer and API-key sends or API-key issuance', async () => {
    current!.role = 'viewer';
    const grant = await issueBrowserTransfer(issuance(read), read, options);
    expect(
      (await redeemBrowserTransfer(transfer(read), grant.token, read.operation, options)).role,
    ).toBe('viewer');
    await expect(issueBrowserTransfer(issuance(send), send, options)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      issueBrowserTransfer(
        issuance(read, { principal: { ...principal, kind: 'api_key' } }),
        read,
        options,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rechecks revocation, membership removal, role demotion and shortened session expiry', async () => {
    const grant = await issueBrowserTransfer(issuance(send), send, options);
    current = undefined;
    await expect(
      redeemBrowserTransfer(transfer(send), grant.token, send.operation, options),
    ).rejects.toMatchObject({ status: 403 });
    current = { ...principal, role: 'viewer' };
    await expect(
      redeemBrowserTransfer(transfer(send), grant.token, send.operation, options),
    ).rejects.toMatchObject({ status: 403 });
    current = { ...principal };
    expiry = new Date(now);
    await expect(
      redeemBrowserTransfer(transfer(send), grant.token, send.operation, options),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('returns a distinguishable invalid-grant error for expiry, signature tampering and wrong audience', async () => {
    const grant = await issueBrowserTransfer(issuance(read), read, options);
    now += 300_000;
    await expect(
      redeemBrowserTransfer(transfer(read), grant.token, read.operation, options),
    ).rejects.toMatchObject({ response: { code: 'browser_transfer_invalid' }, status: 401 });
    now -= 300_000;
    const parts = grant.token.split('.');
    parts[2] = `${parts[2]![0] === 'a' ? 'b' : 'a'}${parts[2]!.slice(1)}`;
    await expect(
      redeemBrowserTransfer(transfer(read), parts.join('.'), read.operation, options),
    ).rejects.toMatchObject({ status: 401 });
    const jwt = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('flare')
      .setAudience('flare-dashboard')
      .setSubject(principal.actorId)
      .setExpirationTime(Math.floor(now / 1000) + 60)
      .sign(new TextEncoder().encode(options.secret));
    await expect(
      redeemBrowserTransfer(transfer(read), `fbt_${jwt}`, read.operation, options),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('cannot be used on ordinary routes, a different resource/method or an unapproved query', async () => {
    const grant = await issueBrowserTransfer(issuance(read), read, options);
    await expect(
      redeemBrowserTransfer(transfer(read), grant.token, undefined, options),
    ).rejects.toMatchObject({ status: 401 });
    for (const override of [
      { originalUrl: '/v1/auth/me' },
      { originalUrl: `/v1/emails/${randomUUID()}` },
      { method: 'POST' },
      { originalUrl: `/v1/emails/${messageId}?extra=1` },
    ])
      await expect(
        redeemBrowserTransfer(transfer(read, override), grant.token, read.operation, options),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      redeemBrowserTransfer(transfer(read), grant.token, 'email.source', options),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('requires exact origin on issuance and redemption, including missing/null origin', async () => {
    const grant = await issueBrowserTransfer(issuance(read), read, options);
    for (const origin of [
      undefined,
      'null',
      'https://web.example.test.evil.test',
      `${options.webOrigin}/`,
    ]) {
      await expect(
        issueBrowserTransfer(issuance(read, { headers: { origin } }), read, options),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        redeemBrowserTransfer(
          transfer(read, { headers: { origin } }),
          grant.token,
          read.operation,
          options,
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
  });

  it('rejects altered body serialization, key, content type, compressed or missing bytes', async () => {
    const grant = await issueBrowserTransfer(issuance(send), send, options);
    const base = transfer(send);
    const variants = [
      { rawBody: Buffer.from('{"subject":"Hello 🌅"}') },
      { rawBody: undefined },
      { headers: { ...base.headers, 'idempotency-key': 'different' } },
      { headers: { ...base.headers, 'content-type': 'text/plain' } },
      { headers: { ...base.headers, 'content-encoding': 'gzip' } },
      { headers: { ...base.headers, 'content-length': '0' } },
      {
        rawHeaders: [
          'Idempotency-Key',
          send.idempotency_key,
          'idempotency-key',
          send.idempotency_key,
        ],
      },
    ];
    for (const override of variants)
      await expect(
        redeemBrowserTransfer(transfer(send, override), grant.token, send.operation, options),
      ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects body-bearing downloads and cannot select a different binary representation', async () => {
    const input: BrowserTransferInput = { operation: 'inbound.raw', message_id: messageId };
    const grant = await issueBrowserTransfer(issuance(input), input, options);
    expect(grant.url).toMatch(/\?format=binary$/);
    await expect(
      redeemBrowserTransfer(
        transfer(input, { rawBody: Buffer.from('x') }),
        grant.token,
        input.operation,
        options,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      redeemBrowserTransfer(
        transfer(input, { originalUrl: `/v1/inbound/${messageId}/raw` }),
        grant.token,
        input.operation,
        options,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('requires a tenant-scoped resource check and a small strict grant schema', async () => {
    vi.mocked(options.authorizeResource).mockRejectedValueOnce(new Error('Resource not found'));
    await expect(issueBrowserTransfer(issuance(read), read, options)).rejects.toThrow(
      'Resource not found',
    );
    for (const input of [
      { ...read, url: 'https://evil.test' },
      { ...read, operation: 'email.send' },
      { ...send, body_bytes: options.maxBodyBytes + 1 },
    ])
      await expect(issueBrowserTransfer(issuance(input), input, options)).rejects.toMatchObject({
        status: 400,
      });
    await expect(
      issueBrowserTransfer(issuance(read, { rawBody: Buffer.alloc(4097) }), read, options),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('transfer origins, preflight and downloads', () => {
  it('requires exact HTTPS origins or the explicit local HTTP loopback pair', () => {
    vi.stubEnv('WEB_ORIGIN', 'https://web.example.test');
    vi.stubEnv('PUBLIC_API_URL', 'https://api.example.test');
    expect(browserTransferOrigins()).toEqual({
      webOrigin: 'https://web.example.test',
      apiOrigin: 'https://api.example.test',
    });
    for (const api of [
      '',
      'https://api.example.test/',
      'https://user:secret@api.example.test',
      'http://api.example.test',
    ]) {
      vi.stubEnv('PUBLIC_API_URL', api);
      expect(() => browserTransferOrigins()).toThrow();
    }
    vi.stubEnv('WEB_ORIGIN', 'http://localhost:3000');
    vi.stubEnv('PUBLIC_API_URL', 'http://127.0.0.1:4000');
    expect(browserTransferOrigins().apiOrigin).toBe('http://127.0.0.1:4000');
  });

  it('allows only exact transfer preflight methods, paths and headers without credentials', () => {
    vi.stubEnv('WEB_ORIGIN', options.webOrigin);
    vi.stubEnv('PUBLIC_API_URL', options.apiOrigin);
    const res = {
      vary: vi.fn(),
      setHeader: vi.fn(),
      status: vi.fn().mockReturnThis(),
      end: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    const req = {
      originalUrl: '/v1/emails',
      method: 'OPTIONS',
      headers: {
        origin: options.webOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, idempotency-key',
      },
    } as unknown as Request;
    browserTransferCors(req, res, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.setHeader).not.toHaveBeenCalledWith(
      'Access-Control-Allow-Credentials',
      expect.anything(),
    );
    req.headers['access-control-request-headers'] = 'authorization, x-org-id, x-environment-id';
    browserTransferCors(req, res, next);
    expect(res.status).toHaveBeenLastCalledWith(204);
    req.headers['access-control-request-headers'] = 'authorization, x-unapproved';
    browserTransferCors(req, res, next);
    expect(res.status).toHaveBeenLastCalledWith(403);
    req.originalUrl = '/v1/operator/session';
    browserTransferCors(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves ordinary email list and reschedule preflights and unconfigured self-host APIs', () => {
    vi.stubEnv('WEB_ORIGIN', options.webOrigin);
    vi.stubEnv('PUBLIC_API_URL', options.apiOrigin);
    const next = vi.fn();
    const response = {} as Response;
    for (const [path, method] of [
      ['/v1/emails', 'GET'],
      [`/v1/emails/${messageId}`, 'PATCH'],
    ]) {
      browserTransferCors(
        {
          originalUrl: path,
          method: 'OPTIONS',
          headers: {
            origin: options.webOrigin,
            'access-control-request-method': method,
          },
        } as unknown as Request,
        response,
        next,
      );
    }
    expect(next).toHaveBeenCalledTimes(2);
    vi.stubEnv('PUBLIC_API_URL', '');
    browserTransferCors(
      {
        originalUrl: '/v1/emails',
        method: 'OPTIONS',
        headers: {
          origin: options.webOrigin,
          'access-control-request-method': 'POST',
        },
      } as unknown as Request,
      response,
      next,
    );
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('creates safe binary attachment headers without changing the bytes', async () => {
    const bytes = Buffer.from([0, 255, 42]);
    const res = { setHeader: vi.fn() } as unknown as Response;
    const file = browserTransferDownload(
      bytes,
      '../résumé\r\n\u0000\u202e.html',
      'text/html\r\nInjected: bad',
      res,
    );
    expect(file.getHeaders()).toMatchObject({
      type: 'application/octet-stream',
      length: bytes.length,
    });
    expect(file.getHeaders().disposition).not.toMatch(/[\r\n]/);
    expect(file.getHeaders().disposition).not.toContain('%00');
    expect(file.getHeaders().disposition).toContain("filename*=UTF-8''");
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
});
