import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Only the public subscriber Inbox surface is proxied. Novu administration stays internal.
async function handler(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (
    path.length < 3 ||
    path[0] !== 'v1' ||
    path[1] !== 'inbox' ||
    path.some((part) => !part || /[\\/?.#]/.test(part))
  )
    return NextResponse.json({ message: 'Inbox route not found' }, { status: 404 });
  if (
    !['GET', 'HEAD'].includes(req.method) &&
    req.headers.get('origin') !== (process.env.WEB_ORIGIN ?? req.nextUrl.origin)
  )
    return NextResponse.json({ message: 'Invalid origin' }, { status: 403 });
  const authorization = req.headers.get('authorization');
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await req.text();
  if (body && Buffer.byteLength(body) > 1024 * 1024)
    return NextResponse.json({ message: 'Request too large' }, { status: 413 });
  try {
    if (path.join('/') === 'v1/inbox/session') {
      const input = JSON.parse(body ?? '{}') as {
        applicationIdentifier?: string;
        subscriberHash?: string;
        subscriber?: { subscriberId?: string };
      };
      const token = req.cookies.get('flare_session')?.value,
        subscriberId = input.subscriber?.subscriberId;
      if (!token || !subscriberId || !input.subscriberHash)
        return NextResponse.json(
          { message: 'Authenticated subscriber hash required' },
          { status: 401 },
        );
      const access = await fetch(
        `${process.env.FLARE_API_URL ?? 'http://localhost:4000'}/v1/subscribers/${encodeURIComponent(subscriberId)}/inbox-token`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-org-id': req.cookies.get('flare_org')?.value ?? '',
            'x-environment-id': req.cookies.get('flare_environment')?.value ?? '',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      );
      if (!access.ok)
        return NextResponse.json({ message: 'No access to this subscriber' }, { status: 403 });
      const expected = (await access.json()) as {
        subscriberHash: string;
        applicationIdentifier: string;
      };
      if (
        input.applicationIdentifier !== expected.applicationIdentifier ||
        input.subscriberHash !== expected.subscriberHash
      )
        return NextResponse.json({ message: 'Invalid subscriber credentials' }, { status: 403 });
    }
    const response = await fetch(
      `${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}/${path.map(encodeURIComponent).join('/')}${req.nextUrl.search}`,
      {
        method: req.method,
        body,
        headers: {
          'Content-Type': 'application/json',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      },
    );
    return new NextResponse((await response.text()) || null, {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ message: 'Self-hosted Inbox is unavailable' }, { status: 503 });
  }
}
export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
