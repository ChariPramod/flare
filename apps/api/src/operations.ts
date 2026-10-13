import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import { decrypt, encrypt, webhookSecret, verifyWebhook, csvCell } from '@flare/shared';
import { mirrorEngineEvent, replayWebhook, webhookUrl } from '@flare/platform';
import { Access, Public } from './auth.js';
import { config, parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
const uuid = z.string().uuid();
const hookSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    url: z
      .string()
      .url()
      .max(2000)
      .superRefine((value, ctx) => {
        try {
          webhookUrl(value);
        } catch (error) {
          ctx.addIssue({
            code: 'custom',
            message: error instanceof Error ? error.message : 'Invalid URL',
          });
        }
      }),
    events: z
      .array(z.string().regex(/^(\*|[a-z_]+\.(\*|[a-z_.]+))$/))
      .min(1)
      .max(100)
      .default(['*']),
    enabled: z.boolean().default(true),
  })
  .strict();
const pages = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const logQuery = pages.extend({
  q: z.string().max(200).default(''),
  status: z.coerce.number().int().min(100).max(599).optional(),
  status_class: z.coerce.number().int().min(1).max(5).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});
const endpointFields = 'id, name, url, events, enabled, disabled_reason, created_at, updated_at';
@Controller('v1')
export class OperationsController {
  @Get('webhooks') async endpoints(@Req() req: AuthRequest) {
    return withTenant(sql, req.principal, (tx) =>
      tx.unsafe(`select ${endpointFields} from webhook_endpoints order by created_at desc`),
    );
  }
  @Access('manage_integrations') @Post('webhooks') async createEndpoint(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = parse(hookSchema, body),
      id = randomUUID(),
      secret = webhookSecret();
    return withTenant(sql, req.principal, async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${req.principal.orgId}/${req.principal.environmentId}/webhooks`},0))`;
      const [count] = await tx`select count(*)::int as n from webhook_endpoints`;
      if (Number(count?.n) >= 100)
        throw new BadRequestException('At most 100 endpoints per environment');
      const cipher = encrypt(
        secret,
        config.FLARE_ENCRYPTION_KEY,
        `${req.principal.orgId}/${req.principal.environmentId}/webhook/${id}`,
      );
      await tx`insert into webhook_endpoints(id,org_id,environment_id,name,url,events,enabled,secret_cipher) values(${id},${req.principal.orgId},${req.principal.environmentId},${input.name},${input.url},${tx.json(input.events)},${input.enabled},${cipher})`;
      await audit(tx, req.principal, 'webhook.created', id);
      return { id, ...input, secret };
    });
  }
  @Access('manage_integrations') @Patch('webhooks/:id') async updateEndpoint(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
    @Body() body: unknown,
  ) {
    const id = parse(uuid, raw),
      input = parse(hookSchema.partial(), body);
    return withTenant(sql, req.principal, async (tx) => {
      const [old] = await tx`select * from webhook_endpoints where id=${id} for update`;
      if (!old) throw new NotFoundException();
      const values = {
        name: input.name ?? String(old.name),
        url: input.url ?? String(old.url),
        events: input.events ?? (old.events as string[]),
        enabled: input.enabled ?? Boolean(old.enabled),
      };
      await tx`update webhook_endpoints set name=${values.name},url=${values.url},events=${tx.json(values.events)},enabled=${values.enabled},disabled_reason=${values.enabled ? null : old.disabled_reason},updated_at=now() where id=${id}`;
      if (values.enabled)
        await tx`update operation_alerts set resolved_at=now() where resource_id=${id} and kind='webhook.disabled' and resolved_at is null`;
      await audit(tx, req.principal, 'webhook.updated', id);
      return { id, ...values };
    });
  }
  @Access('manage_integrations') @Post('webhooks/:id/rotate') async rotate(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
  ) {
    const id = parse(uuid, raw),
      secret = webhookSecret(),
      cipher = encrypt(
        secret,
        config.FLARE_ENCRYPTION_KEY,
        `${req.principal.orgId}/${req.principal.environmentId}/webhook/${id}`,
      );
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update webhook_endpoints set previous_secret_cipher=secret_cipher,previous_secret_until=now()+interval '24 hours',secret_cipher=${cipher},updated_at=now() where id=${id} returning id`;
      if (!row) throw new NotFoundException();
      await audit(tx, req.principal, 'webhook.secret_rotated', id);
      return { id, secret, previous_secret_grace_hours: 24 };
    });
  }
  @Access('manage_integrations') @Post('webhooks/:id/test') async testEndpoint(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
  ) {
    const id = parse(uuid, raw);
    return withTenant(sql, req.principal, async (tx) => {
      const [endpoint] = await tx`select enabled from webhook_endpoints where id=${id}`;
      if (!endpoint) throw new NotFoundException();
      if (!endpoint.enabled)
        throw new BadRequestException('Enable the endpoint before sending a test');
      const [event] =
        await tx`insert into event_outbox(org_id,environment_id,type,data,target_endpoint_id) values(${req.principal.orgId},${req.principal.environmentId},'webhook.test',${tx.json({ message: 'Flare webhook connection test' })},${id}) returning id`;
      await audit(tx, req.principal, 'webhook.test_requested', id);
      return { id: event!.id };
    });
  }
  @Get('webhook-deliveries') async deliveries(@Req() req: AuthRequest, @Query() raw: unknown) {
    const q = parse(
      pages.extend({
        endpoint_id: uuid.optional(),
        status: z.enum(['pending', 'delivering', 'delivered', 'failed']).optional(),
      }),
      raw,
    );
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select d.*,e.name as endpoint_name,o.type from webhook_deliveries d join webhook_endpoints e on e.id=d.endpoint_id and e.org_id=d.org_id and e.environment_id=d.environment_id join event_outbox o on o.id=d.event_id and o.org_id=d.org_id and o.environment_id=d.environment_id where (${q.endpoint_id ?? null}::uuid is null or d.endpoint_id=${q.endpoint_id ?? null}) and (${q.status ?? null}::text is null or d.status=${q.status ?? null}) order by d.created_at desc limit ${q.limit} offset ${(q.page - 1) * q.limit}`,
      page: q.page,
      limit: q.limit,
    }));
  }
  @Get('webhook-deliveries/:id') async delivery(@Req() req: AuthRequest, @Param('id') raw: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const id = parse(uuid, raw),
        [row] = await tx`select * from webhook_deliveries where id=${id}`;
      if (!row) throw new NotFoundException();
      return {
        ...row,
        attempts: await tx`select * from webhook_attempts where delivery_id=${id} order by ordinal`,
      };
    });
  }
  @Access('manage_integrations') @Post('webhook-deliveries/:id/replay') async replay(
    @Req() req: AuthRequest,
    @Param('id') raw: string,
  ) {
    const id = parse(uuid, raw);
    try {
      const result = await replayWebhook(sql, req.principal, id);
      await withTenant(sql, req.principal, (tx) =>
        audit(tx, req.principal, 'webhook.replayed', id),
      );
      return result;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Replay failed');
    }
  }
  @Get('operation-alerts') async alerts(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select * from operation_alerts where resolved_at is null order by created_at desc limit 100`,
    );
  }
  @Get('logs') async logs(@Req() req: AuthRequest, @Query() raw: unknown) {
    const q = parse(logQuery, raw);
    return { data: await this.logRows(req, q, q.limit), page: q.page, limit: q.limit };
  }
  @Get('logs/export') async exportLogs(
    @Req() req: AuthRequest,
    @Query() raw: unknown,
    @Res() res: Response,
  ) {
    const rows = await this.logRows(req, { ...parse(logQuery, raw), page: 1 }, 10000),
      columns = ['id', 'method', 'path', 'status', 'key_id', 'latency_ms', 'created_at'];
    res
      .type('text/csv')
      .setHeader('Content-Disposition', 'attachment; filename="flare-requests.csv"');
    res.send(
      [
        columns.join(','),
        ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(',')),
      ].join('\r\n'),
    );
  }
  @Get('logs/:id') async log(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] = await tx`select * from request_logs where id=${parse(uuid, id)}`;
      if (!row) throw new NotFoundException();
      return row;
    });
  }
  private logRows(req: AuthRequest, q: z.infer<typeof logQuery>, limit: number) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select * from request_logs where (id::text ilike ${`%${q.q}%`} or path ilike ${`%${q.q}%`}) and (${q.status ?? null}::int is null or status=${q.status ?? null}) and (${q.status_class ?? null}::int is null or status/100=${q.status_class ?? null}) and (${q.method ?? null}::text is null or method=${q.method ?? null}) and (${q.from ?? null}::timestamptz is null or created_at>=${q.from ?? null}::timestamptz) and (${q.to ?? null}::timestamptz is null or created_at<=${q.to ?? null}::timestamptz) order by created_at desc limit ${limit} offset ${(q.page - 1) * q.limit}`,
    );
  }
  @Public() @Post('events/novu/:environment') async engineEvent(
    @Req() req: RawBodyRequest<Request>,
    @Param('environment') raw: string,
  ) {
    const [environment] =
      await sql`select org_id,id,novu_webhook_secret_cipher from environments where id=${parse(uuid, raw)}`;
    if (!environment?.novu_webhook_secret_cipher || !req.rawBody)
      throw new UnauthorizedException('Novu callback not configured');
    const tenant = { orgId: String(environment.org_id), environmentId: String(environment.id) };
    let value: unknown;
    try {
      value = verifyWebhook(
        decrypt(
          String(environment.novu_webhook_secret_cipher),
          config.FLARE_ENCRYPTION_KEY,
          `${tenant.orgId}/${tenant.environmentId}/novu-webhook`,
        ),
        req.rawBody.toString('utf8'),
        {
          'svix-id': req.get('svix-id'),
          'svix-timestamp': req.get('svix-timestamp'),
          'svix-signature': req.get('svix-signature'),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid Novu callback signature');
    }
    const event = parse(
      z
        .object({
          type: z.string().regex(/^(workflow|message|notification)\.[a-z_.]+$/),
          data: z.record(z.unknown()),
        })
        .passthrough(),
      value,
    );
    return mirrorEngineEvent(sql, tenant, req.get('svix-id')!, event.type, toJson(event.data));
  }
}
