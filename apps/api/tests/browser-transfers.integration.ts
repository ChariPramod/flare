import 'reflect-metadata';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import type { Server } from 'node:http';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext, RawBodyRequest } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import express from 'express';
import type { Request, Response, RequestHandler, ErrorRequestHandler } from 'express';
import { SignJWT } from 'jose';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { withTenant } from '@flare/db';
import { generateDomain, submitEmails } from '@flare/mail';
import type { ObjectStore, PipelineOptions } from '@flare/mail';
import { hashToken } from '@flare/shared';
import type { BrowserTransferInput, BrowserTransferOperation } from '@flare/shared';

// Only infrastructure is injected: auth, transfer verification, SQL policy and the mail
// acceptance/idempotency path execute unchanged against the disposable services.
vi.mock('../src/context.js', async () => {
  const { integrationTargets } = await import('../../worker/tests/targets.mjs');
  const { connectDatabase } = await import('@flare/db');
  const { Redis } = await import('ioredis');
  const { BadRequestException } = await import('@nestjs/common');
  const { databaseUrl, redisUrl } = integrationTargets();
  return {
    config: { JWT_SECRET: 'browser-transfer-integration-key-only' },
    sql: connectDatabase(databaseUrl).client,
    redis: new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }),
    parse: (
      schema: { safeParse: (input: unknown) => { success: boolean; data?: unknown } },
      input: unknown,
    ) => {
      const result = schema.safeParse(input);
      if (!result.success) throw new BadRequestException('Validation failed');
      return result.data;
    },
  };
});
import { config, redis, sql } from '../src/context.js';
import type { AuthRequest } from '../src/context.js';
import { AuthGuard } from '../src/auth.js';
import { BrowserTransfersController, browserTransferCors } from '../src/browser-transfers.js';

const orgId = randomUUID(),
  environmentId = randomUUID(),
  otherEnvironment = randomUUID();
const actorId = randomUUID(),
  sessionId = randomUUID(),
  apiKeyId = randomUUID();
const apiKey = `fl_${randomBytes(24).toString('hex')}`;
const domainId = randomUUID(),
  otherDomainId = randomUUID(),
  foreignMessage = randomUUID();
const webOrigin = 'http://localhost:3000';
const encryptionKey = randomBytes(32).toString('base64');
const objects = new Map<string, Buffer>();
const store: ObjectStore = {
  async put(key, bytes) {
    objects.set(key, Buffer.from(bytes));
  },
  async get(key) {
    const bytes = objects.get(key);
    if (!bytes) throw new Error('Missing fixture object');
    return bytes;
  },
  async remove(key) {
    objects.delete(key);
  },
};
const pipeline: PipelineOptions = {
  sql,
  store,
  encryptionKey,
  trackingKey: encryptionKey,
  transports: [
    {
      name: 'fixture',
      sandbox: true,
      supportsRequiredTls: async () => true,
      send: async () => {
        throw new Error('Acceptance tests must never dispatch mail');
      },
    },
  ],
};
let server: Server | undefined,
  base = '',
  sessionToken = '';
const guard = new AuthGuard(new Reflector());
const controller = new BrowserTransfersController();
function secured(
  operation: BrowserTransferOperation | undefined,
  action: string,
  handle: (req: RawBodyRequest<AuthRequest>, res: Response) => Promise<unknown>,
): RequestHandler {
  const handler = () => undefined;
  Reflect.defineMetadata('access', action, handler);
  if (operation) Reflect.defineMetadata('browserTransferOperation', operation, handler);
  return (req, res, next) => {
    const context = {
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      getHandler: () => handler,
      getClass: () => BrowserTransfersController,
    } as unknown as ExecutionContext;
    void guard
      .canActivate(context)
      .then(() => handle(req as AuthRequest, res))
      .then((result) => {
        if (!res.headersSent) res.json(result);
      })
      .catch(next);
  };
}
async function call(path: string, options: RequestInit = {}) {
  return fetch(`${base}${path}`, {
    ...options,
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
}
function sessionHeaders(environment = environmentId) {
  return {
    authorization: `Bearer ${sessionToken}`,
    origin: webOrigin,
    'x-org-id': orgId,
    'x-environment-id': environment,
    'content-type': 'application/json',
  };
}
async function grant(input: BrowserTransferInput) {
  const response = await call('/v1/browser-transfers', {
    method: 'POST',
    headers: sessionHeaders(),
    body: JSON.stringify(input),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return response.json() as Promise<{
    url: string;
    method: string;
    token: string;
    expires_at: string;
  }>;
}
function sendInput(
  body: string,
  key = randomUUID(),
): BrowserTransferInput & { operation: 'email.send' } {
  return {
    operation: 'email.send',
    body_sha256: createHash('sha256').update(body).digest('hex'),
    body_bytes: Buffer.byteLength(body),
    idempotency_key: key,
  };
}
function emailBody(subject: string) {
  return JSON.stringify({
    from: 'sender@example.test',
    to: ['reader@example.net'],
    subject,
    text: 'Exact UTF-8 🌅',
  });
}
function redeem(token: string, body: string, key: string, headers: Record<string, string> = {}) {
  return call('/v1/emails', {
    method: 'POST',
    body,
    headers: {
      authorization: `Bearer ${token}`,
      origin: webOrigin,
      'content-type': 'application/json',
      'idempotency-key': key,
      ...headers,
    },
  });
}
beforeAll(async () => {
  sql.options.onnotice = () => undefined;
  await sql`drop schema public cascade`;
  await sql`create schema public`;
  await sql`drop role if exists flare_tenant`;
  for (const file of readdirSync('packages/db/migrations')
    .sort()
    .filter((file) => file.endsWith('.sql')))
    await sql.unsafe(readFileSync(`packages/db/migrations/${file}`, 'utf8'));
  await redis.connect();
  await redis.ping();
  await sql`insert into organizations(id,name,slug) values(${orgId},'Browser transfers',${`browser-${orgId}`})`;
  await sql`insert into environments(id,org_id,name) values(${environmentId},${orgId},'Development'),(${otherEnvironment},${orgId},'Production')`;
  await sql`insert into users(id,email,name) values(${actorId},'browser-transfer@example.test','Transfer tester')`;
  await sql`insert into sessions(id,user_id,expires_at) values(${sessionId},${actorId},now()+interval '1 hour')`;
  await sql`insert into api_keys(id,org_id,environment_id,name,token_hash,prefix,permission)
    values(${apiKeyId},${orgId},${environmentId},'Ordinary key',${hashToken(apiKey)},'fl_fixture','full_access')`;
  for (const [env, id] of [
    [environmentId, domainId],
    [otherEnvironment, otherDomainId],
  ]) {
    const keys = generateDomain('example.test', `${orgId}/${env}`, encryptionKey);
    await sql`insert into domains(id,org_id,environment_id,name,status,dkim_selector,dkim_public,dkim_private_cipher)
      values(${id!},${orgId},${env!},'example.test','verified',${keys.selector},${keys.publicKey},${keys.cipher})`;
  }
  await sql`insert into messages(id,org_id,environment_id,domain_id,request,envelope_from,status)
    values(${foreignMessage},${orgId},${otherEnvironment},${otherDomainId},'{}','sender@example.test','canceled')`;
  sessionToken = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('flare')
    .setAudience('flare-dashboard')
    .setSubject(actorId)
    .setJti(sessionId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(config.JWT_SECRET));
  const app = express();
  app.use(browserTransferCors);
  app.use(
    express.json({
      limit: '40mb',
      verify: (req, _res, bytes) => {
        (req as RawBodyRequest<Request>).rawBody = Buffer.from(bytes);
      },
    }),
  );
  app.post(
    '/v1/browser-transfers',
    secured(undefined, 'read', (req, res) => controller.issue(req, req.body, res)),
  );
  app.post(
    '/v1/emails',
    secured('email.send', 'send', (req) =>
      submitEmails(pipeline, req.principal, [req.body], { key: req.get('idempotency-key') }),
    ),
  );
  app.get(
    '/v1/emails/:id',
    secured('email.detail', 'read', (req) =>
      withTenant(sql, req.principal, async (tx) => {
        const [message] =
          await tx`select id,status from messages where id=${String(req.params.id)}`;
        return message;
      }),
    ),
  );
  app.get(
    '/v1/auth/me',
    secured(undefined, 'read', async (req) => ({ principal: req.principal })),
  );
  const errors: ErrorRequestHandler = (error, _req, res, _next) => {
    const status = error instanceof HttpException ? error.getStatus() : Number(error.status ?? 500);
    res
      .status(status)
      .json(error instanceof HttpException ? error.getResponse() : { message: error.message });
  };
  app.use(errors);
  server = await new Promise<Server>((resolve) => {
    const value = app.listen(0, '127.0.0.1', () => resolve(value));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  base = `http://127.0.0.1:${address.port}`;
  vi.stubEnv('WEB_ORIGIN', webOrigin);
  vi.stubEnv('PUBLIC_API_URL', base);
});
beforeEach(async () => {
  await sql`insert into memberships(org_id,user_id,role) values(${orgId},${actorId},'developer')
    on conflict(org_id,user_id) do update set role='developer'`;
  await sql`update sessions set revoked_at=null,expires_at=now()+interval '1 hour' where id=${sessionId}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  server?.closeAllConnections();
  if (server)
    await new Promise<void>((resolve, reject) =>
      server!.close((error) => (error ? reject(error) : resolve())),
    );
  // Only this suite's API-key limiter entry is touched; no global Redis reset.
  await redis.del(`flare:limit:key:${apiKeyId}`);
  await redis.quit();
  await sql.end({ timeout: 5 });
});

it('uses the existing durable idempotency record for concurrent and renewed direct send grants', async () => {
  const body = emailBody(`Idempotency ${randomUUID()}`),
    input = sendInput(body);
  const first = await grant(input),
    renewed = await grant(input);
  const responses = await Promise.all(
    [first.token, first.token, renewed.token].map((token) =>
      redeem(token, body, input.idempotency_key),
    ),
  );
  for (const response of responses)
    expect(response.status, await response.clone().text()).toBe(200);
  const results = await Promise.all(responses.map((response) => response.json()));
  expect(new Set(results.map((result) => result.data[0].id)).size).toBe(1);
  expect(await sql`select id from messages where id=${results[0].data[0].id}`).toHaveLength(1);
  expect(await sql`select key from idempotency where key=${input.idempotency_key}`).toHaveLength(1);
  expect((await redeem(first.token, ` ${body}`, input.idempotency_key)).status).toBe(403);
  expect((await redeem(first.token, body, 'changed-key')).status).toBe(403);
});

it('rechecks actual session revocation, expiration, role changes and membership removal after issuance', async () => {
  const body = emailBody('Live authority'),
    input = sendInput(body),
    issued = await grant(input);
  await sql`update sessions set revoked_at=now() where id=${sessionId}`;
  expect((await redeem(issued.token, body, input.idempotency_key)).status).toBe(403);
  await sql`update sessions set revoked_at=null,expires_at=now()-interval '1 second' where id=${sessionId}`;
  expect((await redeem(issued.token, body, input.idempotency_key)).status).toBe(403);
  await sql`update sessions set expires_at=now()+interval '1 hour' where id=${sessionId}`;
  await sql`update memberships set role='viewer' where org_id=${orgId} and user_id=${actorId}`;
  expect((await redeem(issued.token, body, input.idempotency_key)).status).toBe(403);
  await sql`delete from memberships where org_id=${orgId} and user_id=${actorId}`;
  expect((await redeem(issued.token, body, input.idempotency_key)).status).toBe(403);
  expect(await sql`select key from idempotency where key=${input.idempotency_key}`).toHaveLength(0);
});

it('preserves viewer reads and rejects cross-environment resources and caller tenant overrides', async () => {
  const body = emailBody('Scoped read'),
    input = sendInput(body),
    sent = await grant(input);
  const response = await redeem(sent.token, body, input.idempotency_key);
  expect(response.status).toBe(200);
  const messageId = (await response.json()).data[0].id;
  await sql`update memberships set role='viewer' where org_id=${orgId} and user_id=${actorId}`;
  const read = await grant({ operation: 'email.detail', message_id: messageId });
  expect(
    (
      await call(`/v1/emails/${messageId}`, {
        headers: { authorization: `Bearer ${read.token}`, origin: webOrigin },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call(`/v1/emails/${messageId}`, {
        headers: {
          authorization: `Bearer ${read.token}`,
          origin: webOrigin,
          'x-environment-id': otherEnvironment,
        },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call(`/v1/emails/${foreignMessage}`, {
        headers: { authorization: `Bearer ${read.token}`, origin: webOrigin },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call('/v1/browser-transfers', {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify({ operation: 'email.detail', message_id: foreignMessage }),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await call('/v1/browser-transfers', {
        method: 'POST',
        headers: sessionHeaders(),
        body: JSON.stringify(input),
      })
    ).status,
  ).toBe(403);
});

it('never promotes an API key or transfer token to ordinary session authority and preserves legacy CORS', async () => {
  const input = sendInput(emailBody('Audience')),
    issued = await grant(input);
  expect(
    (
      await call('/v1/auth/me', {
        headers: { authorization: `Bearer ${issued.token}`, origin: webOrigin },
      })
    ).status,
  ).toBe(401);
  expect((await call('/v1/auth/me', { headers: sessionHeaders() })).status).toBe(200);
  const rejected = await call('/v1/browser-transfers', {
    method: 'POST',
    headers: { ...sessionHeaders(), authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(input),
  });
  expect(rejected.status).toBe(403);
  expect(rejected.headers.get('ratelimit-limit')).toBe('10');
  for (const path of ['/v1/browser-transfers', '/v1/emails']) {
    const preflight = await call(path, {
      method: 'OPTIONS',
      headers: {
        origin: webOrigin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization, content-type, x-org-id, x-environment-id',
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(webOrigin);
  }
});
