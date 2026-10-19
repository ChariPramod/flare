import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { hashToken } from '@flare/shared';
import { signDashboardForwarding } from '@flare/shared/dashboard-forwarding';
import {
  createDashboardForwardingMiddleware,
  verifiedDashboardClientAddress,
} from './dashboard-forwarding.js';

vi.mock('./context.js', () => ({ config: { JWT_SECRET: 'fixture-only' }, sql: {}, redis: {} }));
vi.mock('./rate-limit.js', () => ({ enforceLimit: vi.fn() }));
import { AuthGuard } from './auth.js';
import { enforceLimit } from './rate-limit.js';

const secret = `fdp_${Buffer.alloc(32, 9).toString('base64')}`;
const now = 1_800_000_000_000;
const ip = '192.0.2.12';
type TestRequest = Request & { rawBody?: Buffer };
function request() {
  const body = Buffer.from('{ "password": "fixture", "email": "user@example.test" }');
  const headers = {
    'content-type': 'application/json',
    'content-length': String(body.length),
    ...signDashboardForwarding(
      secret,
      {
        method: 'POST',
        target: '/v1/auth/login',
        headers: { 'content-type': 'application/json' },
        body,
      },
      ip,
      { now },
    ),
  };
  return {
    method: 'POST',
    path: '/v1/auth/login',
    originalUrl: '/v1/auth/login',
    ip: '127.0.0.1',
    headers,
    rawHeaders: Object.entries(headers).flat(),
    rawBody: body,
  } as TestRequest;
}
function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    setHeader: vi.fn(),
  } as unknown as Response;
}
function replayStore(result: unknown = 'OK') {
  return { set: vi.fn().mockResolvedValue(result) };
}
async function invoke(req = request(), store = replayStore(), key: string | undefined = secret) {
  const res = response();
  const next = vi.fn() as unknown as NextFunction;
  await createDashboardForwardingMiddleware({ secret: key, redis: store, now: () => now })(
    req,
    res,
    next,
  );
  return { req, res, next, store };
}

describe('dashboard forwarding middleware', () => {
  it('reserves the nonce before exposing an address without changing authentication or req.ip', async () => {
    const req = request();
    const store = replayStore();
    store.set.mockImplementationOnce(async () => {
      expect(verifiedDashboardClientAddress(req)).toBeUndefined();
      return 'OK';
    });
    const result = await invoke(req, store);
    expect(result.next).toHaveBeenCalledExactlyOnceWith();
    expect(store.set).toHaveBeenCalledExactlyOnceWith(
      `dashboard-proxy:nonce:v1:${req.headers['x-flare-proxy-nonce']}`,
      '1',
      'EX',
      61,
      'NX',
    );
    expect(verifiedDashboardClientAddress(req)).toBe(ip);
    expect(req.ip).toBe('127.0.0.1');
    expect(req).not.toHaveProperty('principal');
  });

  it('only uses a verified address for the public-auth rate limiter', async () => {
    vi.mocked(enforceLimit).mockClear();
    const { req, res } = await invoke();
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    expect(
      await new AuthGuard({ getAllAndOverride: () => true } as unknown as Reflector).canActivate(
        context,
      ),
    ).toBe(true);
    expect(enforceLimit).toHaveBeenCalledExactlyOnceWith(
      res,
      `auth:${hashToken(ip)}`,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it('does not substitute forwarding proof for a bearer token on protected routes', async () => {
    const { req, res } = await invoke();
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    await expect(
      new AuthGuard({ getAllAndOverride: () => false } as unknown as Reflector).canActivate(
        context,
      ),
    ).rejects.toThrow('Bearer authentication required');
  });

  it('preserves unsigned clients and ignores spoofed arbitrary IP headers/properties', async () => {
    const req = {
      ...request(),
      headers: { 'x-forwarded-for': ip, 'x-flare-client-ip': ip },
      verifiedDashboardClientIp: ip,
    } as unknown as TestRequest;
    const { next, store, res } = await invoke(req);
    expect(next).toHaveBeenCalledOnce();
    expect(store.set).not.toHaveBeenCalled();
    expect(verifiedDashboardClientAddress(req)).toBeUndefined();
    vi.mocked(enforceLimit).mockClear();
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext;
    await new AuthGuard({ getAllAndOverride: () => true } as unknown as Reflector).canActivate(
      context,
    );
    expect(enforceLimit).toHaveBeenCalledWith(
      res,
      `auth:${hashToken('127.0.0.1')}`,
      expect.any(Number),
      expect.any(Number),
    );
  });

  it.each([null, undefined, false])(
    'fails closed when Redis nonce reservation returns %s',
    async (value) => {
      const store = replayStore();
      store.set.mockResolvedValue(value);
      const { req, res, next } = await invoke(request(), store);
      expect(res.status).toHaveBeenCalledWith(value === null ? 401 : 503);
      expect(res.setHeader).toHaveBeenCalledWith(
        'x-flare-proxy-error',
        value === null ? 'invalid-proof' : 'unavailable',
      );
      expect(next).not.toHaveBeenCalled();
      expect(verifiedDashboardClientAddress(req)).toBeUndefined();
    },
  );

  it('returns a retryable error when the nonce store is unavailable without logging its error', async () => {
    const store = replayStore();
    store.set.mockRejectedValue(new Error('redis://credential-fixture'));
    const { req, res, next } = await invoke(request(), store);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain('credential-fixture');
    expect(next).not.toHaveBeenCalled();
    expect(verifiedDashboardClientAddress(req)).toBeUndefined();
  });

  it.each([undefined, ''])(
    'requires a configured key for reserved headers when optional config is %s',
    async (secret) => {
      const req = request(),
        res = response(),
        next = vi.fn();
      await createDashboardForwardingMiddleware({ secret, redis: replayStore() })(req, res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
      const unsigned = request();
      unsigned.headers = {};
      await createDashboardForwardingMiddleware({ secret, redis: replayStore() })(
        unsigned,
        res,
        next,
      );
      expect(next).toHaveBeenCalledOnce();
    },
  );

  it('rejects malformed nonempty startup configuration', () => {
    expect(() =>
      createDashboardForwardingMiddleware({ secret: 'fdp_bad', redis: replayStore() }),
    ).toThrow();
  });

  it.each(['x-flare-proxy-future', 'x-flare-inbox-authorization'])(
    'requires a complete proof for %s',
    async (name) => {
      const req = request();
      req.headers = { [name]: 'present' };
      req.rawHeaders = [name, 'present'];
      const { next, res, store } = await invoke(req);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(store.set).not.toHaveBeenCalled();
    },
  );

  it.each(['content-length', 'transfer-encoding', 'content-encoding', 'authorization'])(
    'rejects duplicate raw %s headers',
    async (name) => {
      const req = request();
      req.rawHeaders.push(name, 'first', name.toUpperCase(), 'second');
      const { res, store } = await invoke(req);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(store.set).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported parsing, decoded compression, mismatched lengths and altered original bytes', async () => {
    for (const change of [
      (req: TestRequest) => {
        delete req.rawBody;
      },
      (req: TestRequest) => {
        req.headers['content-encoding'] = 'gzip';
      },
      (req: TestRequest) => {
        req.headers['content-length'] = '0';
      },
      (req: TestRequest) => {
        req.headers['content-length'] = '01';
      },
      (req: TestRequest) => {
        req.headers['transfer-encoding'] = 'chunked';
      },
      (req: TestRequest) => {
        req.rawBody = Buffer.from(req.rawBody!.toString().replace('fixture', 'changed'));
      },
    ]) {
      const req = request();
      change(req);
      const { res, next, store } = await invoke(req);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(store.set).not.toHaveBeenCalled();
    }
  });

  it('covers the inclusive future-skew validity window in its atomic nonce expiry', async () => {
    const req = request();
    req.headers = {
      'content-type': 'application/json',
      ...signDashboardForwarding(
        secret,
        {
          method: req.method,
          target: req.originalUrl,
          headers: { 'content-type': 'application/json' },
          body: req.rawBody,
        },
        ip,
        { now: now + 60_000 },
      ),
    };
    req.rawHeaders = Object.entries(req.headers).flat() as string[];
    const { store, next } = await invoke(req);
    expect(next).toHaveBeenCalledOnce();
    expect(store.set).toHaveBeenCalledWith(expect.any(String), '1', 'EX', 121, 'NX');
  });
});
