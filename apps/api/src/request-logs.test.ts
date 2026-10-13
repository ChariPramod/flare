import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { it, expect, vi } from 'vitest';
const { records, sql, logger } = vi.hoisted(() => {
  const records: unknown[][] = [];
  const sql = Object.assign(
    async (_text: TemplateStringsArray, ...values: unknown[]) => {
      records.push(values);
      return [];
    },
    { json: (value: unknown) => value },
  );
  return { records, sql, logger: { info: vi.fn(), error: vi.fn() } };
});
vi.mock('./context.js', () => ({ sql, logger }));
import { requestLogs, flushRequestLogs } from './request-logs.js';
import type { AuthRequest } from './context.js';
it('records tenant, route, latency and redacted bodies for completed and rejected HTTP requests', async () => {
  const app = express();
  app.use(requestLogs);
  app.use(express.json());
  app.post('/v1/test/:id', (req, res) => {
    (req as AuthRequest).principal = {
      orgId: 'org',
      environmentId: 'env',
      actorId: 'key',
      kind: 'api_key',
      role: 'developer',
      permission: 'full_access',
      production: false,
    };
    res
      .status(201)
      .json({ id: 'created', secret: 'signing-secret', data: { token: 'session-token' } });
  });
  app.post('/v1/inbound/postal/:id', (req, res) => res.json({ html: 'private response body' }));
  app.get('/v1/private', (_req, res) => res.status(401).json({ message: 'Unauthorized' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response = await fetch(`${origin}/v1/test/sensitive-path?api_key=query-secret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer header-secret' },
      body: JSON.stringify({ password: 'password-secret', subject: 'Hello' }),
    });
    expect(response.status).toBe(201);
    await response.text();
    await fetch(`${origin}/v1/private`).then((r) => r.text());
    await fetch(`${origin}/v1/inbound/postal/domain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'private encoded MIME' }),
    }).then((r) => r.text());
    await flushRequestLogs();
    expect(records).toHaveLength(3);
    expect(records[0]!.slice(1, 8)).toEqual([
      'org',
      'env',
      'key',
      'key',
      'POST',
      '/v1/test/:id',
      201,
    ]);
    expect(Number(records[0]![8])).toBeGreaterThanOrEqual(0);
    expect(records[1]!.slice(1, 4)).toEqual([null, null, null]);
    const stored = JSON.stringify(records);
    for (const secret of [
      'private encoded MIME',
      'private response body',
      'query-secret',
      'header-secret',
      'password-secret',
      'session-token',
      'signing-secret',
      'sensitive-path',
    ])
      expect(stored).not.toContain(secret);
    expect(stored).toContain('REDACTED');
    expect(stored).toContain('Hello');
    expect(response.headers.get('x-request-id')).toBe(records[0]![0]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
