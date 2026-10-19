import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, RequestHandler } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { withTenant } from '@flare/db';
import { browserTransferSchema, can, canSend } from '@flare/shared';
import type {
  BrowserTransferInput,
  BrowserTransferOperation,
  Principal,
  Role,
} from '@flare/shared';
import { config, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { verifiedDashboardClientAddress } from './dashboard-forwarding.js';

const uuid = z.string().uuid();
export type { BrowserTransferInput, BrowserTransferOperation } from '@flare/shared';
export const BrowserTransfer = (operation: BrowserTransferOperation) =>
  SetMetadata('browserTransferOperation', operation);
const audience = 'flare-browser-transfer';
const tokenType = 'flare-browser-transfer+jwt';
const prefix = 'fbt_';
const invalid = () =>
  new UnauthorizedException({
    code: 'browser_transfer_invalid',
    message: 'Invalid or expired browser transfer',
  });
const forbidden = (message = 'Browser transfer access is no longer available') =>
  new ForbiddenException({ code: 'browser_transfer_forbidden', message });
type Identity = { actorId: string; sessionId: string; orgId: string; environmentId: string };
type LiveSession = { principal: Principal; expiresAt: Date };
export type BrowserTransferDependencies = {
  secret: string;
  webOrigin: string;
  apiOrigin: string;
  maxBodyBytes: number;
  now?: () => number;
  loadSession: (identity: Identity) => Promise<LiveSession | undefined>;
  authorizeResource: (principal: Principal, input: BrowserTransferInput) => Promise<void>;
};

function exactOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    if (url.origin === value && !url.username && !url.password) return url;
  } catch {
    /* Report configuration without echoing it. */
  }
  throw new ServiceUnavailableException('Browser transfer origins are not configured');
}
export function browserTransferOrigins() {
  const web = exactOrigin(process.env.WEB_ORIGIN);
  const api = exactOrigin(process.env.PUBLIC_API_URL);
  const loopback = (url: URL) => ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !(web.protocol === 'https:' && api.protocol === 'https:') &&
    !(web.protocol === 'http:' && api.protocol === 'http:' && loopback(web) && loopback(api))
  )
    throw new ServiceUnavailableException('Browser transfers require HTTPS origins');
  return { webOrigin: web.origin, apiOrigin: api.origin };
}
function bodyLimit() {
  const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(process.env.API_BODY_LIMIT ?? '40mb');
  const units: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  const result = match
    ? Math.floor(Number(match[1]) * units[(match[2] ?? 'b').toLowerCase()]!)
    : NaN;
  if (!Number.isSafeInteger(result) || result < 2)
    throw new ServiceUnavailableException('Browser transfer body limit is not configured');
  return result;
}
async function loadSession(identity: Identity): Promise<LiveSession | undefined> {
  const [row] = await sql`select m.role,e.name,s.expires_at from sessions s
    join memberships m on m.user_id=s.user_id
    join environments e on e.org_id=m.org_id
    where s.id=${identity.sessionId} and s.user_id=${identity.actorId}
    and m.org_id=${identity.orgId} and e.id=${identity.environmentId}
    and s.revoked_at is null and s.expires_at>statement_timestamp()`;
  if (!row) return undefined;
  return {
    principal: {
      ...identity,
      role: row.role as Role,
      kind: 'session',
      production: row.name === 'Production',
    },
    expiresAt: new Date(row.expires_at),
  };
}
async function authorizeResource(principal: Principal, input: BrowserTransferInput) {
  if (input.operation === 'email.send') return;
  await withTenant(sql, principal, async (tx) => {
    if (input.operation === 'email.detail' || input.operation === 'email.source') {
      const [row] = await tx`select id from messages where id=${input.message_id}`;
      if (!row) throw new NotFoundException('Email not found');
      return;
    }
    const [message] = await tx`select id from inbound_messages where id=${input.message_id}`;
    if (!message) throw new NotFoundException('Inbound message not found');
    if (input.operation === 'inbound.attachment') {
      const [file] =
        await tx`select id from inbound_attachments where id=${input.attachment_id} and inbound_id=${input.message_id}`;
      if (!file) throw new NotFoundException('Attachment not found');
    }
  });
}
function dependencies(): BrowserTransferDependencies {
  return {
    secret: config.JWT_SECRET,
    ...browserTransferOrigins(),
    maxBodyBytes: bodyLimit(),
    loadSession,
    authorizeResource,
  };
}
export function browserTransferTarget(input: BrowserTransferInput) {
  switch (input.operation) {
    case 'email.send':
      return { method: 'POST', target: '/v1/emails' };
    case 'email.detail':
      return { method: 'GET', target: `/v1/emails/${input.message_id}` };
    case 'email.source':
      return { method: 'GET', target: `/v1/emails/${input.message_id}/source` };
    case 'inbound.body':
      return { method: 'GET', target: `/v1/inbound/${input.message_id}/body` };
    case 'inbound.raw':
      return { method: 'GET', target: `/v1/inbound/${input.message_id}/raw?format=binary` };
    case 'inbound.attachment':
      return {
        method: 'GET',
        target: `/v1/inbound/${input.message_id}/attachments/${input.attachment_id}?format=binary`,
      };
  }
}
function allowedMethod(target: string): string | undefined {
  if (target === '/v1/browser-transfers' || target === '/v1/emails') return 'POST';
  const id = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  if (
    new RegExp(`^/v1/emails/${id}(?:/source)?$`).test(target) ||
    new RegExp(`^/v1/inbound/${id}/body$`).test(target) ||
    new RegExp(`^/v1/inbound/${id}/(?:raw|attachments/${id})\\?format=binary$`).test(target)
  )
    return 'GET';
  return undefined;
}
const allowedCorsHeaders = new Set([
  'authorization',
  'content-type',
  'idempotency-key',
  'traceparent',
  'x-org-id',
  'x-environment-id',
]);
/** Register before ordinary CORS and routing. Only the explicit transfer surface is handled. */
export const browserTransferCors: RequestHandler = (req, res, next) => {
  const method = allowedMethod(req.originalUrl);
  if (!method) {
    next();
    return;
  }
  if (req.method !== 'OPTIONS') {
    next();
    return;
  }
  // Shared endpoints also serve ordinary API clients (list, reschedule, etc.).
  // Their preflights retain the existing API CORS policy.
  if (req.headers['access-control-request-method'] !== method) {
    next();
    return;
  }
  try {
    const { webOrigin } = browserTransferOrigins();
    const requestedHeaders = String(req.headers['access-control-request-headers'] ?? '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
    if (
      req.headers.origin !== webOrigin ||
      req.headers['access-control-request-method'] !== method ||
      requestedHeaders.some((name) => !allowedCorsHeaders.has(name))
    )
      throw forbidden('Invalid browser transfer origin or preflight');
    res.vary('Origin');
    res.setHeader('Access-Control-Allow-Origin', webOrigin);
    res.setHeader('Access-Control-Allow-Methods', method);
    res.setHeader('Access-Control-Allow-Headers', [...allowedCorsHeaders].join(', '));
    res.setHeader('Access-Control-Max-Age', '300');
    res.status(204).end();
  } catch (error) {
    if (
      error instanceof ServiceUnavailableException &&
      req.originalUrl !== '/v1/browser-transfers'
    ) {
      next();
      return;
    }
    const status = error instanceof ServiceUnavailableException ? 503 : 403;
    res.status(status).json({
      statusCode: status,
      message: 'Browser transfer preflight unavailable or disallowed',
    });
  }
};

function uniqueHeaders(req: Request) {
  const sensitive = new Set([
    'authorization',
    'origin',
    'content-type',
    'content-length',
    'transfer-encoding',
    'content-encoding',
    'idempotency-key',
    'x-org-id',
    'x-environment-id',
  ]);
  const seen = new Set<string>();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i]!.toLowerCase();
    if (!sensitive.has(name)) continue;
    if (seen.has(name)) throw forbidden('Duplicate browser transfer headers');
    seen.add(name);
  }
}
function permitted(principal: Principal, operation: BrowserTransferOperation) {
  if (
    principal.kind !== 'session' ||
    !principal.sessionId ||
    (operation === 'email.send' ? !canSend(principal) : !can(principal, 'read'))
  )
    throw forbidden();
}
async function live(
  identity: Identity,
  operation: BrowserTransferOperation,
  options: BrowserTransferDependencies,
) {
  const session = await options.loadSession(identity);
  if (!session || session.expiresAt.getTime() <= (options.now?.() ?? Date.now())) throw forbidden();
  permitted(session.principal, operation);
  return session;
}
export async function issueBrowserTransfer(
  req: RawBodyRequest<AuthRequest>,
  body: unknown,
  options = dependencies(),
) {
  if (req.principal.kind !== 'session' || !req.principal.sessionId)
    throw forbidden('A user session is required');
  uniqueHeaders(req);
  if (req.headers.origin !== options.webOrigin && !verifiedDashboardClientAddress(req))
    throw forbidden('Invalid browser transfer origin');
  if (!Buffer.isBuffer(req.rawBody) || req.rawBody.length > 4096)
    throw new BadRequestException('Browser transfer grant requests must be at most 4096 bytes');
  const parsed = browserTransferSchema.safeParse(body);
  if (!parsed.success) throw new BadRequestException('Invalid browser transfer request');
  const input = parsed.data;
  if (input.operation === 'email.send' && input.body_bytes > options.maxBodyBytes)
    throw new BadRequestException('Browser transfer exceeds the API body limit');
  const identity = {
    actorId: req.principal.actorId,
    sessionId: req.principal.sessionId,
    orgId: req.principal.orgId,
    environmentId: req.principal.environmentId,
  };
  const session = await live(identity, input.operation, options);
  await options.authorizeResource(session.principal, input);
  const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
  const exp = Math.min(now + 300, Math.floor(session.expiresAt.getTime() / 1000));
  if (exp <= now) throw forbidden();
  const { method, target } = browserTransferTarget(input);
  const token = await new SignJWT({
    session_id: identity.sessionId,
    org_id: identity.orgId,
    environment_id: identity.environmentId,
    input,
    origin: options.webOrigin,
    method,
    target,
  })
    .setProtectedHeader({ alg: 'HS256', typ: tokenType })
    .setIssuer('flare')
    .setAudience(audience)
    .setSubject(identity.actorId)
    .setJti(randomUUID())
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(options.secret));
  return {
    url: `${options.apiOrigin}${target}`,
    method,
    token: `${prefix}${token}`,
    expires_at: new Date(exp * 1000).toISOString(),
  };
}
const claimsSchema = z
  .object({
    iss: z.literal('flare'),
    aud: z.literal(audience),
    sub: uuid,
    jti: uuid,
    iat: z.number().int().nonnegative(),
    exp: z.number().int().positive(),
    session_id: uuid,
    org_id: uuid,
    environment_id: uuid,
    input: browserTransferSchema,
    origin: z.string(),
    method: z.enum(['GET', 'POST']),
    target: z.string(),
  })
  .strict();
export async function redeemBrowserTransfer(
  req: RawBodyRequest<Request>,
  token: string,
  operation: BrowserTransferOperation | undefined,
  options = dependencies(),
): Promise<Principal> {
  if (!operation || !token.startsWith(prefix) || token.length > 8192) throw invalid();
  let claims: z.infer<typeof claimsSchema>;
  try {
    const verified = await jwtVerify(
      token.slice(prefix.length),
      new TextEncoder().encode(options.secret),
      {
        issuer: 'flare',
        audience,
        algorithms: ['HS256'],
        currentDate: new Date(options.now?.() ?? Date.now()),
      },
    );
    if (verified.protectedHeader.typ !== tokenType) throw invalid();
    claims = claimsSchema.parse(verified.payload);
    const now = Math.floor((options.now?.() ?? Date.now()) / 1000);
    if (claims.iat > now || claims.exp <= claims.iat || claims.exp - claims.iat > 300)
      throw invalid();
  } catch {
    throw invalid();
  }
  uniqueHeaders(req);
  const target = browserTransferTarget(claims.input);
  if (
    claims.input.operation !== operation ||
    claims.target !== target.target ||
    claims.method !== target.method ||
    req.originalUrl !== target.target ||
    req.method !== target.method ||
    claims.origin !== options.webOrigin ||
    req.headers.origin !== options.webOrigin
  )
    throw forbidden('Browser transfer does not match this request');
  if (claims.input.operation === 'email.send') {
    const raw = req.rawBody;
    const encoding = req.headers['content-encoding'];
    const length = req.headers['content-length'];
    const transfer = req.headers['transfer-encoding'];
    if (
      !Buffer.isBuffer(raw) ||
      raw.length !== claims.input.body_bytes ||
      raw.length > options.maxBodyBytes ||
      req.headers['content-type'] !== 'application/json' ||
      (encoding !== undefined && encoding !== 'identity') ||
      (length !== undefined &&
        (typeof length !== 'string' ||
          !/^(0|[1-9][0-9]*)$/.test(length) ||
          BigInt(length) !== BigInt(raw.length))) ||
      (transfer !== undefined && (transfer !== 'chunked' || length !== undefined)) ||
      req.headers['idempotency-key'] !== claims.input.idempotency_key ||
      createHash('sha256').update(raw).digest('hex') !== claims.input.body_sha256
    )
      throw forbidden('Browser transfer body or idempotency key does not match');
  } else if (
    req.rawBody?.length ||
    (req.headers['content-length'] && req.headers['content-length'] !== '0') ||
    req.headers['transfer-encoding']
  )
    throw forbidden('Browser download requests must have no body');
  const session = await live(
    {
      actorId: claims.sub,
      sessionId: claims.session_id,
      orgId: claims.org_id,
      environmentId: claims.environment_id,
    },
    operation,
    options,
  );
  return session.principal;
}
