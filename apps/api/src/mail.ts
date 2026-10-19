import { Body, Controller, Get, Post, Patch, Delete, Param, Req, Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import {
  submitEmails,
  changeSchedule,
  objectStore,
  configuredTransports,
  MailError,
  domainSchema,
  domainRecords,
  generateDomain,
  requiredTls,
  outbox,
  mailLimits,
  removeManualSuppression,
  protectSuppression,
  SendingPolicyError,
  getSendingPolicy,
  sendingReadiness,
} from '@flare/mail';
import { Access } from './auth.js';
import { config, parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
const uuid = z.string().uuid();
const store = objectStore();
export function mailOptions() {
  try {
    return {
      sql,
      store,
      encryptionKey: config.FLARE_ENCRYPTION_KEY,
      trackingKey: config.JWT_SECRET,
      transports: configuredTransports(),
    };
  } catch {
    throw new MailError(503, 'Email transports are not configured');
  }
}
@Catch(MailError)
export class MailExceptionFilter implements ExceptionFilter {
  catch(error: MailError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof SendingPolicyError && error.retryAfter)
      response.setHeader('Retry-After', String(error.retryAfter));
    response.status(error.status).json({
      statusCode: error.status,
      message: error.message,
      ...(error instanceof SendingPolicyError ? { code: error.code } : {}),
    });
  }
}
@Controller('v1')
export class MailController {
  @Get('email-capabilities') capabilities() {
    const limits = mailLimits();
    return {
      attachment_max_bytes: limits.attachments,
      attachment_max_count: 50,
      mime_max_bytes: limits.mime,
    };
  }
  @Get('sending-policy') async sendingPolicy(@Req() req: AuthRequest) {
    return getSendingPolicy(sql, req.principal.orgId);
  }
  @Access('send') @Post('emails') async send(@Req() req: AuthRequest, @Body() body: unknown) {
    const result = await submitEmails(mailOptions(), req.principal, [body], {
      key: req.get('idempotency-key'),
    });
    return result.data[0];
  }
  @Access('send') @Post('emails/batch') async batch(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    const input = Array.isArray(body)
      ? { emails: body, validation: 'strict' as const }
      : parse(
          z
            .object({
              emails: z.array(z.unknown()).min(1).max(100),
              validation: z.enum(['strict', 'permissive']).default('strict'),
            })
            .strict(),
          body,
        );
    return submitEmails(mailOptions(), req.principal, input.emails, {
      key: req.get('idempotency-key'),
      mode: input.validation,
      batch: true,
    });
  }
  @Get('emails') async list(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select id,domain_id,request->>'from' as "from",request->>'subject' as subject,status,scheduled_at,next_attempt_at,hold_reason,traffic_class,created_at from messages where (${req.principal.domainId ?? null}::uuid is null or domain_id=${req.principal.domainId ?? null}) order by created_at desc limit 100`,
    );
  }
  @Get('emails/:id') async get(@Req() req: AuthRequest, @Param('id') id: string) {
    id = parse(uuid, id);
    return withTenant(sql, req.principal, async (tx) => {
      const [message] =
        await tx`select id,domain_id,request,status,scheduled_at,next_attempt_at,delivery_started_at,hold_reason,traffic_class,route_snapshot,error,created_at,updated_at from messages where id=${id}`;
      if (!message || (req.principal.domainId && req.principal.domainId !== message.domain_id))
        throw new MailError(404, 'Email not found');
      return {
        ...message,
        recipients:
          await tx`select address,kind,status from message_recipients where message_id=${id}`,
        events:
          await tx`select type,recipient,data,created_at from delivery_events where message_id=${id} order by created_at`,
        attempts:
          await tx`select provider,instance_id,ordinal,status,error,diagnostics,started_at,finished_at from transport_attempts where message_id=${id} order by ordinal`,
      };
    });
  }
  @Get('emails/:id/source') async source(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.get(req, id);
    const [message] = await withTenant(
      sql,
      req.principal,
      (tx) => tx`select mime_key from messages where id=${id}`,
    );
    if (!message?.mime_key) throw new MailError(404, 'This message has no MIME source');
    return {
      source: (await store.get(String(message.mime_key), mailLimits().mime)).toString('utf8'),
    };
  }
  @Access('send') @Patch('emails/:id') async reschedule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ scheduled_at: z.string() }).strict(), body);
    return changeSchedule(sql, req.principal, parse(uuid, id), input.scheduled_at);
  }
  @Access('send') @Post('emails/:id/cancel') async cancel(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ) {
    return changeSchedule(sql, req.principal, parse(uuid, id), null);
  }
  @Get('domains') async domains(@Req() req: AuthRequest) {
    let transports: ReturnType<typeof configuredTransports> = [];
    try {
      transports = configuredTransports();
    } catch {
      /* Report configuration outage as a readiness blocker. */
    }
    return withTenant(sql, req.principal, async (tx) => {
      const rows =
        await tx`select id,name,region,status,sending,receiving,open_tracking,click_tracking,tracking_subdomain,enforce_tls,records,dmarc_evidence,checked_at,verified_at,next_check_at,created_at from domains where (${req.principal.domainId ?? null}::uuid is null or id=${req.principal.domainId ?? null}) order by created_at desc`;
      const [environment] =
        await tx`select name from environments where id=${req.principal.environmentId}`;
      const routes =
        await tx`select transport_instances from mail_routes where disabled_at is null`;
      const allowed = new Set(
        routes.flatMap((row) =>
          Array.isArray(row.transport_instances) ? (row.transport_instances as string[]) : [],
        ),
      );
      const instances = transports.filter(
        (adapter) => adapter.instance && allowed.has(adapter.instance.id),
      );
      return Promise.all(
        rows.map(async (domain) => ({
          ...domain,
          id: String(domain.id),
          ownership_status: domain.status,
          readiness: {
            environment: environment?.name ?? 'unknown',
            blockers: instances.length ? [] : ['approved_route_unavailable'],
            transports: await Promise.all(
              instances.map(async (adapter) => ({
                transport_instance: adapter.instance!.id,
                provider: adapter.name,
                ...(await sendingReadiness(tx, req.principal, domain, adapter)),
              })),
            ),
          },
        })),
      );
    });
  }
  @Post('domains') async createDomain(@Req() req: AuthRequest, @Body() body: unknown) {
    const input = parse(domainSchema, body);
    if (input.enforce_tls && !(await requiredTls(mailOptions().transports)))
      throw new MailError(422, 'No transport can guarantee required TLS');
    const keys = generateDomain(
      input.name,
      `${req.principal.orgId}/${req.principal.environmentId}`,
      config.FLARE_ENCRYPTION_KEY,
    );
    const records = domainRecords({
      ...input,
      dkim_selector: keys.selector,
      dkim_public: keys.publicKey,
    });
    return withTenant(sql, req.principal, async (tx) => {
      const [domain] =
        await tx`insert into domains(org_id,environment_id,name,region,sending,receiving,open_tracking,click_tracking,tracking_subdomain,enforce_tls,dkim_selector,dkim_public,dkim_private_cipher,records) values(${req.principal.orgId},${req.principal.environmentId},${input.name},${input.region},${input.sending},${input.receiving},${input.open_tracking},${input.click_tracking},${input.tracking_subdomain},${input.enforce_tls},${keys.selector},${keys.publicKey},${keys.cipher},${tx.json(toJson(records))}) on conflict(org_id,environment_id,name) do nothing returning id,name,status,records`;
      if (!domain) throw new MailError(409, 'Domain already exists');
      await audit(tx, req.principal, 'domain.created', String(domain.id));
      await outbox(tx, req.principal, 'domain.created', { id: domain.id, name: input.name });
      return domain;
    });
  }
  @Get('domains/:id') async domain(@Req() req: AuthRequest, @Param('id') id: string) {
    const rows = await this.domains(req);
    const found = rows.find((v) => v.id === parse(uuid, id));
    if (!found) throw new MailError(404, 'Domain not found');
    return found;
  }
  @Post('domains/:id/verify') async verify(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const [row] =
        await tx`update domains set next_check_at=now(),status='pending',verification_attempts=0 where id=${parse(uuid, id)} returning id,status`;
      if (!row) throw new MailError(404, 'Domain not found');
      return row;
    });
  }
  @Patch('domains/:id') async updateDomain(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = parse(domainSchema.omit({ name: true, region: true }).partial(), body);
    if (input.enforce_tls && !(await requiredTls(mailOptions().transports)))
      throw new MailError(422, 'No transport can guarantee required TLS');
    return withTenant(sql, req.principal, async (tx) => {
      const [row] = await tx`select * from domains where id=${parse(uuid, id)} for update`;
      if (!row) throw new MailError(404, 'Domain not found');
      const settings = domainSchema.parse({
        ...Object.fromEntries(Object.keys(domainSchema.shape).map((k) => [k, row[k]])),
        ...input,
      });
      const records = domainRecords({
        ...settings,
        dkim_selector: String(row.dkim_selector),
        dkim_public: String(row.dkim_public),
      });
      await tx`update domains set sending=${settings.sending},receiving=${settings.receiving},open_tracking=${settings.open_tracking},click_tracking=${settings.click_tracking},tracking_subdomain=${settings.tracking_subdomain},enforce_tls=${settings.enforce_tls},records=${tx.json(toJson(records))},status='pending',next_check_at=now(),verification_attempts=0 where id=${id}`;
      await audit(tx, req.principal, 'domain.updated', id);
      return { id, status: 'pending', records };
    });
  }
  @Get('suppressions') async suppressions(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select address as email,reason,protected,created_at from suppressions order by created_at desc limit 100`,
    );
  }
  @Post('suppressions') async suppress(@Req() req: AuthRequest, @Body() body: unknown) {
    const { email } = parse(z.object({ email: z.string().email().toLowerCase() }).strict(), body);
    return withTenant(sql, req.principal, async (tx) => {
      const result = await protectSuppression(tx, req.principal, email, 'manual');
      if (result.changed) await audit(tx, req.principal, 'suppression.created', null, { email });
      return { email };
    });
  }
  @Delete('suppressions/:email') async unsuppress(
    @Req() req: AuthRequest,
    @Param('email') raw: string,
  ) {
    const email = parse(z.string().email().toLowerCase(), raw);
    return withTenant(sql, req.principal, async (tx) => {
      await removeManualSuppression(tx, req.principal, email);
      await audit(tx, req.principal, 'suppression.removed', null, { email });
      await outbox(tx, req.principal, 'suppression.removed', { email });
      return { email, deleted: true };
    });
  }
}
