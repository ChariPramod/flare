import { timingSafeEqual } from 'node:crypto';
import {
  All,
  BadGatewayException,
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpException,
  NotFoundException,
  PayloadTooLargeException,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { z } from 'zod';
import { withTenant } from '@flare/db';
import { can, hashToken } from '@flare/shared';
import type { Principal, Role } from '@flare/shared';
import { Access } from './auth.js';
import { redis, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { verifiedDashboardClientAddress } from './dashboard-forwarding.js';
import { subscriberInboxAccess } from './workflows.js';

const requestLimit = 64 * 1024;
const responseLimit = 2 * 1024 * 1024;
const bindingMaxSeconds = 12 * 60 * 60;
const prefix = '/v1/dashboard/inbox/';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const notificationId = '[a-fA-F0-9]{24}';
const tag = z.string().min(1).max(128);
const tags = z.union([
  z.array(tag).max(20),
  z.object({ or: z.array(tag).max(20) }).strict(),
  z.object({ and: z.array(z.object({ or: z.array(tag).max(20) }).strict()).max(10) }).strict(),
]);
const scalar = z.union([z.string().max(1024), z.number().finite(), z.boolean(), z.null()]);
const valueFilter = z.union([
  scalar,
  z.array(scalar).max(20),
  z.object({ or: z.array(scalar).max(20) }).strict(),
  z.object({ and: z.array(z.object({ or: z.array(scalar).max(20) }).strict()).max(10) }).strict(),
]);
const dataKey = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,128}$/)
  .refine((value) => !['__proto__', 'constructor', 'prototype'].includes(value));
const dataFilter = z.record(dataKey, z.union([valueFilter, z.record(dataKey, valueFilter)]));
const serializedData = z
  .string()
  .max(8192)
  .superRefine((value, ctx) => {
    try {
      if (dataFilter.safeParse(JSON.parse(value)).success) return;
    } catch {
      /* Invalid JSON is rejected without returning its contents. */
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid notification filter' });
  });
const severity = z.enum(['high', 'medium', 'low', 'none']);
const filter = z
  .object({
    tags: tags.optional(),
    data: dataFilter.optional(),
    read: z.boolean().optional(),
    archived: z.boolean().optional(),
    snoozed: z.boolean().optional(),
    seen: z.boolean().optional(),
    severity: z.union([severity, z.array(severity).max(4)]).optional(),
    createdGte: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    createdLte: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const channels = z
  .object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    in_app: z.boolean().optional(),
    chat: z.boolean().optional(),
    push: z.boolean().optional(),
    tool: z.boolean().optional(),
  })
  .strict();
const time = z
  .string()
  .regex(/^(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|(?:0[1-9]|1[0-2]):[0-5][0-9] (?:AM|PM))$/);
const day = z
  .object({
    isEnabled: z.boolean(),
    hours: z
      .array(z.object({ start: time, end: time }).strict())
      .max(24)
      .optional(),
  })
  .strict();
const schedule = z
  .object({
    isEnabled: z.boolean().optional(),
    weeklySchedule: z
      .object({
        monday: day.optional(),
        tuesday: day.optional(),
        wednesday: day.optional(),
        thursday: day.optional(),
        friday: day.optional(),
        saturday: day.optional(),
        sunday: day.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const bootstrap = z
  .object({
    applicationIdentifier: z.string().min(1).max(128),
    subscriberHash: z.string().regex(/^[a-f0-9]{64}$/i),
    subscriber: z
      .object({
        subscriberId: z.string().min(1).max(128),
        // The pinned SDK adds the browser timezone automatically. Bootstrap is
        // read access, so accept that transport detail without updating a profile.
        timezone: z.string().min(1).max(128).optional(),
      })
      .strict()
      .transform(({ subscriberId }) => ({ subscriberId })),
  })
  .strict();
const bulk = z.object({ tags: tags.optional(), data: serializedData.optional() }).strict();
const bindingSchema = z
  .object({
    version: z.literal(1),
    sessionId: z.string().uuid(),
    actorId: z.string().uuid(),
    orgId: z.string().uuid(),
    environmentId: z.string().uuid(),
    subscriberId: z.string().min(1).max(128),
    subscriberRecordId: z.string().uuid(),
    applicationIdentifier: z.string().min(1).max(128),
    expiresAt: z.number().int().positive(),
  })
  .strict();
type Binding = z.infer<typeof bindingSchema>;

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Unsupported Inbox request');
  return parsed.data;
}
function queryFields(search: string, allowed: Set<string>, repeated: Set<string> = new Set()) {
  const query = new URLSearchParams(search),
    seen = new Set<string>();
  if (Buffer.byteLength(search) > 8192) throw new BadRequestException('Inbox query too large');
  for (const [key, value] of query) {
    if (!allowed.has(key) || (!repeated.has(key) && seen.has(key)) || value.length > 8192)
      throw new BadRequestException('Unsupported Inbox query');
    seen.add(key);
  }
  return query;
}

/** Pinned to @novu/js 3.19.0's default Inbox service, excluding admin/keyless/OAuth surfaces. */
export function dashboardInboxOperation(method: string, target: string, body: unknown) {
  const [path, search = '', ...extra] = target.split('?');
  if (!path?.startsWith(prefix) || extra.length || /[%\\#\s]/.test(path))
    throw new NotFoundException();
  const route = path.slice(prefix.length);
  let parsed: unknown;
  let query = new URLSearchParams();
  if (method === 'POST' && route === 'session') {
    parsed = validate(bootstrap, body);
  } else if (
    method === 'GET' &&
    ['notifications', 'preferences', 'preferences/global'].includes(route)
  ) {
    const notifications = route === 'notifications';
    const repeated = new Set(['tags[]', 'severity[]']);
    const allowed = new Set([
      'tags[]',
      'severity',
      'severity[]',
      ...(notifications
        ? [
            'limit',
            'after',
            'offset',
            'read',
            'archived',
            'snoozed',
            'seen',
            'data',
            'createdGte',
            'createdLte',
          ]
        : route === 'preferences'
          ? ['criticality']
          : []),
    ]);
    if (route === 'preferences/global') allowed.clear();
    // The pinned client serializes AND tag groups as tags[0][], tags[1][], ... .
    if (notifications)
      for (let i = 0; i < 10; i++) {
        allowed.add(`tags[${i}][]`);
        repeated.add(`tags[${i}][]`);
      }
    query = queryFields(search, allowed, repeated);
    for (const [key, value] of query) {
      if (key.startsWith('tags')) validate(tag, value);
      else if (key.startsWith('severity')) validate(severity, value);
      else if (['read', 'archived', 'snoozed', 'seen'].includes(key))
        validate(z.enum(['true', 'false']), value);
      else if (key === 'after')
        validate(z.string().regex(new RegExp(`^${notificationId}$`)), value);
      else if (key === 'data') validate(serializedData, value);
      else if (key === 'criticality') validate(z.enum(['critical', 'nonCritical', 'all']), value);
      else
        validate(
          z
            .string()
            .regex(/^(0|[1-9][0-9]*)$/)
            .refine(
              (v) =>
                Number.isSafeInteger(Number(v)) &&
                Number(v) <=
                  (key === 'limit' ? 100 : key === 'offset' ? 10000 : Number.MAX_SAFE_INTEGER) &&
                (key !== 'limit' || Number(v) >= 1),
            ),
          value,
        );
    }
    if ([...query].length > 100) throw new BadRequestException('Too many Inbox filters');
  } else if (method === 'GET' && route === 'notifications/count') {
    query = queryFields(search, new Set(['filters']));
    try {
      validate(z.array(filter).min(1).max(20), JSON.parse(query.get('filters') ?? '[{}]'));
    } catch {
      throw new BadRequestException('Unsupported Inbox count filter');
    }
  } else if (
    method === 'PATCH' &&
    new RegExp(`^notifications/${notificationId}/(read|unread|archive|unarchive|unsnooze)$`).test(
      route,
    )
  ) {
    parsed = validate(z.object({}).strict(), body ?? {});
  } else if (
    method === 'DELETE' &&
    new RegExp(`^notifications/${notificationId}/delete$`).test(route)
  ) {
    parsed = validate(z.object({}).strict(), body ?? {});
  } else if (
    method === 'PATCH' &&
    new RegExp(`^notifications/${notificationId}/snooze$`).test(route)
  ) {
    parsed = validate(
      z.object({ snoozeUntil: z.string().datetime({ offset: true }) }).strict(),
      body,
    );
  } else if (
    method === 'PATCH' &&
    new RegExp(`^notifications/${notificationId}/(complete|revert)$`).test(route)
  ) {
    parsed = validate(z.object({ actionType: z.enum(['primary', 'secondary']) }).strict(), body);
  } else if (
    method === 'POST' &&
    /^notifications\/(read|archive|read-archive|delete)$/.test(route)
  ) {
    parsed = validate(bulk, body ?? {});
  } else if (method === 'POST' && route === 'notifications/seen') {
    parsed = validate(
      bulk.extend({
        notificationIds: z
          .array(z.string().regex(new RegExp(`^${notificationId}$`)))
          .max(100)
          .optional(),
      }),
      body ?? {},
    );
  } else if (method === 'PATCH' && route === 'preferences') {
    parsed = validate(channels.extend({ schedule: schedule.optional() }), body);
  } else if (method === 'PATCH' && route === 'preferences/bulk') {
    parsed = validate(
      z
        .object({
          preferences: z
            .array(channels.extend({ workflowId: id }))
            .min(1)
            .max(100),
        })
        .strict(),
      body,
    );
  } else if (
    method === 'PATCH' &&
    /^preferences\/[a-zA-Z0-9_-]{1,128}$/.test(route) &&
    route !== 'preferences/global'
  ) {
    parsed = validate(channels, body);
  } else throw new NotFoundException('Inbox route not found');
  if (method !== 'GET' && search)
    throw new BadRequestException('Inbox action queries are unsupported');
  if (method === 'GET' && body !== undefined)
    throw new BadRequestException('Inbox GET bodies are unsupported');
  return {
    route,
    target: `/v1/inbox/${route}${query.size ? `?${query.toString()}` : ''}`,
    body: parsed,
  };
}

type Dependencies = {
  liveSession(
    principal: Principal,
    signal?: AbortSignal,
  ): Promise<{ remainingSeconds: number; role: Role } | undefined>;
  subscriber(
    principal: Principal,
    subscriberId: string,
    signal?: AbortSignal,
  ): Promise<{ id: string; applicationIdentifier: string } | undefined>;
  credentials(
    principal: Principal,
    subscriberId: string,
  ): Promise<{ subscriberHash: string; applicationIdentifier: unknown }>;
  redis: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, expiry: 'EX', ttl: number, condition: 'NX'): Promise<unknown>;
  };
  fetch: typeof fetch;
  nativeOrigin(): string;
  now(): number;
};
async function responseJson(response: Response) {
  if (Number(response.headers.get('content-length')) > responseLimit) {
    await response.body?.cancel().catch(() => undefined);
    throw new BadGatewayException('Inbox response exceeds the supported size');
  }
  if (response.status === 204) return undefined;
  const reader = response.body?.getReader();
  if (!reader) throw new BadGatewayException('Inbox response unavailable');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > responseLimit) {
        await reader.cancel().catch(() => undefined);
        throw new BadGatewayException('Inbox response exceeds the supported size');
      }
      chunks.push(item.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BadGatewayException('Inbox response unavailable');
  } finally {
    reader.releaseLock();
  }
}
function sameContext(binding: Binding, principal: Principal) {
  return (
    binding.sessionId === principal.sessionId &&
    binding.actorId === principal.actorId &&
    binding.orgId === principal.orgId &&
    binding.environmentId === principal.environmentId
  );
}
const tokenPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/;
function nativeToken(value: unknown) {
  if (typeof value !== 'string' || value.length > 8192 || !tokenPattern.test(value))
    throw new UnauthorizedException('An initialized Inbox session is required');
  return value;
}

export function createDashboardInboxGateway(deps: Dependencies) {
  async function storeRead(key: string) {
    try {
      return await deps.redis.get(key);
    } catch {
      throw new ServiceUnavailableException('Inbox session store unavailable');
    }
  }
  return async (req: AuthRequest) => {
    const principal = req.principal;
    if (verifiedDashboardClientAddress(req) === undefined)
      throw new ForbiddenException('Verified dashboard forwarding required');
    if (principal?.kind !== 'session' || !principal.sessionId)
      throw new ForbiddenException('A dashboard user session is required');
    const live = await deps.liveSession(principal);
    if (!live || !Number.isFinite(live.remainingSeconds) || live.remainingSeconds < 1)
      throw new UnauthorizedException('Dashboard session is no longer active');
    const sessionDeadline = deps.now() + live.remainingSeconds * 1000;
    const currentPrincipal = { ...principal, role: live.role };
    if (!can(currentPrincipal, 'read')) throw new ForbiddenException();
    const raw = (req as AuthRequest & { rawBody?: Buffer }).rawBody;
    if ((raw?.length ?? Buffer.byteLength(JSON.stringify(req.body) ?? '')) > requestLimit)
      throw new PayloadTooLargeException('Inbox request too large');
    const operation = dashboardInboxOperation(req.method, req.originalUrl, req.body);
    const isBootstrap = operation.route === 'session';
    if (req.method !== 'GET' && !isBootstrap && !can(currentPrincipal, 'write'))
      throw new ForbiddenException('Your role cannot modify this Inbox');
    let token: string | undefined, binding: Binding | undefined, subscriberId: string;
    const now = deps.now();
    const bindingKey = (value: string) =>
      `dashboard-inbox:v1:${principal.sessionId}:${hashToken(value)}`;
    if (isBootstrap) {
      if (req.headers['x-flare-inbox-authorization'] !== undefined)
        throw new BadRequestException('Inbox bootstrap must not reuse a native token');
      const input = operation.body as z.infer<typeof bootstrap>;
      subscriberId = input.subscriber.subscriberId;
      const expected = await deps.credentials(principal, subscriberId);
      const expectedHash = Buffer.from(expected.subscriberHash),
        suppliedHash = Buffer.from(input.subscriberHash);
      if (
        input.applicationIdentifier !== expected.applicationIdentifier ||
        expectedHash.length !== suppliedHash.length ||
        !timingSafeEqual(expectedHash, suppliedHash)
      )
        throw new ForbiddenException('Invalid subscriber credentials');
    } else {
      const authorization = req.headers['x-flare-inbox-authorization'];
      token = nativeToken(
        typeof authorization === 'string' ? authorization.match(/^Bearer (\S+)$/)?.[1] : undefined,
      );
      const stored = await storeRead(bindingKey(token));
      try {
        binding = bindingSchema.parse(JSON.parse(stored ?? 'null'));
      } catch {
        throw new UnauthorizedException('Inbox session is not bound to this dashboard');
      }
      if (!sameContext(binding, principal) || binding.expiresAt <= now)
        throw new UnauthorizedException('Inbox session is not bound to this dashboard');
      subscriberId = binding.subscriberId;
    }
    const subscriber = await deps.subscriber(principal, subscriberId);
    if (
      !subscriber ||
      (isBootstrap &&
        subscriber.applicationIdentifier !==
          (operation.body as z.infer<typeof bootstrap>).applicationIdentifier) ||
      (binding &&
        (binding.subscriberRecordId !== subscriber.id ||
          binding.applicationIdentifier !== subscriber.applicationIdentifier))
    )
      throw new ForbiddenException('Subscriber access is no longer available');
    let origin: URL;
    try {
      const configured = deps.nativeOrigin();
      origin = new URL(configured);
      if (
        !['http:', 'https:'].includes(origin.protocol) ||
        origin.origin !== configured ||
        origin.username ||
        origin.password
      )
        throw new Error();
    } catch {
      throw new ServiceUnavailableException('Inbox backend configuration required');
    }
    let response: Response;
    try {
      response = await deps.fetch(`${origin.origin}${operation.target}`, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'Novu-API-Version': '2024-06-26',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: operation.body === undefined ? undefined : JSON.stringify(operation.body),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadGatewayException('Inbox is unavailable');
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      const status = [400, 401, 403, 404, 409, 429].includes(response.status)
        ? response.status
        : 502;
      throw new HttpException('Inbox request could not be completed', status);
    }
    const payload = await responseJson(response);
    if (isBootstrap) {
      const envelope = payload as { data?: { token?: unknown }; token?: unknown } | undefined;
      try {
        token = nativeToken(envelope?.data?.token ?? envelope?.token);
      } catch {
        throw new BadGatewayException('Inbox session initialization failed');
      }
      let nativeExpiry: number;
      try {
        const claims = JSON.parse(
          Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'),
        ) as { exp?: number };
        if (!Number.isSafeInteger(claims.exp) || claims.exp! * 1000 <= now) throw new Error();
        nativeExpiry = claims.exp! * 1000;
      } catch {
        throw new BadGatewayException('Inbox session expiry unavailable');
      }
      const ttl = Math.floor(
        Math.min(
          bindingMaxSeconds,
          (sessionDeadline - deps.now()) / 1000,
          (nativeExpiry - deps.now()) / 1000,
        ),
      );
      if (ttl < 1) throw new UnauthorizedException('Dashboard or Inbox session expired');
      binding = {
        version: 1,
        sessionId: principal.sessionId,
        actorId: principal.actorId,
        orgId: principal.orgId,
        environmentId: principal.environmentId,
        subscriberId,
        subscriberRecordId: subscriber.id,
        applicationIdentifier: subscriber.applicationIdentifier,
        expiresAt: deps.now() + ttl * 1000,
      };
      const key = bindingKey(token);
      let result;
      try {
        result = await deps.redis.set(key, JSON.stringify(binding), 'EX', ttl, 'NX');
      } catch {
        throw new ServiceUnavailableException('Inbox session store unavailable');
      }
      if (result === null) {
        let previous: Binding;
        try {
          previous = bindingSchema.parse(JSON.parse((await storeRead(key)) ?? 'null'));
        } catch (error) {
          if (error instanceof ServiceUnavailableException) throw error;
          throw new ServiceUnavailableException('Inbox session binding unavailable');
        }
        if (
          !sameContext(previous, principal) ||
          previous.subscriberRecordId !== subscriber.id ||
          previous.subscriberId !== subscriberId ||
          previous.applicationIdentifier !== subscriber.applicationIdentifier ||
          previous.expiresAt <= deps.now()
        )
          throw new ServiceUnavailableException(
            'Inbox session binding conflicts with this context',
          );
      } else if (result !== 'OK')
        throw new ServiceUnavailableException('Inbox session store unavailable');
    }
    return { status: response.status, body: payload };
  };
}

async function abortableQuery<T>(
  query: PromiseLike<T> & { cancel(): void },
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const cancel = () => query.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await query;
    signal?.throwIfAborted();
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

type AuthorityDependencies = Pick<Dependencies, 'liveSession' | 'subscriber' | 'redis' | 'now'>;
export const dashboardInboxAuthority: AuthorityDependencies = {
  async liveSession(principal, signal) {
    const [session] = await abortableQuery(
      sql`select m.role, extract(epoch from (s.expires_at-clock_timestamp())) as remaining
      from sessions s join memberships m on m.user_id=s.user_id and m.org_id=${principal.orgId}
      join environments e on e.org_id=m.org_id and e.id=${principal.environmentId}
      where s.id=${principal.sessionId!} and s.user_id=${principal.actorId}
      and s.revoked_at is null and s.expires_at>clock_timestamp()`,
      signal,
    );
    return session
      ? { role: session.role as Role, remainingSeconds: Number(session.remaining) }
      : undefined;
  },
  async subscriber(principal, subscriberId, signal) {
    signal?.throwIfAborted();
    const [row] = await withTenant(sql, principal, (tx) =>
      abortableQuery(
        tx`select s.id,e.novu_application_id
      from subscribers s join environments e on e.id=s.environment_id and e.org_id=s.org_id
      where s.subscriber_id=${subscriberId}`,
        signal,
      ),
    );
    return row?.novu_application_id
      ? { id: String(row.id), applicationIdentifier: String(row.novu_application_id) }
      : undefined;
  },
  redis,
  now: Date.now,
};

/** A session identifier is not authority: the signed HTTP bootstrap must have bound this token. */
export function createDashboardInboxSocketAuthority(deps: AuthorityDependencies) {
  return async (sessionId: string, token: string, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!z.string().uuid().safeParse(sessionId).success) throw new UnauthorizedException();
    nativeToken(token);
    const stored = await deps.redis.get(`dashboard-inbox:v1:${sessionId}:${hashToken(token)}`);
    signal.throwIfAborted();
    const parsed = bindingSchema.safeParse(JSON.parse(stored ?? 'null'));
    if (
      !parsed.success ||
      parsed.data.sessionId !== sessionId ||
      parsed.data.expiresAt <= deps.now()
    )
      throw new UnauthorizedException();
    const binding = parsed.data;
    const principal: Principal = {
      kind: 'session',
      role: 'viewer',
      production: false,
      sessionId,
      actorId: binding.actorId,
      orgId: binding.orgId,
      environmentId: binding.environmentId,
    };
    const started = deps.now();
    const live = await deps.liveSession(principal, signal);
    signal.throwIfAborted();
    if (
      !live ||
      !Number.isFinite(live.remainingSeconds) ||
      live.remainingSeconds <= 0 ||
      !can({ ...principal, role: live.role }, 'read')
    )
      throw new UnauthorizedException();
    const subscriber = await deps.subscriber(principal, binding.subscriberId, signal);
    signal.throwIfAborted();
    const expiresAt = Math.min(binding.expiresAt, started + live.remainingSeconds * 1000);
    if (
      !subscriber ||
      subscriber.id !== binding.subscriberRecordId ||
      subscriber.applicationIdentifier !== binding.applicationIdentifier ||
      expiresAt <= deps.now()
    )
      throw new UnauthorizedException();
    return { ...binding, expiresAt };
  };
}

const gateway = createDashboardInboxGateway({
  ...dashboardInboxAuthority,
  credentials: subscriberInboxAccess,
  fetch: (...args) => fetch(...args),
  nativeOrigin: () => process.env.NOVU_API_URL ?? 'http://novu-api:3000',
});

@ApiExcludeController()
@Access('read')
@Controller('v1/dashboard/inbox')
export class DashboardInboxController {
  @All('*path') async proxy(@Req() req: AuthRequest, @Res() res: ExpressResponse) {
    const result = await gateway(req);
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status);
    if (result.body === undefined) res.end();
    else res.json(result.body);
  }
}
