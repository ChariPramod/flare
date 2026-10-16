import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { expect, it, vi } from 'vitest';
vi.mock('./context.js', () => ({ config: { JWT_SECRET: 'fixture-only' }, sql: {}, redis: {} }));
vi.mock('./rate-limit.js', () => ({ enforceLimit: vi.fn() }));
import { AuthGuard } from './auth.js';
import { enforceLimit } from './rate-limit.js';
it.each(['/v1/auth/login', '/V1/AUTH/LOGIN', '/v1/AuTh/exchange', '/V1/auth/accept-invite'])(
  'rate limits public auth regardless of Express route casing: %s',
  async (path) => {
    vi.mocked(enforceLimit).mockClear();
    const response = {},
      req = { path, ip: '127.0.0.1', method: 'POST' };
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => response }),
    } as unknown as ExecutionContext;
    expect(await new AuthGuard(reflector).canActivate(context)).toBe(true);
    expect(enforceLimit).toHaveBeenCalledExactlyOnceWith(
      response,
      expect.stringMatching(/^auth:/),
      expect.any(Number),
      expect.any(Number),
    );
  },
);
it('propagates public-auth limiter failures instead of allowing the request', async () => {
  vi.mocked(enforceLimit).mockRejectedValueOnce(new Error('Limiter unavailable'));
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ path: '/V1/AUTH/LOGIN', ip: '127.0.0.1' }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
  await expect(
    new AuthGuard({ getAllAndOverride: () => true } as unknown as Reflector).canActivate(context),
  ).rejects.toThrow('Limiter unavailable');
});
