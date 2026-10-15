import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { it, expect, vi, beforeEach } from 'vitest';
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
beforeEach(() => {
  records.length = 0;
  vi.clearAllMocks();
});
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
  app.post('/v1/emails/batch', (_req, res) =>
    res.json({ request: { text: 'outgoing response content' } }),
  );
  app.get('/v1/private', (_req, res) => res.status(401).json({ message: 'Unauthorized' }));
  app.post('/v1/events/sns/instance', (_req, res) => res.json({ received: true }));
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
    await fetch(`${origin}/v1/emails/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emails: [
          {
            html: 'outgoing private HTML',
            text: 'outgoing private text',
            attachments: [{ content: 'private attachment bytes' }],
          },
        ],
      }),
    }).then((r) => r.text());
    await flushRequestLogs();
    await fetch(`${origin}/v1/events/sns/instance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        Message: JSON.stringify({
          mail: { commonHeaders: { subject: 'callback private subject' } },
          content: 'callback private content',
        }),
      }),
    }).then((r) => r.text());
    await flushRequestLogs();
    expect(records).toHaveLength(5);
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
      'callback private subject',
      'callback private content',
      'private encoded MIME',
      'private response body',
      'query-secret',
      'header-secret',
      'password-secret',
      'session-token',
      'signing-secret',
      'sensitive-path',
      'outgoing private HTML',
      'outgoing private text',
      'outgoing response content',
      'private attachment bytes',
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

it.each([
  '/V1/EMAILS',
  '/V1/INBOUND/POSTAL/domain',
  '/V1/EVENTS/SNS/instance',
  '/v1/events/trigger',
  '/v1/events/trigger/bulk',
  '/v1/events/novu/environment',
  '/v1/workflows/workflow',
  '/v1/activity/run',
  '/v1/templates/template/versions',
  '/v1/template-preview',
  '/v1/layouts/layout',
  '/v1/translations/workflow/en_US',
  '/v1/content/preview',
  '/v1/automations/automation',
  '/v1/automation-events',
  '/v1/automation-runs/run',
])('keeps content out of request logs for %s, including rejected submissions', async (path) => {
  const app = express();
  app.use(requestLogs);
  app.use(express.json());
  // Express accepts mixed-case paths; log protection must cover the same requests.
  app.post(path.toLowerCase(), (req, res) => {
    res.status(422).json({ message: 'Validation failed', preview: req.body.payload });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}?html=private-query-html`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { invoice: 'private-invoice-content' },
          html: 'private-email-html',
          text: 'private-email-text',
        }),
      },
    );
    expect(response.status).toBe(422);
    await response.text();
    await flushRequestLogs();
    expect(records).toHaveLength(1);
    expect(records[0]!.slice(5, 8)).toEqual(['POST', path.toLowerCase(), 422]);
    const serialized = JSON.stringify({ records, structured: logger.info.mock.calls });
    for (const content of [
      'private-query-html',
      'private-invoice-content',
      'private-email-html',
      'private-email-text',
    ])
      expect(serialized).not.toContain(content);
    expect(serialized).toContain('REDACTED');
    expect(response.headers.get('x-request-id')).toBe(records[0]![0]);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

it('omits rendered publication diffs from successful GET response logs', async () => {
  const app = express();
  app.use(requestLogs);
  app.get('/v1/publish/diff', (_req, res) =>
    res.json({
      layouts: [{ development: { html: 'private-publication-html' } }],
      translations: [{ development: { entries: { invoice: 'private-translated-invoice' } } }],
    }),
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/publish/diff`,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('private-publication-html');
    await flushRequestLogs();
    expect(records).toHaveLength(1);
    expect(records[0]!.slice(5, 8)).toEqual(['GET', '/v1/publish/diff', 200]);
    expect(JSON.stringify(records)).not.toContain('private-publication-html');
    expect(JSON.stringify(records)).not.toContain('private-translated-invoice');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
