import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import type * as Dns from 'node:dns/promises';
import { postWebhook, webhookUrl } from './http.js';
vi.mock('node:dns/promises', async (original) => ({
  ...(await original<typeof Dns>()),
  lookup: vi.fn(),
}));
let origin: string;
const paths: string[] = [];
const server = createServer((req, res) => {
  paths.push(req.url!);
  if (req.url === '/redirect') {
    res.writeHead(302, { Location: '/unexpected' });
    res.end('moved');
  } else res.end('x'.repeat(10000));
});
beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  paths.length = 0;
});
afterAll(async () => {
  server.close();
  await once(server, 'close');
});
it('rejects private literals and URLs carrying credentials', () => {
  expect(() => webhookUrl('http://127.0.0.1/path')).toThrow('Private');
  expect(() => webhookUrl('http://[::1]/path')).toThrow('Private');
  expect(() => webhookUrl('https://name:secret@example.com')).toThrow('credentials');
  expect(() => webhookUrl('file:///etc/passwd')).toThrow('HTTP');
});
it('rejects mixed public/private DNS answers before making a connection', async () => {
  vi.mocked(lookup).mockResolvedValue([
    { address: '8.8.8.8', family: 4 },
    { address: '127.0.0.1', family: 4 },
  ] as never);
  await expect(postWebhook('https://mixed.example.test', '{}', {})).rejects.toThrow('Private');
});
it('never follows redirects, including for an explicitly allowed internal receiver', async () => {
  vi.stubEnv('WEBHOOK_ALLOWED_ORIGINS', origin);
  expect(await postWebhook(`${origin}/redirect`, '{}', {})).toEqual({
    status: 302,
    excerpt: 'moved',
  });
  expect(paths).toEqual(['/redirect']);
  expect(() => webhookUrl('http://127.0.0.1:1')).toThrow('Private');
});
it('pins the validated DNS result and bounds the response body', async () => {
  const namedOrigin = origin.replace('127.0.0.1', 'receiver.example.test');
  vi.stubEnv('WEBHOOK_ALLOWED_ORIGINS', namedOrigin);
  vi.mocked(lookup).mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }] as never);
  const result = await postWebhook(`${namedOrigin}/body`, '{}', {});
  expect(result.status).toBe(200);
  expect(result.excerpt).toHaveLength(4096);
  expect(lookup).toHaveBeenCalledTimes(1);
});
