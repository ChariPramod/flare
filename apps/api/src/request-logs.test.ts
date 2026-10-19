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

it.each([
  { path: '/v1/subscribers/customer-17/inbox-token', serialized: false },
  { path: '/V1/SUBSCRIBERS/customer-17/INBOX-TOKEN/', serialized: true },
])(
  'omits reusable Inbox credentials from persisted logs for $path',
  async ({ path, serialized }) => {
    const hash = 'a7'.repeat(32);
    const app = express();
    app.use(requestLogs);
    app.use((req, _res, next) => {
      (req as AuthRequest).principal = {
        orgId: 'org',
        environmentId: 'env',
        actorId: 'key',
        kind: 'api_key',
        role: 'developer',
        permission: 'full_access',
        production: false,
      };
      next();
    });

    app.get('/v1/subscribers/:id/inbox-token', (_req, res) => {
      const value = { subscriberId: 'customer-17', subscriberHash: hash, proof: hash };
      if (serialized) res.type('json').send(JSON.stringify(value));
      else res.json(value);
    });
    app.get('/v1/subscribers/:id', (_req, res) =>
      res.json({ subscriberId: 'customer-17', status: 'active', subscriber_hash: hash }),
    );
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const response = await fetch(`${origin}${path}?proof=${hash}`);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ subscriberHash: hash });
      await fetch(`${origin}/v1/subscribers/customer-17`).then((r) => r.text());
      await flushRequestLogs();
      expect(records).toHaveLength(2);
      expect(records[0]!.slice(1, 8)).toEqual([
        'org',
        'env',
        'key',
        'key',
        'GET',
        '/v1/subscribers/:id/inbox-token',
        200,
      ]);
      expect(records[0]![8]).toEqual(expect.any(Number));
      expect(records[0]![9]).toMatch(/^[a-f0-9]{32}$/);
      expect(response.headers.get('x-request-id')).toBe(records[0]![0]);
      expect(JSON.stringify({ records, structured: logger.info.mock.calls })).not.toContain(hash);
      expect(records[0]![10]).toEqual({
        body: '[INBOX CREDENTIAL REDACTED]',
        query: '[INBOX CREDENTIAL REDACTED]',
      });
      expect(records[0]![11]).toBe('[INBOX CREDENTIAL REDACTED]');
      expect(records[1]![11]).toEqual({
        subscriberId: 'customer-17',
        status: 'active',
        subscriber_hash: '[REDACTED]',
      });
    } finally {
      server.close();
      await once(server, 'close');
    }
  },
);

it.each(['/v1/logs', '/V1/LOGS/previous-request/'])(
  'keeps log API payloads out of new records for %s without changing the response',
  async (path) => {
    const hash = 'b8'.repeat(32);
    const responseBody = {
      data: [
        {
          path: '/v1/subscribers/:id/inbox-token',
          response_body: JSON.stringify({ subscriberHash: hash }),
        },
      ],
    };
    const app = express();
    app.use(requestLogs);
    app.get(['/v1/logs', '/v1/logs/:id'], (_req, res) => res.json(responseBody));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const response = await fetch(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}${path}?diagnostic=${hash}`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(responseBody);
      await flushRequestLogs();
      expect(records).toHaveLength(1);
      expect(records[0]![5]).toBe('GET');
      expect(records[0]![7]).toBe(200);
      expect(response.headers.get('x-request-id')).toBe(records[0]![0]);
      expect(records[0]![10]).toEqual({
        body: '[LOG CONTENT REDACTED]',
        query: '[LOG CONTENT REDACTED]',
      });
      expect(records[0]![11]).toBe('[LOG CONTENT REDACTED]');
      expect(JSON.stringify({ records, structured: logger.info.mock.calls })).not.toContain(hash);
    } finally {
      server.close();
      await once(server, 'close');
    }
  },
);
