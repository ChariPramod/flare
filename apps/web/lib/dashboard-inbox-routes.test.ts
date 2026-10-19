import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyDashboardForwarding } from '@flare/shared/dashboard-forwarding';
import { GET, POST, PATCH } from '../app/novu/[...path]/route';

const origin = 'https://dashboard.example.test';
const secret = `fdp_${Buffer.alloc(32, 6).toString('base64')}`;
const org = '46717918-b753-44eb-8bad-4dd2b4ed9819';
const environment = '63c4cac7-91aa-4c92-bfce-6e535ca5d943';
const cookie = `flare_session=flare-cookie; flare_org=${org}; flare_environment=${environment}`;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('FLARE_VERCEL_PREVIEW_BACKEND', '');
  vi.stubEnv('WEB_ORIGIN', origin);
  vi.stubEnv('FLARE_API_URL', 'https://api.example.test');
  vi.stubEnv('FLARE_DASHBOARD_PROXY_SECRET', secret);
  vi.stubEnv('NOVU_API_URL', 'http://must-not-contact-private-novu:3000');
  fetcher = vi.fn<typeof fetch>(async () => Response.json({ data: [] }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const context = (path: string) => ({
  params: Promise.resolve({ path: path.split('?')[0]!.split('/') }),
});
function request(
  path = 'v1/inbox/notifications?limit=10',
  method = 'GET',
  body?: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${origin}/novu/${path}`, {
    method,
    body,
    headers: {
      origin,
      cookie,
      authorization: 'Bearer native-session',
      'x-vercel-forwarded-for': '192.0.2.15',
      'x-flare-inbox-authorization': 'Bearer spoofed-native',
      'x-org-id': 'spoofed-org',
      ...headers,
    },
  });
}
it('forwards native Inbox only through the signed Flare gateway with cookie-bound context', async () => {
  const path = 'v1/inbox/notifications?limit=10';
  const response = await GET(request(path), context(path));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [] });
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toEqual(
    new URL('https://api.example.test/v1/dashboard/inbox/notifications?limit=10'),
  );
  const headers = init!.headers as Record<string, string>;
  expect(headers).toMatchObject({
    Authorization: 'Bearer flare-cookie',
    'x-org-id': org,
    'x-environment-id': environment,
    'x-flare-inbox-authorization': 'Bearer native-session',
  });
  expect(
    verifyDashboardForwarding(secret, {
      method: 'GET',
      target: '/v1/dashboard/inbox/notifications?limit=10',
      headers,
    }).clientIp,
  ).toBe('192.0.2.15');
  expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
  expect(fetcher).toHaveBeenCalledOnce();
});
it('preserves bootstrap status and SDK envelope without supplying native or administrator credentials', async () => {
  const body = JSON.stringify({
    applicationIdentifier: 'native-app',
    subscriberHash: 'a'.repeat(64),
    subscriber: { subscriberId: 'customer-1' },
  });
  fetcher.mockResolvedValueOnce(
    Response.json({ data: { token: 'native-token', unreadCount: { total: 1 } } }, { status: 201 }),
  );
  const response = await POST(
    request('v1/inbox/session', 'POST', body, { authorization: '' }),
    context('v1/inbox/session'),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toMatchObject({ data: { token: 'native-token' } });
  const [, init] = fetcher.mock.calls[0]!;
  expect(init!.body).toBe(body);
  expect(init!.headers).not.toHaveProperty('x-flare-inbox-authorization');
  expect(JSON.stringify(init!.headers)).not.toContain('ApiKey');
});
it.each(['https://other.example.test', 'null', ''])(
  'rejects mutation origin %s before forwarding',
  async (invalid) => {
    const path = 'v1/inbox/notifications/1234567890abcdef12345678/read';
    expect(
      (await PATCH(request(path, 'PATCH', undefined, { origin: invalid }), context(path))).status,
    ).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each(['', 'flare_session=session', `flare_session=session; flare_org=${org}`])(
  'requires all live-session cookie context before forwarding (%s)',
  async (cookies) => {
    expect(
      (
        await GET(
          request(undefined, 'GET', undefined, { cookie: cookies }),
          context('v1/inbox/notifications'),
        )
      ).status,
    ).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it.each(['v1/admin/users', 'v1/inbox/../users', 'v1/inbox/a/b/..', 'v1/inbox/a%2fb'])(
  'rejects path escape %s',
  async (path) => {
    const parts = path.split('/').map(decodeURIComponent);
    const response = await GET(request(), { params: Promise.resolve({ path: parts }) });
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it('bounds deployed request bytes before forwarding', async () => {
  const body = JSON.stringify({ data: '🙂'.repeat(16384) });
  expect(body.length).toBeLessThan(65536);
  expect(
    (await POST(request('v1/inbox/session', 'POST', body), context('v1/inbox/session'))).status,
  ).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves gateway authorization failures without deleting the unrelated Flare session cookie', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ message: 'Inbox session is not bound to this dashboard' }, { status: 401 }),
  );
  const response = await GET(request(), context('v1/inbox/notifications'));
  expect(response.status).toBe(401);
  expect(response.headers.get('set-cookie')).toBeNull();
});
it('fails closed for previews and missing configuration without contacting localhost or Novu', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  expect((await GET(request(), context('v1/inbox/notifications'))).status).toBe(503);
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('FLARE_DASHBOARD_PROXY_SECRET', '');
  expect((await GET(request(), context('v1/inbox/notifications'))).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it('returns a bounded fixed unavailable response on transport failures', async () => {
  fetcher.mockRejectedValueOnce(new Error('private secret unavailable'));
  const response = await GET(request(), context('v1/inbox/notifications'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('private secret');
});
