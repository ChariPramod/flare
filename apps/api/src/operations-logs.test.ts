import { beforeEach, expect, it, vi } from 'vitest';
import type * as database from '@flare/db';
import type { AuthRequest } from './context.js';

const { rows, sql, withTenant } = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = [];
  const sql = vi.fn(async (_text: TemplateStringsArray, ..._values: unknown[]) => rows);
  return {
    rows,
    sql,
    withTenant: vi.fn(
      async (_sql: unknown, _principal: unknown, callback: (tx: typeof sql) => unknown) =>
        callback(sql),
    ),
  };
});
vi.mock('@flare/db', async (original) => ({
  ...(await original<typeof database>()),
  withTenant,
}));
vi.mock('./context.js', () => ({
  sql,
  config: {},
  parse: (schema: { parse(input: unknown): unknown }, input: unknown) => schema.parse(input),
}));
vi.mock('./auth.js', () => ({ Access: () => () => {}, Public: () => () => {} }));
vi.mock('./identity.js', () => ({ audit: vi.fn() }));
import { OperationsController } from './operations.js';

const req = {
  principal: {
    orgId: 'org',
    environmentId: 'environment',
    actorId: 'reader',
    kind: 'session',
    role: 'viewer',
    production: false,
  },
} as AuthRequest;
const id = 'b9dc2b3b-058f-41a3-a58b-74307bb0cf24';
const hash = 'c5'.repeat(32);
const controller = new OperationsController();
beforeEach(() => {
  rows.length = 0;
  vi.clearAllMocks();
});

it.each(['/v1/subscribers/:id/inbox-token', '/V1/SUBSCRIBERS/customer-17/INBOX-TOKEN/'])(
  'masks historical Inbox credential bodies in list and detail for %s without changing metadata or storage',
  async (path) => {
    const metadata = {
      id,
      org_id: 'org',
      environment_id: 'environment',
      key_id: null,
      actor_id: 'reader',
      method: 'GET',
      path,
      status: 200,
      latency_ms: 12,
      trace_id: 'd6'.repeat(16),
      created_at: new Date('2026-10-19T00:00:00Z'),
      additional_metadata: 'x'.repeat(40000),
    };
    const stored = {
      ...metadata,
      request_body: { body: null, query: { proof: hash } },
      // Earlier serialized responses need route-level protection, not just object-key filtering.
      response_body: JSON.stringify({
        subscriberHash: hash,
        proof: hash,
        subscriberId: 'customer-17',
      }),
    };
    rows.push(stored);
    const listed = await controller.logs(req, { page: '2', limit: '5', status: '200' });
    const detail = await controller.log(req, id);
    expect(listed).toMatchObject({ page: 2, limit: 5 });
    for (const row of [listed.data[0]!, detail]) {
      expect(JSON.stringify(row)).not.toContain(hash);
      expect(JSON.stringify(row.request_body)).toContain('REDACTED');
      expect(JSON.stringify(row.response_body)).toContain('REDACTED');
      const { request_body: _request, response_body: _response, ...actualMetadata } = row;
      expect(actualMetadata).toEqual(metadata);
      expect(row.created_at).toBe(metadata.created_at);
    }
    expect(stored.request_body.query.proof).toBe(hash);
    expect(stored.response_body).toContain(hash);
    expect(withTenant).toHaveBeenCalledTimes(2);
    for (const call of withTenant.mock.calls) expect(call[1]).toBe(req.principal);
    expect(sql.mock.calls[0]?.[1]).toBe('%%');
    expect(sql.mock.calls[0]?.slice(-2)).toEqual([5, 5]);
    expect(sql.mock.calls[1]?.[1]).toBe(id);
  },
);

it('sanitizes historical subscriber hashes on ordinary routes while retaining useful bodies', async () => {
  rows.push({
    id,
    path: '/v1/subscribers/:id',
    status: 200,
    request_body: { body: { subscriberId: 'customer-17' }, query: { subscriber_hash: hash } },
    response_body: {
      subscriberId: 'customer-17',
      status: 'active',
      nested: [{ 'SUBSCRIBER-HASH': hash }],
      diagnostic: `https://inbox.example.test/session?subscriberHash=${hash}&page=2`,
    },
  });
  const result = await controller.logs(req, {});
  const detail = await controller.log(req, id);
  for (const row of [result.data[0]!, detail]) {
    expect(JSON.stringify(row)).not.toContain(hash);
    expect(row.request_body).toEqual({
      body: { subscriberId: 'customer-17' },
      query: { subscriber_hash: '[REDACTED]' },
    });
    expect(row.response_body).toMatchObject({
      subscriberId: 'customer-17',
      status: 'active',
      nested: [{ 'SUBSCRIBER-HASH': '[REDACTED]' }],
    });
    expect(JSON.stringify(row.response_body)).toContain('page=2');
  }
});

it('preserves not-found responses for unavailable historical logs', async () => {
  await expect(controller.log(req, id)).rejects.toMatchObject({ status: 404 });
  expect(withTenant.mock.calls[0]?.[1]).toBe(req.principal);
});

it.each(['/v1/logs', '/V1/LOGS/:id/'])(
  'masks historical log response copies at %s, including nested serialized credentials',
  async (path) => {
    const serializedCredential = JSON.stringify({ subscriberHash: hash, proof: hash });
    const metadata = { id, path, status: 200, created_at: new Date('2026-10-19T00:00:00Z') };
    const stored = {
      ...metadata,
      request_body: { query: { diagnostic: serializedCredential } },
      response_body: {
        data: [
          {
            path: '/v1/logs/:id',
            response_body: {
              path: '/v1/subscribers/:id/inbox-token',
              response_body: serializedCredential,
            },
          },
        ],
      },
    };
    rows.push(stored);
    const listed = await controller.logs(req, {});
    const detail = await controller.log(req, id);
    for (const row of [listed.data[0]!, detail]) {
      expect(row).toEqual({
        ...metadata,
        request_body: { body: '[LOG CONTENT REDACTED]', query: '[LOG CONTENT REDACTED]' },
        response_body: '[LOG CONTENT REDACTED]',
      });
      expect(row.created_at).toBe(metadata.created_at);
      expect(JSON.stringify(row)).not.toContain(hash);
    }
    expect(stored.response_body.data[0]!.response_body.response_body).toBe(serializedCredential);
  },
);
