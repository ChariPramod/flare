import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
const api = () => process.env.FLARE_API_URL ?? 'http://localhost:4000';
const names = { token: 'flare_session', org: 'flare_org', env: 'flare_environment' };
type SessionResponse = {
  token: string;
  organizations: { id: string; environments: { id: string }[] }[];
};
const options = {
  httpOnly: true,
  secure: (process.env.WEB_ORIGIN ?? '').startsWith('https:'),
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 43200,
};
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some((p) => !p || p === '.' || p === '..' || p.includes('/') || p.includes('\\')))
    return NextResponse.json({ message: 'Invalid API path' }, { status: 400 });
  if (!['GET', 'HEAD'].includes(req.method)) {
    const origin = req.headers.get('origin');
    const expected = process.env.WEB_ORIGIN ?? req.nextUrl.origin;
    if (origin !== expected)
      return NextResponse.json(
        { message: 'Request origin does not match this dashboard' },
        { status: 403 },
      );
  }
  const jar = await cookies();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = jar.get(names.token)?.value;
  if (token) headers.Authorization = `Bearer ${token}`;
  const org = jar.get(names.org)?.value,
    env = jar.get(names.env)?.value;
  if (org) headers['x-org-id'] = org;
  if (env) headers['x-environment-id'] = env;
  const joined = path.join('/');
  const publicRoute = ['auth/config', 'auth/login', 'auth/exchange', 'auth/accept-invite'].includes(
    joined,
  );
  if (!publicRoute && !token)
    return NextResponse.json({ message: 'Sign in to continue' }, { status: 401 });
  let body: string | undefined;
  if (!['GET', 'HEAD'].includes(req.method)) {
    body = await req.text();
    if (body.length > 40 * 1024 * 1024)
      return NextResponse.json({ message: 'Request too large' }, { status: 413 });
  }
  try {
    if (joined === 'session/switch') {
      const selection = JSON.parse(body ?? '{}') as { orgId?: string; environmentId?: string };
      if (
        !/^[0-9a-f-]{36}$/i.test(selection.orgId ?? '') ||
        !/^[0-9a-f-]{36}$/i.test(selection.environmentId ?? '')
      )
        return NextResponse.json(
          { message: 'Select an organization and environment' },
          { status: 400 },
        );
      const response = await fetch(`${api()}/v1/auth/me`, {
        headers: {
          ...headers,
          'x-org-id': selection.orgId!,
          'x-environment-id': selection.environmentId!,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return new NextResponse(await response.text(), {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        });
      jar.set(names.org, selection.orgId!, options);
      jar.set(names.env, selection.environmentId!, options);
      return NextResponse.json(await response.json());
    }
    const endpoint = joined === 'session' ? 'auth/me' : joined;
    if (req.headers.get('idempotency-key'))
      headers['Idempotency-Key'] = req.headers.get('idempotency-key')!;
    const response = await fetch(`${api()}/v1/${endpoint}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    const text = await response.text();
    if (response.ok && ['auth/login', 'auth/exchange', 'auth/accept-invite'].includes(joined)) {
      const data = JSON.parse(text) as SessionResponse;
      const organization = data.organizations[0];
      const environment = organization?.environments[0];
      if (!organization || !environment)
        return NextResponse.json(
          { message: 'This account has no organization access' },
          { status: 403 },
        );
      jar.set(names.token, data.token, options);
      jar.set(names.org, organization.id, options);
      jar.set(names.env, environment.id, options);
      const { token: _token, ...safe } = data;
      return NextResponse.json(safe);
    }
    if (joined === 'auth/logout' || response.status === 401)
      for (const name of Object.values(names)) jar.delete(name);
    return new NextResponse(text || null, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-store',
        ...(response.headers.get('x-request-id')
          ? { 'x-request-id': response.headers.get('x-request-id')! }
          : {}),
      },
    });
  } catch {
    return NextResponse.json(
      { message: 'Flare API is unavailable. Check the API service and retry.' },
      { status: 503 },
    );
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
