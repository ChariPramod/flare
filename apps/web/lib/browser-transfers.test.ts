import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type * as transfers from './browser-transfers';

let client: typeof transfers;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const messageId = 'b11f5962-a27a-49fa-87f5-37edce00d31e';
const attachmentId = 'd901e134-b73a-4214-9546-b34ec4cb3937';
const grant = (method = 'GET') => ({
  url: 'https://api.example.test/v1/transfer-resource',
  method,
  token: 'temporary-transfer-credential',
  expires_at: new Date(Date.now() + 60000).toISOString(),
});
beforeEach(async () => {
  vi.resetModules();
  client = await import('./browser-transfers');
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.unstubAllGlobals());

it('leaves small metadata and unsupported operations on the normal proxy without configuration calls', async () => {
  for (const [path, method] of [
    ['emails', 'GET'],
    ['inbound', 'GET'],
    [`inbound/${messageId}`, 'GET'],
    [`emails/${messageId}`, 'PATCH'],
    [`emails/${messageId}/cancel`, 'POST'],
    ['workflows', 'POST'],
  ])
    expect(await client.browserTransfer(path!, method!)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
it('caches a successful disabled mode so self-host requests need no transfer grants', async () => {
  fetcher.mockResolvedValueOnce(Response.json({ enabled: false }));
  expect(await client.browserTransfer(`emails/${messageId}`, 'GET')).toBeNull();
  expect(await client.browserTransfer('emails', 'POST', '{}', 'send-key')).toBeNull();
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]![0]).toBe('/api/browser-transfer-config');
});
it('does not cache unavailable configuration or authorize any direct request on failure', async () => {
  fetcher.mockResolvedValueOnce(
    Response.json({ message: 'Configuration unavailable' }, { status: 503 }),
  );
  await expect(client.browserTransfer(`emails/${messageId}`, 'GET')).rejects.toMatchObject({
    status: 503,
  });
  fetcher.mockResolvedValueOnce(Response.json({ enabled: false }));
  expect(await client.browserTransfer(`emails/${messageId}`, 'GET')).toBeNull();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    '/api/browser-transfer-config',
    '/api/browser-transfer-config',
  ]);
});
it.each([
  [`emails/${messageId}`, 'email.detail'],
  [`emails/${messageId}/source`, 'email.source'],
  [`inbound/${messageId}/body`, 'inbound.body'],
  [`inbound/${messageId}/raw`, 'inbound.raw'],
  [`inbound/${messageId}/attachments/${attachmentId}`, 'inbound.attachment'],
])('authorizes only the resource operation for %s', async (path, operation) => {
  fetcher
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(grant()))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  expect(await (await client.browserTransfer(path, 'GET'))!.json()).toEqual({ ok: true });
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toEqual({
    operation,
    message_id: messageId,
    ...(operation === 'inbound.attachment' ? { attachment_id: attachmentId } : {}),
  });
  expect(fetcher.mock.calls[2]).toEqual([
    grant().url,
    expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: `Bearer ${grant().token}` },
    }),
  ]);
  for (const [url] of fetcher.mock.calls) expect(String(url)).not.toContain(grant().token);
});
it('hashes UTF-8 bytes once and uses the exact serialized send and key on the direct request', async () => {
  const body = JSON.stringify({ subject: 'नमस्ते 世界 🙂', attachments: [{ content: 'YQ==' }] });
  fetcher
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(grant('POST')))
    .mockResolvedValueOnce(Response.json({ id: messageId }));
  await client.browserTransfer('emails', 'POST', body, 'logical-send');
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]!.body))).toEqual({
    operation: 'email.send',
    body_sha256: createHash('sha256').update(body).digest('hex'),
    body_bytes: Buffer.byteLength(body),
    idempotency_key: 'logical-send',
  });
  expect(fetcher.mock.calls[2]![1]).toMatchObject({
    body,
    credentials: 'omit',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${grant().token}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': 'logical-send',
    },
  });
  expect(fetcher.mock.calls[1]![1]).toMatchObject({
    credentials: 'same-origin',
    redirect: 'error',
  });
});
it('keeps an expired transfer failure visible and permits a fresh grant with identical send bytes and key', async () => {
  const body = JSON.stringify({ text: 'Retained draft' });
  fetcher
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(grant('POST')))
    .mockResolvedValueOnce(Response.json({ message: 'Transfer expired' }, { status: 401 }));
  const first = await client.browserTransfer('emails', 'POST', body, 'same-key');
  await expect(client.responseJson(first!)).rejects.toMatchObject({
    status: 401,
    message: 'Transfer expired',
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
  fetcher
    .mockResolvedValueOnce(
      Response.json({ ...grant('POST'), token: 'renewed-transfer-credential' }),
    )
    .mockResolvedValueOnce(Response.json({ id: messageId }));
  await client.browserTransfer('emails', 'POST', body, 'same-key');
  expect(fetcher.mock.calls[3]![1]!.body).toBe(fetcher.mock.calls[1]![1]!.body);
  expect(fetcher.mock.calls[4]![1]!.body).toBe(body);
  expect((fetcher.mock.calls[4]![1]!.headers as Record<string, string>)['Idempotency-Key']).toBe(
    'same-key',
  );
});
it.each([
  { url: 'https://user:password@api.example.test/v1/emails' },
  { url: 'http://api.example.test/v1/emails' },
  { url: 'https://api.example.test/v1/emails#secret' },
  { method: 'POST' },
  { token: '' },
  { expires_at: 'invalid' },
])('rejects malformed grants without sending credentials: %j', async (bad) => {
  fetcher
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ ...grant(), ...bad }));
  await expect(client.browserTransfer(`emails/${messageId}`, 'GET')).rejects.toMatchObject({
    status: 503,
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('propagates cancellation to configuration, issuance and execution fetches', async () => {
  const controller = new AbortController();
  fetcher
    .mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json(grant()))
    .mockResolvedValueOnce(Response.json({ ok: true }));
  await client.browserTransfer(
    `emails/${messageId}`,
    'GET',
    undefined,
    undefined,
    controller.signal,
  );
  for (const [, init] of fetcher.mock.calls) expect(init!.signal).toBe(controller.signal);
});
it('uses safe response filenames and retains a safe fallback for malformed headers', () => {
  expect(
    client.downloadFilename("attachment; filename*=UTF-8''r%C3%A9sum%C3%A9.txt", 'fallback.txt'),
  ).toBe('résumé.txt');
  expect(client.downloadFilename('attachment; filename="../../report.txt"', 'fallback.txt')).toBe(
    '.._.._report.txt',
  );
  expect(client.downloadFilename("attachment; filename*=UTF-8''%ZZ", 'fallback.txt')).toBe(
    'fallback.txt',
  );
  expect(client.downloadFilename(null, 'report\r\n.txt')).toBe('report.txt');
});

it('treats truncated successful JSON as a recoverable failure and preserves legitimate empty responses', async () => {
  await expect(client.responseJson(new Response('{"id":', { status: 201 }))).rejects.toMatchObject({
    status: 503,
    message: 'Flare returned an incomplete response. Retry the request.',
  });
  for (const status of [204, 205])
    expect(await client.responseJson(new Response(null, { status }))).toEqual({});
  await expect(
    client.responseJson(new Response('upstream unavailable', { status: 502 })),
  ).rejects.toMatchObject({ status: 502 });
  await expect(client.responseJson(Response.json(null, { status: 403 }))).rejects.toMatchObject({
    status: 403,
  });
});
