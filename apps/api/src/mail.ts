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
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.status)
      .json({ statusCode: error.status, message: error.message });
  }
}
@Controller('v1')
export class MailController {
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
        tx`select id,domain_id,request->>'from' as "from",request->>'subject' as subject,status,scheduled_at,created_at from messages order by created_at desc limit 100`,
    );
  }
  @Get('emails/:id') async get(@Req() req: AuthRequest, @Param('id') id: string) {
    id = parse(uuid, id);
    return withTenant(sql, req.principal, async (tx) => {
      const [message] =
        await tx`select id,domain_id,request,status,scheduled_at,delivery_started_at,error,created_at,updated_at from messages where id=${id}`;
      if (!message || (req.principal.domainId && req.principal.domainId !== message.domain_id))
        throw new MailError(404, 'Email not found');
      return {
        ...message,
        recipients:
          await tx`select address,kind,status from message_recipients where message_id=${id}`,
        events:
          await tx`select type,recipient,data,created_at from delivery_events where message_id=${id} order by created_at`,
        attempts:
          await tx`select provider,ordinal,status,error,started_at,finished_at from transport_attempts where message_id=${id} order by ordinal`,
      };
    });
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
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select id,name,region,status,sending,receiving,open_tracking,click_tracking,tracking_subdomain,enforce_tls,records,checked_at,verified_at,next_check_at,created_at from domains order by created_at desc`,
    );
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
        tx`select address as email,reason,created_at from suppressions order by created_at desc limit 100`,
    );
  }
  @Post('suppressions') async suppress(@Req() req: AuthRequest, @Body() body: unknown) {
    const { email } = parse(z.object({ email: z.string().email().toLowerCase() }).strict(), body);
    return withTenant(sql, req.principal, async (tx) => {
      await tx`insert into suppressions(org_id,address,reason) values(${req.principal.orgId},${email},'manual') on conflict do nothing`;
      await audit(tx, req.principal, 'suppression.created', null, { email });
      await outbox(tx, req.principal, 'suppression.created', { email, reason: 'manual' });
      return { email };
    });
  }
  @Delete('suppressions/:email') async unsuppress(
    @Req() req: AuthRequest,
    @Param('email') raw: string,
  ) {
    const email = parse(z.string().email().toLowerCase(), raw);
    return withTenant(sql, req.principal, async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${req.principal.orgId}/${email}/suppression`},0))`;
      await tx`delete from suppressions where address=${email}`;
      await tx`delete from soft_bounces where address=${email}`;
      await audit(tx, req.principal, 'suppression.removed', null, { email });
      await outbox(tx, req.principal, 'suppression.removed', { email });
      return { email, deleted: true };
    });
  }
}
