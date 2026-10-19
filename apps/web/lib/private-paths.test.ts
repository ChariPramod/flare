import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isPrivateDashboardPath } from './private-paths';

const { cookieRead, redirect, notFound } = vi.hoisted(() => ({
  cookieRead: vi.fn(async () => ({ get: () => undefined })),
  redirect: vi.fn((_: string): never => {
    throw new Error('login redirect');
  }),
  notFound: vi.fn((): never => {
    throw new Error('not found');
  }),
}));
vi.mock('next/headers', () => ({ cookies: cookieRead }));
vi.mock('next/navigation', () => ({ redirect, notFound }));
vi.mock('../components/dashboard', () => ({ Dashboard: () => null }));
import Page from '../app/[section]/[[...id]]/page';
import { GET, POST, OPTIONS } from '../app/api/[...path]/route';

beforeEach(() => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('FLARE_API_URL', '');
  vi.stubEnv('FLARE_DASHBOARD_PROXY_SECRET', '');
  vi.stubGlobal('fetch', vi.fn());
  vi.clearAllMocks();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each([
  'health',
  'health-check',
  'ready',
  'internal',
  'internal/metrics',
  'v1/internal',
  'v1/internal/events',
  'HEALTH',
  'V1/Internal',
])('returns a page404 before cookie access or login redirect for /%s', async (path) => {
  const [section, ...id] = path.split('/');
  await expect(Page({ params: Promise.resolve({ section: section!, id }) })).rejects.toThrow(
    'not found',
  );
  expect(notFound).toHaveBeenCalledOnce();
  expect(cookieRead).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(['internal', 'internal/metrics', 'health', 'ready', 'Internal/events'])(
  'returns API404 before missing configuration or credentials for /api/%s',
  async (path) => {
    const context = { params: Promise.resolve({ path: path.split('/') }) };
    for (const handler of [GET, POST, OPTIONS]) {
      const response = await handler(
        new NextRequest(`https://dashboard.test/api/${path}`),
        context,
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ message: 'Not found' });
    }
    expect(cookieRead).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  },
);
it('keeps real metrics and ordinary application routes under their existing authentication behavior', async () => {
  for (const path of [
    'metrics',
    'api/metrics',
    'overview',
    'workflows/internal',
    'subscribers/health',
    'internal-tools',
  ])
    expect(isPrivateDashboardPath(path.split('/'))).toBe(false);
  await expect(Page({ params: Promise.resolve({ section: 'metrics' }) })).rejects.toThrow(
    'login redirect',
  );
  expect(notFound).not.toHaveBeenCalled();
  expect(redirect).toHaveBeenCalledWith('/login');
  const response = await OPTIONS(new NextRequest('https://dashboard.test/api/metrics'), {
    params: Promise.resolve({ path: ['metrics'] }),
  });
  expect(response.status).toBe(204);
  expect(response.headers.get('allow')).toBe('DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT');
});
