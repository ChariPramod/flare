import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { verifyDashboardForwarding } from '@flare/shared/dashboard-forwarding';

const { jar, values } = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    jar: {
      get: (name: string) => (values.has(name) ? { value: values.get(name)! } : undefined),
      set: vi.fn((name: string, value: string, _options: unknown) => {
        values.set(name, value);
      }),
      delete: vi.fn((name: string) => {
        values.delete(name);
      }),
    },
  };
});
vi.mock('next/headers', () => ({ cookies: async () => jar }));
import { GET as api } from '../app/api/[...path]/route';
import { POST as inbox } from '../app/novu/[...path]/route';

const secret = `fdp_${Buffer.alloc(32, 7).toString('base64')}`;
const origin = 'https://dashboard.example.test';
const org = 'b11f5962-a27a-49fa-87f5-37edce00d31e';
const environment = 'd901e134-b73a-4214-9546-b34ec4cb3937';
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_ENV', 'production');
  vi.stubEnv('FLARE_VERCEL_PREVIEW_BACKEND', '');
  vi.stubEnv('WEB_ORIGIN', origin);
  vi.stubEnv('FLARE_API_URL', 'https://api.example.test');
  vi.stubEnv('FLARE_DASHBOARD_PROXY_SECRET', secret);
  vi.stubEnv('FLARE_FORWARD_CLIENT_IP', 'true');
  vi.stubEnv('FLARE_BROWSER_TRANSFERS', '');
  values.clear();
  jar.set.mockClear();
  jar.delete.mockClear();
  values.set('flare_session', 'session-cookie');
  values.set('flare_org', org);
  values.set('flare_environment', environment);
  fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function request(
  path: string,
  method = 'GET',
  body?: string,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`${origin}/api/${path}`, {
    method,
    body,
    headers: {
      origin,
      'x-vercel-forwarded-for': '203.0.113.11',
      'x-forwarded-for': '198.51.100.1',
      'x-flare-client-ip': '198.51.100.2',
      'x-flare-proxy-client-ip': '198.51.100.3',
      ...headers,
    },
  });
}
const context = (path: string) => ({
  params: Promise.resolve({ path: path.split('?')[0]!.split('/') }),
});
function verified(index: number) {
  const [rawUrl, init] = fetcher.mock.calls[index]!;
  const url = new URL(String(rawUrl));
  const headers = init!.headers as Record<string, string>;
  expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
  expect(
    verifyDashboardForwarding(secret, {
      method: init!.method ?? 'GET',
      target: `${url.pathname}${url.search}`,
      body: init!.body as string | undefined,
      headers,
    }).clientIp,
  ).toBe('203.0.113.11');
  expect(headers['x-forwarded-for']).toBeUndefined();
  return { url, init: init!, headers };
}

it('signs ordinary proxy requests after cookie and idempotency context is finalized', async () => {
  const body = JSON.stringify({ subject: 'नमस्ते 🙂', text: 'Hello' });
  const response = await api(
    request('emails?tag=a%2Fb', 'POST', body, {
      'idempotency-key': 'logical-send',
      authorization: 'Bearer caller-spoof',
    }),
    context('emails'),
  );
  expect(response.status).toBe(200);
  const sent = verified(0);
  expect(sent.url.href).toBe('https://api.example.test/v1/emails?tag=a%2Fb');
  expect(sent.init.body).toBe(body);
  expect(sent.headers).toMatchObject({
    Authorization: 'Bearer session-cookie',
    'x-org-id': org,
    'x-environment-id': environment,
    'Idempotency-Key': 'logical-send',
  });
});
it('signs the final session-switch GET with the selected tenant, then writes secure context cookies', async () => {
  const nextOrg = 'a63d1ecd-ed0e-48c1-a0c4-fb3a509c6c79';
  const nextEnv = 'cd71bbf1-f2db-49bc-867c-38d2e4e7a0e8';
  const response = await api(
    request('session/switch', 'POST', JSON.stringify({ orgId: nextOrg, environmentId: nextEnv })),
    context('session/switch'),
  );
  expect(response.status).toBe(200);
  const sent = verified(0);
  expect(sent.url.pathname).toBe('/v1/auth/me');
  expect(sent.init.method).toBe('GET');
  expect(sent.init.body).toBeUndefined();
  expect(sent.headers).toMatchObject({ 'x-org-id': nextOrg, 'x-environment-id': nextEnv });
  expect(jar.set).toHaveBeenCalledWith(
    'flare_org',
    nextOrg,
    expect.objectContaining({ secure: true, httpOnly: true, sameSite: 'lax' }),
  );
});
it('signs an operator-only login probe with the newly issued session and does not expose it', async () => {
  values.clear();
  fetcher.mockResolvedValueOnce(Response.json({ token: 'operator-session', organizations: [] }));
  const response = await api(
    request(
      'auth/login',
      'POST',
      JSON.stringify({ email: 'operator@example.test', password: 'example-password' }),
    ),
    context('auth/login'),
  );
  expect(await response.json()).toEqual({ organizations: [], operator_only: true });
  verified(0);
  const probe = verified(1);
  expect(probe.url.pathname).toBe('/v1/operator/session');
  expect(probe.headers.Authorization).toBe('Bearer operator-session');
  expect(probe.headers['x-org-id']).toBeUndefined();
  expect(jar.set).toHaveBeenCalledWith(
    'flare_session',
    'operator-session',
    expect.objectContaining({ secure: true, httpOnly: true }),
  );
});
it('keeps ordinary login tokens in HttpOnly Secure cookies', async () => {
  values.clear();
  fetcher.mockResolvedValueOnce(
    Response.json({
      token: 'new-session',
      organizations: [{ id: org, environments: [{ id: environment }] }],
    }),
  );
  const response = await api(request('auth/login', 'POST', '{}'), context('auth/login'));
  expect(JSON.stringify(await response.json())).not.toContain('new-session');
  verified(0);
  expect(jar.set).toHaveBeenCalledWith(
    'flare_session',
    'new-session',
    expect.objectContaining({ secure: true, httpOnly: true }),
  );
});
it.each(['https://evil.example.test', 'null', ''])(
  'preserves exact mutation-origin rejection for %s before backend requests',
  async (mutationOrigin) => {
    const response = await api(
      request('auth/login', 'POST', '{}', { origin: mutationOrigin }),
      context('auth/login'),
    );
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it('fails closed for disabled previews and wrong-host GET requests even when cookies exist', async () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  const disabled = await api(request('session'), context('session'));
  expect(disabled.status).toBe(503);
  expect(await disabled.text()).toMatch(/configuration required/i);
  vi.stubEnv('VERCEL_ENV', 'production');
  const wrongHost = new NextRequest('https://other.example.test/api/session', {
    headers: { 'x-vercel-forwarded-for': '203.0.113.11' },
  });
  expect((await api(wrongHost, context('session'))).status).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  expect(jar.set).not.toHaveBeenCalled();
});
it('rejects UTF-8 payloads above the Vercel byte limit even when the character count is smaller', async () => {
  const body = JSON.stringify({ text: '🙂'.repeat(1024 * 1024) });
  expect(body.length).toBeLessThan(4 * 1024 * 1024);
  const response = await api(request('emails', 'POST', body), context('emails'));
  expect(response.status).toBe(413);
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves self-host Inbox bootstrap authorization and redirect rejection through the central helper', async () => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('NOVU_API_URL', 'http://novu-api:3000');
  fetcher.mockResolvedValueOnce(
    Response.json({ subscriberHash: 'expected-hash', applicationIdentifier: 'app-id' }),
  );
  const body = JSON.stringify({
    subscriber: { subscriberId: 'customer?x=1' },
    subscriberHash: 'expected-hash',
    applicationIdentifier: 'app-id',
  });
  const req = request('v1/inbox/session', 'POST', body, {
    cookie: `flare_session=session-cookie; flare_org=${org}; flare_environment=${environment}`,
  });
  const response = await inbox(req, context('v1/inbox/session'));
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(String(fetcher.mock.calls[0]![0])).toBe(
    'https://api.example.test/v1/subscribers/customer%3Fx%3D1/inbox-token',
  );
  expect(fetcher.mock.calls[0]![1]).toMatchObject({
    headers: {
      Authorization: 'Bearer session-cookie',
      'x-org-id': org,
      'x-environment-id': environment,
      'x-forwarded-for': '198.51.100.2',
    },
    redirect: 'error',
  });
  expect(fetcher.mock.calls[1]![1]!.redirect).toBe('error');
});

it.each(['session', 'emails'])(
  'retains valid cookies after a forwarding proof rejection on %s, but clears them for normal unauthorized responses',
  async (path) => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        { message: 'Invalid dashboard forwarding proof' },
        {
          status: 401,
          headers: { 'x-flare-proxy-error': 'invalid-proof' },
        },
      ),
    );
    const rejected = await api(request(path), context(path));
    expect(rejected.status).toBe(503);
    expect(rejected.headers.get('retry-after')).toBe('1');
    expect(await rejected.json()).toEqual({ message: 'Flare API is unavailable. Please retry.' });
    expect(values.get('flare_session')).toBe('session-cookie');
    expect(values.get('flare_org')).toBe(org);
    expect(values.get('flare_environment')).toBe(environment);
    expect(jar.delete).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(Response.json({ message: 'Session expired' }, { status: 401 }));
    expect((await api(request(path), context(path))).status).toBe(401);
    expect(values.size).toBe(0);
    expect(jar.delete).toHaveBeenCalledTimes(3);
  },
);
it.each(['auth/logout', 'operator/logout'])(
  'still clears cookies for explicit %s when the backend rejects forwarding proof',
  async (path) => {
    fetcher.mockResolvedValueOnce(
      Response.json(
        { message: 'Invalid dashboard forwarding proof' },
        {
          status: 401,
          headers: { 'x-flare-proxy-error': 'invalid-proof' },
        },
      ),
    );
    await api(request(path, 'POST', '{}'), context(path));
    expect(values.size).toBe(0);
    expect(jar.delete).toHaveBeenCalledTimes(3);
  },
);
it('retains cookies for forwarding outages and session-switch rejections, while revoked session membership still signs out', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json(
      { message: 'Forwarding verification unavailable' },
      {
        status: 503,
        headers: { 'x-flare-proxy-error': 'unavailable' },
      },
    ),
  );
  expect((await api(request('session'), context('session'))).status).toBe(503);
  expect(jar.delete).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(
    Response.json({ message: 'Unauthorized selection' }, { status: 401 }),
  );
  expect(
    (
      await api(
        request(
          'session/switch',
          'POST',
          JSON.stringify({ orgId: org, environmentId: environment }),
        ),
        context('session/switch'),
      )
    ).status,
  ).toBe(401);
  expect(jar.delete).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(Response.json({ message: 'Membership revoked' }, { status: 403 }));
  expect((await api(request('session'), context('session'))).status).toBe(401);
  expect(values.size).toBe(0);
});

it('returns retryable forwarding failures for session-switch and operator probes without changing cookies', async () => {
  const rejected = () =>
    Response.json(
      { message: 'Invalid dashboard forwarding proof' },
      { status: 401, headers: { 'x-flare-proxy-error': 'invalid-proof' } },
    );
  fetcher.mockResolvedValueOnce(rejected());
  const switching = await api(
    request('session/switch', 'POST', JSON.stringify({ orgId: org, environmentId: environment })),
    context('session/switch'),
  );
  expect(switching.status).toBe(503);
  expect(switching.headers.get('retry-after')).toBe('1');
  fetcher.mockResolvedValueOnce(Response.json({ token: 'operator-session', organizations: [] }));
  fetcher.mockResolvedValueOnce(rejected());
  const login = await api(request('auth/login', 'POST', '{}'), context('auth/login'));
  expect(login.status).toBe(503);
  expect(login.headers.get('retry-after')).toBe('1');
  expect(await login.json()).toEqual({ message: 'Flare API is unavailable. Please retry.' });
  expect(values.get('flare_session')).toBe('session-cookie');
  expect(jar.delete).not.toHaveBeenCalled();
  expect(jar.set).not.toHaveBeenCalled();
});

it('exposes deployed transfer mode only after signed live-session validation', async () => {
  const response = await api(
    request('browser-transfer-config'),
    context('browser-transfer-config'),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ enabled: true });
  expect(response.headers.get('cache-control')).toBe('no-store');
  const check = verified(0);
  expect(check.url.pathname).toBe('/v1/auth/me');
  expect(check.headers).toMatchObject({
    Authorization: 'Bearer session-cookie',
    'x-org-id': org,
    'x-environment-id': environment,
  });
});
it.each(['', 'true', 'false'])('keeps self-host transfers opt-in with flag %j', async (flag) => {
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('FLARE_BROWSER_TRANSFERS', flag);
  const response = await api(
    request('browser-transfer-config'),
    context('browser-transfer-config'),
  );
  expect(await response.json()).toEqual({ enabled: flag === 'true' });
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(['flare_session', 'flare_org', 'flare_environment'])(
  'does not disclose mode without %s',
  async (name) => {
    values.delete(name);
    const response = await api(
      request('browser-transfer-config'),
      context('browser-transfer-config'),
    );
    expect(response.status).toBe(name === 'flare_session' ? 401 : 403);
    expect(fetcher).not.toHaveBeenCalled();
  },
);
it('requires GET for transfer config and fails closed for revoked sessions without caching success', async () => {
  expect(
    (
      await api(
        request('browser-transfer-config', 'POST', '{}'),
        context('browser-transfer-config'),
      )
    ).status,
  ).toBe(405);
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockResolvedValueOnce(Response.json({ message: 'Membership revoked' }, { status: 403 }));
  const response = await api(
    request('browser-transfer-config'),
    context('browser-transfer-config'),
  );
  expect(response.status).toBe(401);
  expect(values.size).toBe(0);
});
it('preserves session cookies when transfer configuration cannot verify forwarding', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json(
      { message: 'Invalid forwarding proof' },
      { status: 401, headers: { 'x-flare-proxy-error': 'invalid-proof' } },
    ),
  );
  const response = await api(
    request('browser-transfer-config'),
    context('browser-transfer-config'),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get('retry-after')).toBe('1');
  expect(jar.delete).not.toHaveBeenCalled();
});
it('forwards only the validated grant-issuance Origin while leaving ordinary proxy headers unchanged', async () => {
  const body = JSON.stringify({ operation: 'email.detail', message_id: org });
  expect(
    (
      await api(
        request('browser-transfers', 'POST', body, { origin: 'https://wrong.example.test' }),
        context('browser-transfers'),
      )
    ).status,
  ).toBe(403);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (await api(request('browser-transfers', 'POST', body), context('browser-transfers'))).status,
  ).toBe(200);
  expect(verified(0).headers.Origin).toBe(origin);
  await api(request('emails'), context('emails'));
  expect(verified(1).headers.Origin).toBeUndefined();
});
