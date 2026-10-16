import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { SignJWT } from 'jose';
import { expect, it, vi } from 'vitest';
const fixture = vi.hoisted(() => ({
  actorId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
  secret: 'operator-guard-local-test-only',
}));
vi.mock('./context.js', () => ({
  config: { JWT_SECRET: fixture.secret, FLARE_OPERATOR_USER_IDS: fixture.actorId },
  sql: vi.fn(async () => [
    { id: fixture.actorId, name: 'Operator', email: 'operator@example.test', recent: false },
  ]),
  redis: {},
}));
vi.mock('./rate-limit.js', () => ({ enforceLimit: vi.fn() }));
import { OperatorGuard } from './operator-auth.js';
import { enforceLimit } from './rate-limit.js';
it.each([
  '/v1/operator/step-up',
  '/V1/OPERATOR/STEP-UP',
  '/v1/operator/step-up/',
  '/V1/Operator/Step-Up/',
])('applies proof-specific throttling on every equivalent operator route: %s', async (path) => {
  vi.mocked(enforceLimit).mockClear();
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(fixture.actorId)
    .setJti(fixture.sessionId)
    .setIssuer('flare')
    .setAudience('flare-dashboard')
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(fixture.secret));
  const response = {},
    request = { path, method: 'POST', headers: { authorization: `Bearer ${token}` } };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
  expect(await new OperatorGuard(reflector).canActivate(context)).toBe(true);
  expect(enforceLimit).toHaveBeenCalledTimes(2);
  expect(enforceLimit).toHaveBeenNthCalledWith(
    2,
    response,
    `operator-proof:${fixture.actorId}`,
    1 / 6,
    5,
  );
});
