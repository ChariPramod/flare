import { once } from 'node:events';
import { get } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { expect, it, vi } from 'vitest';

const { records, sql, logger, persistence } = vi.hoisted(() => {
  const records: unknown[][] = [];
  const persistence = { wait: Promise.resolve() };
  const sql = Object.assign(
    async (_text: TemplateStringsArray, ...values: unknown[]) => {
      records.push(values);
      await persistence.wait;
      return [];
    },
    { json: (value: unknown) => value },
  );
  return { records, sql, persistence, logger: { info: vi.fn(), error: vi.fn() } };
});
vi.mock('./context.js', () => ({ sql, logger }));
import { requestLogs, flushRequestLogs } from './request-logs.js';

it('flush waits for finished HTTP request persistence and preserves incoming trace correlation', async () => {
  let release!: () => void;
  persistence.wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  records.length = 0;
  const app = express();
  app.use(requestLogs);
  app.get('/ready', (_req, res) => res.json({ status: 'ready' }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/ready`,
      {
        headers: { traceparent },
      },
    );
    await response.text();
    let flushed = false;
    const flush = flushRequestLogs().then(() => {
      flushed = true;
    });
    await Promise.resolve();
    expect(flushed).toBe(false);
    expect(records).toHaveLength(1);
    expect(response.headers.get('x-request-id')).toBe(records[0]![0]);
    expect(response.headers.get('traceparent')?.split('-')[1]).toBe(traceparent.split('-')[1]);
    expect(records[0]![9]).toBe(traceparent.split('-')[1]);
    release();
    await flush;
    expect(flushed).toBe(true);
  } finally {
    release();
    await flushRequestLogs();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it('records a disconnected streaming HTTP request exactly once with status 499', async () => {
  records.length = 0;
  persistence.wait = Promise.resolve();
  const app = express();
  app.use(requestLogs);
  let disconnected!: () => void;
  const closed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  app.get('/stream/:id', (_req, res) => {
    res.once('close', disconnected);
    res.write('partial response');
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    await new Promise<void>((resolve, reject) => {
      const request = get(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}/stream/private-id`,
        (response) => {
          response.once('data', () => {
            response.destroy();
            resolve();
          });
          response.on('error', reject);
        },
      );
      request.on('error', reject);
    });
    await closed;
    await flushRequestLogs();
    expect(records).toHaveLength(1);
    expect(records[0]![6]).toBe('/stream/:id');
    expect(records[0]![7]).toBe(499);
    expect(JSON.stringify(records)).not.toContain('private-id');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
