import { beforeEach, expect, it, vi } from 'vitest';
import type { NextFunction, Response as ExpressResponse } from 'express';
import { signDashboardForwarding } from '@flare/shared/dashboard-forwarding';
import { hashToken } from '@flare/shared';
import type { Principal } from '@flare/shared';
import type { AuthRequest } from './context.js';
import { createDashboardForwardingMiddleware } from './dashboard-forwarding.js';

vi.mock('./context.js', () => ({ sql: vi.fn(), redis: {} }));
vi.mock('./auth.js', () => ({ Access: () => () => undefined }));
vi.mock('./workflows.js', () => ({ subscriberInboxAccess: vi.fn() }));
import { createDashboardInboxGateway, dashboardInboxOperation } from './dashboard-inbox.js';

const secret = `fdp_${Buffer.alloc(32, 5).toString('base64')}`;
const principal: Principal = {
  kind: 'session',
  role: 'developer',
  production: false,
  sessionId: '3cef7c75-9476-431f-9e96-b855936a2c24',
  actorId: '57f04224-1576-45e5-a50c-8143640d32a4',
  orgId: '5814384d-b286-4586-a1ba-f3bc7106a11b',
  environmentId: '7e7d6d02-2105-4f13-831f-777f8b394a08',
};
const subscriber = {
  id: '651ee4a4-fdd9-4d90-8aff-3e006e9eaad9',
  applicationIdentifier: 'native-application',
};
const bootstrap = {
  applicationIdentifier: subscriber.applicationIdentifier,
  subscriberHash: 'a'.repeat(64),
  subscriber: { subscriberId: 'customer-1' },
};
const notificationId = '1234567890abcdef12345678';
const base = '/v1/dashboard/inbox/';
let now: number;
const jwt = (expiration = now / 1000 + 7200) =>
  `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ exp: expiration })).toString('base64url')}.fixture-signature`;
type Dependencies = Parameters<typeof createDashboardInboxGateway>[0];
let deps: Dependencies,
  gateway: ReturnType<typeof createDashboardInboxGateway>,
  values: Map<string, string>;
beforeEach(() => {
  now = 1_900_000_000_000;
  values = new Map();
  deps = {
    liveSession: vi.fn(async () => ({ remainingSeconds: 3600, role: 'developer' as const })),
    subscriber: vi.fn(async () => subscriber),
    credentials: vi.fn(async () => bootstrap),
    redis: {
      get: vi.fn(async (key) => values.get(key) ?? null),
      set: vi.fn(async (key, value) => {
        if (values.has(key)) return null;
        values.set(key, value);
        return 'OK';
      }),
    },
    fetch: vi.fn(async () =>
      Response.json({ data: { token: jwt(), unreadCount: { total: 1 } } }, { status: 201 }),
    ),
    nativeOrigin: () => 'http://novu-api:3000',
    now: () => now,
  };
  gateway = createDashboardInboxGateway(deps);
});
async function request(
  route: string,
  method = 'GET',
  body?: unknown,
  token?: string,
  identity = principal,
) {
  const target = `${base}${route}`;
  const rawBody = body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const headers = {
    authorization: 'Bearer flare-session',
    'x-org-id': identity.orgId,
    'x-environment-id': identity.environmentId,
    'content-type': 'application/json',
    'content-length': String(rawBody.length),
    ...(token ? { 'x-flare-inbox-authorization': `Bearer ${token}` } : {}),
  };
  Object.assign(
    headers,
    signDashboardForwarding(secret, { method, target, body: rawBody, headers }, '192.0.2.1', {
      now,
    }),
  );
  const req = {
    method,
    originalUrl: target,
    headers,
    rawHeaders: Object.entries(headers).flat(),
    rawBody,
    body,
    principal: identity,
  } as unknown as AuthRequest;
  const next = vi.fn();
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as ExpressResponse;
  await createDashboardForwardingMiddleware({
    secret,
    redis: { set: async () => 'OK' },
    now: () => now,
  })(req, res, next as NextFunction);
  expect(next).toHaveBeenCalledOnce();
  return req;
}
async function initialize() {
  await gateway(await request('session', 'POST', bootstrap));
  return jwt();
}
function resetFetch() {
  vi.mocked(deps.fetch).mockClear();
  vi.mocked(deps.fetch).mockResolvedValue(Response.json({ data: [] }));
}

it('binds an authorized native session by token hash and preserves the SDK response envelope', async () => {
  const result = await gateway(await request('session', 'POST', bootstrap));
  expect(result).toMatchObject({ status: 201, body: { data: { token: jwt() } } });
  expect(deps.credentials).toHaveBeenCalledWith(principal, 'customer-1');
  const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!;
  expect(url).toBe('http://novu-api:3000/v1/inbox/session');
  expect(init).toMatchObject({
    method: 'POST',
    redirect: 'error',
    body: JSON.stringify(bootstrap),
  });
  expect(init!.headers).not.toHaveProperty('Authorization');
  const [key, value, mode, ttl] = vi.mocked(deps.redis.set).mock.calls[0]!;
  expect(key).toBe(`dashboard-inbox:v1:${principal.sessionId}:${hashToken(jwt())}`);
  expect(value).not.toContain(jwt());
  expect(value).not.toContain(bootstrap.subscriberHash);
  expect(JSON.parse(value)).toMatchObject({
    sessionId: principal.sessionId,
    actorId: principal.actorId,
    orgId: principal.orgId,
    environmentId: principal.environmentId,
  });
  expect(JSON.parse(value)).toMatchObject({
    subscriberId: 'customer-1',
    subscriberRecordId: subscriber.id,
  });
  expect([mode, ttl]).toEqual(['EX', 3600]);
});
it.each(['America/Los_Angeles', 'UTC', '+05:30'])(
  'accepts the pinned SDK timezone %s without allowing viewer profile changes',
  async (timezone) => {
    vi.mocked(deps.liveSession).mockResolvedValue({ remainingSeconds: 3600, role: 'viewer' });
    const input = { ...bootstrap, subscriber: { ...bootstrap.subscriber, timezone } };
    const result = await gateway(await request('session', 'POST', input));
    expect(result.status).toBe(201);
    expect(deps.credentials).toHaveBeenCalledWith(principal, 'customer-1');
    expect(JSON.parse(vi.mocked(deps.fetch).mock.calls[0]![1]!.body as string)).toEqual(bootstrap);
    expect(input.subscriber.timezone).toBe(timezone);
    expect([...values.values()][0]).not.toContain(timezone);
  },
);
it.each([null, 1, {}, '', 'x'.repeat(129)])(
  'rejects invalid or unbounded SDK timezone metadata %j before native bootstrap',
  async (timezone) => {
    await expect(
      gateway(
        await request('session', 'POST', {
          ...bootstrap,
          subscriber: { ...bootstrap.subscriber, timezone },
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(deps.fetch).not.toHaveBeenCalled();
    expect(deps.redis.set).not.toHaveBeenCalled();
  },
);
it('rechecks session and subscriber authority for every request and forwards only the native bearer', async () => {
  const token = await initialize();
  resetFetch();
  const result = await gateway(
    await request('notifications?limit=10&read=false', 'GET', undefined, token),
  );
  expect(result).toEqual({ status: 200, body: { data: [] } });
  expect(deps.liveSession).toHaveBeenCalledTimes(2);
  expect(deps.subscriber).toHaveBeenCalledTimes(2);
  const [url, init] = vi.mocked(deps.fetch).mock.calls[0]!;
  expect(url).toBe('http://novu-api:3000/v1/inbox/notifications?limit=10&read=false');
  expect(init!.headers).toEqual({
    'Content-Type': 'application/json',
    'Novu-API-Version': '2024-06-26',
    Authorization: `Bearer ${token}`,
  });
});
it('rejects unsigned calls and API keys even when they carry plausible native or tenant credentials', async () => {
  const req = await request('session', 'POST', bootstrap);
  await expect(gateway({ ...req } as AuthRequest)).rejects.toMatchObject({ status: 403 });
  await expect(
    gateway(
      await request('session', 'POST', bootstrap, undefined, { ...principal, kind: 'api_key' }),
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('rejects expired or revoked sessions and removed memberships before contacting native Inbox', async () => {
  const token = await initialize();
  resetFetch();
  vi.mocked(deps.liveSession).mockResolvedValue(undefined);
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 401 });
  vi.mocked(deps.liveSession).mockResolvedValue({ remainingSeconds: 0, role: 'developer' });
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 401 });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('applies current role changes to native mutations while retaining viewer read access', async () => {
  const token = await initialize();
  resetFetch();
  vi.mocked(deps.liveSession).mockResolvedValue({ remainingSeconds: 3600, role: 'viewer' });
  for (const [route, method, body] of [
    [`notifications/${notificationId}/read`, 'PATCH', undefined],
    ['notifications/seen', 'POST', { notificationIds: [notificationId] }],
    [
      'preferences',
      'PATCH',
      {
        schedule: {
          isEnabled: true,
          weeklySchedule: {
            monday: { isEnabled: true, hours: [{ start: '09:00 AM', end: '05:00 PM' }] },
          },
        },
      },
    ],
  ] as const)
    await expect(gateway(await request(route, method, body, token))).rejects.toMatchObject({
      status: 403,
    });
  expect(deps.fetch).not.toHaveBeenCalled();
  expect((await gateway(await request('notifications', 'GET', undefined, token))).status).toBe(200);
});
it('rejects cross-session, user, organization and environment token substitution', async () => {
  const token = await initialize();
  resetFetch();
  for (const property of ['sessionId', 'actorId', 'orgId', 'environmentId'] as const) {
    const identity = { ...principal, [property]: 'ba01db78-bffb-4624-b24d-1bdbbd111fb6' };
    await expect(
      gateway(await request('notifications', 'GET', undefined, token, identity)),
    ).rejects.toMatchObject({ status: 401 });
  }
  await expect(
    gateway(await request('notifications', 'GET', undefined, jwt(now / 1000 + 99))),
  ).rejects.toMatchObject({ status: 401 });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('rejects subscriber deletion, recreation and remapped native application access', async () => {
  const token = await initialize();
  resetFetch();
  for (const row of [
    undefined,
    { ...subscriber, id: '4f564849-38ca-42e4-9939-21fdf5c764fc' },
    { ...subscriber, applicationIdentifier: 'changed-application' },
  ]) {
    vi.mocked(deps.subscriber).mockResolvedValue(row);
    await expect(
      gateway(await request('notifications', 'GET', undefined, token)),
    ).rejects.toMatchObject({ status: 403 });
  }
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('rejects a native application change during bootstrap credential validation', async () => {
  vi.mocked(deps.subscriber).mockResolvedValue({ ...subscriber, applicationIdentifier: 'changed' });
  await expect(gateway(await request('session', 'POST', bootstrap))).rejects.toMatchObject({
    status: 403,
  });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('caps binding expiry by remaining session time, native expiry and time spent awaiting the provider', async () => {
  vi.mocked(deps.liveSession).mockResolvedValue({ remainingSeconds: 30, role: 'developer' });
  const token = jwt(now / 1000 + 60);
  vi.mocked(deps.fetch).mockImplementation(async () => {
    now += 10_000;
    return Response.json({ data: { token } }, { status: 201 });
  });
  await gateway(await request('session', 'POST', bootstrap));
  expect(vi.mocked(deps.redis.set).mock.calls[0]![3]).toBe(20);
  now += 20_000;
  resetFetch();
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 401 });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('caps bindings at native expiry or twelve hours and rejects native tokens without expiry', async () => {
  vi.mocked(deps.liveSession).mockResolvedValue({ remainingSeconds: 86400, role: 'developer' });
  for (const [duration, ttl] of [
    [30, 30],
    [86400, 43200],
  ]) {
    values.clear();
    vi.mocked(deps.redis.set).mockClear();
    vi.mocked(deps.fetch).mockResolvedValue(
      Response.json({ data: { token: jwt(now / 1000 + duration!) } }, { status: 201 }),
    );
    await gateway(await request('session', 'POST', bootstrap));
    expect(vi.mocked(deps.redis.set).mock.calls[0]![3]).toBe(ttl);
  }
  vi.mocked(deps.fetch).mockResolvedValue(
    Response.json({ data: { token: 'e30.e30.signature' } }, { status: 201 }),
  );
  await expect(gateway(await request('session', 'POST', bootstrap))).rejects.toMatchObject({
    status: 502,
  });
});
it('never overwrites a native token binding with another subscriber', async () => {
  await initialize();
  vi.mocked(deps.subscriber).mockResolvedValue({
    ...subscriber,
    id: 'b19c8022-22b8-4c0b-b70d-252c9407edf0',
  });
  await expect(
    gateway(
      await request('session', 'POST', {
        ...bootstrap,
        subscriber: { subscriberId: 'customer-2' },
      }),
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(JSON.parse([...values.values()][0]!)).toMatchObject({ subscriberId: 'customer-1' });
});
it('fails closed on Redis read/write outages and unexpected storage results', async () => {
  const token = await initialize();
  resetFetch();
  vi.mocked(deps.redis.get).mockRejectedValue(new Error('private redis endpoint'));
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 503, message: 'Inbox session store unavailable' });
  expect(deps.fetch).not.toHaveBeenCalled();
  vi.mocked(deps.fetch).mockImplementation(async () =>
    Response.json({ data: { token: jwt() } }, { status: 201 }),
  );
  vi.mocked(deps.redis.set)
    .mockRejectedValueOnce(new Error('private credential'))
    .mockResolvedValueOnce(false);
  for (let i = 0; i < 2; i++)
    await expect(gateway(await request('session', 'POST', bootstrap))).rejects.toMatchObject({
      status: 503,
    });
});
it('validates bootstrap credentials and rejects caller-controlled subscriber profile or context', async () => {
  for (const input of [
    { ...bootstrap, applicationIdentifier: 'other' },
    { ...bootstrap, subscriberHash: 'b'.repeat(64) },
  ])
    await expect(gateway(await request('session', 'POST', input))).rejects.toMatchObject({
      status: 403,
    });
  for (const input of [
    { ...bootstrap, context: { tenant: 'other' } },
    { ...bootstrap, subscriber: { subscriberId: 'customer-1', email: 'changed@example.test' } },
    {
      ...bootstrap,
      subscriber: { subscriberId: 'customer-1', timezone: 'UTC', email: 'changed@example.test' },
    },
  ])
    await expect(gateway(await request('session', 'POST', input))).rejects.toMatchObject({
      status: 400,
    });
  expect(deps.fetch).not.toHaveBeenCalled();
});
it('rejects unsafe native configuration and returns fixed provider errors without response details', async () => {
  const token = await initialize();
  resetFetch();
  deps.nativeOrigin = () => 'http://novu-api:3000/admin';
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 503 });
  expect(deps.fetch).not.toHaveBeenCalled();
  deps.nativeOrigin = () => 'http://novu-api:3000';
  vi.mocked(deps.fetch).mockResolvedValue(
    Response.json({ secret: 'never disclose' }, { status: 500 }),
  );
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 502, message: 'Inbox request could not be completed' });
});
it('bounds incoming and streamed native responses', async () => {
  const oversized = { ...bootstrap, subscriberHash: 'a'.repeat(65536) };
  await expect(gateway(await request('session', 'POST', oversized))).rejects.toMatchObject({
    status: 413,
  });
  const token = await initialize();
  vi.mocked(deps.fetch).mockResolvedValue(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
  await expect(
    gateway(await request('notifications', 'GET', undefined, token)),
  ).rejects.toMatchObject({ status: 502 });
});

it.each([
  ['GET', 'session', undefined],
  ['POST', 'notifications', {}],
  ['GET', '../admin', undefined],
  ['GET', '%2e%2e/admin', undefined],
  ['GET', 'notifications/../../users', undefined],
  ['GET', 'topics/customer/subscriptions', undefined],
  ['POST', 'events', {}],
  ['POST', 'chat/oauth', {}],
  ['PATCH', `notifications/${notificationId}/read`, { subscriberId: 'other' }],
  ['GET', 'notifications?subscriberId=other', undefined],
  ['GET', 'notifications?limit=101', undefined],
  ['GET', 'notifications?limit=10&limit=20', undefined],
  ['GET', 'notifications?read[$ne]=true', undefined],
  ['GET', 'notifications?data=%7B%22%24where%22%3A%22secret%22%7D', undefined],
  ['GET', 'notifications/count?filters=%5B%7B%22subscriberId%22%3A%22other%22%7D%5D', undefined],
  ['PATCH', 'preferences/global', {}],
  ['PATCH', 'preferences', { email: true, subscriberId: 'other' }],
  ['PATCH', `notifications/${notificationId}/read?redirect=https://evil.test`, {}],
])('rejects unsupported native path/query/body %s %s', (method, route, body) => {
  expect(() => dashboardInboxOperation(method as string, `${base}${route}`, body)).toThrow();
});
it('accepts pinned default Inbox list/count, seen, action and preference request shapes', () => {
  for (const [method, route, body] of [
    ['GET', 'notifications?limit=10&archived=false&snoozed=false&data=%7B%7D', undefined],
    ['GET', 'notifications?limit=10&tags%5B0%5D%5B%5D=billing&severity%5B%5D=high', undefined],
    [
      'GET',
      `notifications/count?filters=${encodeURIComponent(JSON.stringify([{ read: false, tags: ['billing'] }]))}`,
      undefined,
    ],
    [
      'GET',
      `notifications/count?filters=${encodeURIComponent(JSON.stringify(['high', 'medium', 'low', 'none'].map((severity) => ({ read: false, archived: false, snoozed: false, severity }))))}`,
      undefined,
    ],
    ['GET', 'preferences', undefined],
    ['GET', 'preferences/global', undefined],
    ['POST', 'notifications/seen', { notificationIds: [notificationId] }],
    ['POST', 'notifications/read', { tags: [], data: '{}' }],
    ['PATCH', `notifications/${notificationId}/complete`, { actionType: 'primary' }],
    ['PATCH', 'preferences', { in_app: true, email: false }],
    ['PATCH', `preferences/${notificationId}`, { in_app: true, email: false }],
    ['PATCH', 'preferences/bulk', { preferences: [{ workflowId: 'receipt', email: true }] }],
    [
      'PATCH',
      'preferences',
      {
        schedule: {
          isEnabled: true,
          weeklySchedule: {
            monday: { isEnabled: true, hours: [{ start: '09:00', end: '17:00' }] },
          },
        },
      },
    ],
  ])
    expect(dashboardInboxOperation(method as string, `${base}${route}`, body).target).toMatch(
      /^\/v1\/inbox\//,
    );
});
it('accepts the pinned preferences UI twelve-hour schedule without rewriting its values', () => {
  const body = {
    schedule: {
      isEnabled: true,
      weeklySchedule: {
        monday: { isEnabled: true, hours: [{ start: '09:00 AM', end: '05:00 PM' }] },
        sunday: { isEnabled: false, hours: [{ start: '12:00 AM', end: '12:00 PM' }] },
      },
    },
  };
  expect(dashboardInboxOperation('PATCH', `${base}preferences`, body).body).toEqual(body);
});
it.each(['00:00 AM', '13:00 PM', '12:60 AM', '09:00 AM trailing', '24:00'])(
  'rejects invalid preference schedule time %s',
  (start) => {
    expect(() =>
      dashboardInboxOperation('PATCH', `${base}preferences`, {
        schedule: {
          isEnabled: true,
          weeklySchedule: { monday: { isEnabled: true, hours: [{ start, end: '05:00 PM' }] } },
        },
      }),
    ).toThrow();
  },
);
