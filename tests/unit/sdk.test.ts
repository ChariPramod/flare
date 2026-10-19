import { it, expect, vi } from 'vitest';
import { randomBytes, createHmac } from 'node:crypto';
import {
  FlareClient,
  FlareError,
  verifyWebhook,
  operationCatalog,
} from '../../packages/sdk/src/index.js';
const environmentId = '00000000-0000-4000-8000-000000000001',
  apiKey = `fl_${randomBytes(32).toString('base64url')}`;
it('keeps private Inbox outside the catalog and rejects session-only transfer issuance before sending credentials', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const client = new FlareClient({
    baseUrl: 'https://flare.example.test',
    environmentId,
    apiKey,
    fetch: fetcher,
  });
  expect(
    operationCatalog.some((operation) => operation.path.startsWith('/v1/dashboard/inbox')),
  ).toBe(false);
  expect(
    operationCatalog.find((operation) => operation.path === '/v1/browser-transfers')?.sessionOnly,
  ).toBe(true);
  await expect(client.operation('POST', '/v1/browser-transfers', { body: {} })).rejects.toThrow(
    'dashboard user session',
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it('preserves binary inbound bytes and the default JSON/base64 response', async () => {
  const bytes = new Uint8Array([0, 255, 254, 128, 13, 10, 65]);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
    )
    .mockResolvedValueOnce(
      Response.json({
        filename: 'data.bin',
        content_type: 'application/octet-stream',
        content: Buffer.from(bytes).toString('base64'),
      }),
    );
  const client = new FlareClient({
    baseUrl: 'https://flare.example.test',
    environmentId,
    apiKey,
    fetch: fetcher,
  });
  const binary: Uint8Array = await client.request('get', '/v1/inbound/{id}/raw', {
    path: { id: environmentId },
    query: { format: 'binary' },
  });
  expect(binary).toEqual(bytes);
  const json = await client.request('get', '/v1/inbound/{id}/raw', { path: { id: environmentId } });
  expect(Buffer.from(json.content, 'base64')).toEqual(Buffer.from(bytes));
});
it('uses explicit tenant headers, path encoding and stable idempotency without retrying mutations', async () => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init! });
    return new Response('{"id":"message"}', { status: 201 });
  }) as typeof fetch;
  const client = new FlareClient({
    baseUrl: 'https://flare.example.test',
    environmentId,
    apiKey,
    fetch: fetcher,
  });
  await client.sendEmail(
    { from: 'sender@example.test', to: 'reader@example.test', subject: 'Welcome', text: 'Hello' },
    'stable-key',
  );
  expect(calls[0]!.url.pathname).toBe('/v1/emails');
  expect(calls[0]!.init.headers).toMatchObject({
    'x-environment-id': environmentId,
    'Idempotency-Key': 'stable-key',
  });
  expect(calls[0]!.init.redirect).toBe('error');
  await client.request('get', '/v1/subscribers/{id}', { path: { id: 'user/with space' } });
  expect(calls[1]!.url.pathname).toBe('/v1/subscribers/user%2Fwith%20space');
  fetcher.mockImplementationOnce(async () => {
    throw new Error('Lost response');
  });
  await expect(
    client.sendEmail({ from: 'a@b.test', to: 'c@d.test', subject: 'x', text: 'x' }, 'stable-key'),
  ).rejects.toMatchObject({ status: 0 });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(() => new FlareClient({ baseUrl: 'http://remote.test', environmentId, apiKey })).toThrow(
    'HTTPS',
  );
  expect(
    () => new FlareClient({ baseUrl: 'https://flare.test', environmentId: '', apiKey }),
  ).toThrow('environment');
});
it('paginates bounded data and preserves typed HTTP error metadata without leaking its key', async () => {
  let page = 0;
  const client = new FlareClient({
    baseUrl: 'http://localhost:4000',
    environmentId,
    apiKey,
    fetch: vi.fn(
      async () => new Response(JSON.stringify({ data: ++page === 1 ? [{ id: 'a' }] : [] })),
    ) as typeof fetch,
  });
  const rows = [];
  for await (const row of client.paginate('/v1/contacts', {}, { limit: 1, maxPages: 3 }))
    rows.push(row);
  expect(rows).toEqual([{ id: 'a' }]);
  expect(page).toBe(2);
  const failed = new FlareClient({
    baseUrl: 'https://flare.test',
    environmentId,
    apiKey,
    fetch: vi.fn(
      async () =>
        new Response(JSON.stringify({ message: `denied ${apiKey}`, echo: apiKey }), {
          status: 429,
          headers: { 'retry-after': '2', 'x-request-id': 'request-1' },
        }),
    ) as typeof fetch,
  });
  try {
    await failed.request('get', '/v1/domains', {});
    throw new Error('Must reject');
  } catch (e) {
    expect(e).toBeInstanceOf(FlareError);
    expect(e).toMatchObject({ status: 429, retryAfter: 2, requestId: 'request-1' });
    expect(JSON.stringify(e)).not.toContain(apiKey);
  }
});
it('verifies Svix signatures, rotation and timestamps over the original body', async () => {
  const bytes = randomBytes(32),
    secret = `whsec_${bytes.toString('base64')}`,
    body = '{"type":"email.sent"}',
    timestamp = 1700000000,
    id = 'event-1';
  const signature = createHmac('sha256', bytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');
  const headers = {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,invalid v1,${signature}`,
  };
  expect(await verifyWebhook(secret, body, headers, { now: timestamp })).toEqual({
    type: 'email.sent',
  });
  await expect(verifyWebhook(secret, body + ' ', headers, { now: timestamp })).rejects.toThrow(
    'signature',
  );
  await expect(verifyWebhook(secret, body, headers, { now: timestamp + 301 })).rejects.toThrow(
    'expired',
  );
});

it('exposes tenant sending-policy and held-mail details with structured policy errors', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ state: 'approved', revision: 2, usage: { reserved: 3, sent_24h: 7 } }),
      ),
  ) as typeof fetch;
  const client = new FlareClient({
    baseUrl: 'https://flare.test',
    environmentId,
    apiKey,
    fetch: fetcher,
  });
  expect(await client.sendingPolicy()).toMatchObject({
    state: 'approved',
    usage: { reserved: 3, sent_24h: 7 },
  });
  fetcher.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({
          id: 'held',
          status: 'held',
          hold_reason: 'sending_suspended',
          next_attempt_at: '2026-10-14T19:00:00.000Z',
        }),
      ),
  );
  expect(await client.request('get', '/v1/emails/{id}', { path: { id: 'held' } })).toMatchObject({
    status: 'held',
    hold_reason: 'sending_suspended',
  });
  fetcher.mockImplementationOnce(
    async () =>
      new Response(
        JSON.stringify({
          message: 'Recipient capacity exhausted',
          code: 'recipient_quota_exhausted',
        }),
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
  );
  await expect(
    client.sendEmail({
      from: 'sender@example.test',
      to: 'reader@example.test',
      subject: 'Hello',
      text: 'Hello',
      traffic_class: 'transactional',
    }),
  ).rejects.toMatchObject({
    status: 429,
    retryAfter: 60,
    details: { code: 'recipient_quota_exhausted' },
  });
});

it('native inspection helpers use only tenant-scoped GET operations and never submit replay or cancellation', async () => {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), init: init! });
    return new Response(
      JSON.stringify(
        String(url).includes('/reconciliation')
          ? { data: [], before: '2026-01-01T00:00:00.000Z', next_cursor: null }
          : {
              id: '00000000-0000-4000-8000-000000000002',
              queue_presence: 'unknown',
              replay_allowed: false,
            },
      ),
      { status: 200 },
    );
  }) as typeof fetch;
  const client = new FlareClient({
    baseUrl: 'https://flare.example.test',
    environmentId,
    apiKey,
    fetch: fetcher,
  });
  await client.inspectWorkflow('00000000-0000-4000-8000-000000000002');
  const report = await client.reconcileWorkflows({ before: '2026-01-01T00:00:00Z' });
  expect(report).toMatchObject({ complete: true, inventory_complete: true, data: [] });
  expect(calls.map((call) => call.init.method)).toEqual(['GET', 'GET']);
  expect(calls.every((call) => call.init.body === undefined)).toBe(true);
  expect(calls[0]!.init.headers).toMatchObject({ 'x-environment-id': environmentId });
  expect(calls[0]!.url.pathname).toBe(
    '/v1/activity/00000000-0000-4000-8000-000000000002/inspection',
  );
  expect(calls[1]!.url.searchParams.get('before')).toBe('2026-01-01T00:00:00.000Z');
});
