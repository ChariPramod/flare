import { readFileSync } from 'node:fs';
import { Controller, Get, Post, Put, Body, Req, Param, Query } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Transaction } from '@flare/db';
import { MailError, objectStore, verifyPostal } from '@flare/mail';
import { acceptInbound, inboundLimits, validateForwardingRule } from '@flare/platform';
import { Public } from './auth.js';
import { parse, sql } from './context.js';
import type { AuthRequest } from './context.js';
import { audit } from './identity.js';
const uuid = z.string().uuid();
async function scopedMessage(tx: Transaction, req: AuthRequest, id: string) {
  const [row] =
    await tx`select * from inbound_messages where id=${parse(uuid, id)} and (${req.principal.domainId ?? null}::uuid is null or domain_id=${req.principal.domainId ?? null})`;
  if (!row) throw new MailError(404, 'Inbound message not found');
  return row;
}
@Controller('v1')
export class InboundController {
  @Public() @Post('inbound/postal/:domainId') async receive(
    @Req() req: RawBodyRequest<Request>,
    @Param('domainId') domainId: string,
    @Body() body: unknown,
  ) {
    const key = process.env.POSTAL_WEBHOOK_PUBLIC_KEY_FILE
      ? readFileSync(process.env.POSTAL_WEBHOOK_PUBLIC_KEY_FILE, 'utf8')
      : process.env.POSTAL_WEBHOOK_PUBLIC_KEY;
    if (!key || !req.rawBody) throw new MailError(503, 'Postal verification is not configured');
    if (
      process.env.POSTAL_WEBHOOK_KEY_ID &&
      req.get('x-postal-signature-kid') !== process.env.POSTAL_WEBHOOK_KEY_ID
    )
      throw new MailError(401, 'Unknown Postal signing key');
    verifyPostal(req.rawBody, req.get('x-postal-signature-256') ?? '', key);
    return acceptInbound(sql, objectStore(), parse(uuid, domainId), body);
  }
  @Get('inbound') list(@Req() req: AuthRequest, @Query() query: unknown) {
    const input = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
      query,
    );
    return withTenant(sql, req.principal, async (tx) => ({
      data: await tx`select id,domain_id,mail_from,rcpt_to,subject,status,size,error,created_at from inbound_messages where (${req.principal.domainId ?? null}::uuid is null or domain_id=${req.principal.domainId ?? null}) order by created_at desc,id limit ${input.limit} offset ${(input.page - 1) * input.limit}`,
    }));
  }
  @Get('inbound/:id') detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const row = await scopedMessage(tx, req, id);
      const { raw_key: _raw, body_key: _body, content_hash: _hash, ...metadata } = row;
      return {
        ...metadata,
        attachments:
          await tx`select id,filename,content_type,size,content_id from inbound_attachments where inbound_id=${id}`,
        attempts:
          await tx`select ordinal,status,error,created_at from inbound_attempts where inbound_id=${id} order by ordinal`,
        forwards:
          await tx`select id,rule_id,status,message_id,error from inbound_forwards where inbound_id=${id}`,
      };
    });
  }
  @Get('inbound/:id/body') body(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const row = await scopedMessage(tx, req, id);
      if (!row.body_key) throw new MailError(409, 'Inbound message has not been parsed');
      return JSON.parse(
        (await objectStore().get(String(row.body_key), inboundLimits().raw * 6)).toString(),
      ) as unknown;
    });
  }
  @Get('inbound/:id/raw') raw(@Req() req: AuthRequest, @Param('id') id: string) {
    return withTenant(sql, req.principal, async (tx) => {
      const row = await scopedMessage(tx, req, id);
      return {
        filename: `${id}.eml`,
        content_type: 'message/rfc822',
        content: (await objectStore().get(String(row.raw_key), inboundLimits().raw)).toString(
          'base64',
        ),
      };
    });
  }
  @Get('inbound/:id/attachments/:attachmentId') attachment(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return withTenant(sql, req.principal, async (tx) => {
      await scopedMessage(tx, req, id);
      const [file] =
        await tx`select * from inbound_attachments where id=${parse(uuid, attachmentId)} and inbound_id=${id}`;
      if (!file) throw new MailError(404, 'Attachment not found');
      return {
        filename: file.filename,
        content_type: file.content_type,
        content: (
          await objectStore().get(String(file.object_key), inboundLimits().attachments)
        ).toString('base64'),
      };
    });
  }
  @Get('forwarding-rules') rules(@Req() req: AuthRequest) {
    return withTenant(
      sql,
      req.principal,
      (tx) =>
        tx`select * from forwarding_rules where (${req.principal.domainId ?? null}::uuid is null or domain_id=${req.principal.domainId ?? null}) order by created_at`,
    );
  }
  @Post('forwarding-rules') createRule(@Req() req: AuthRequest, @Body() body: unknown) {
    return withTenant(sql, req.principal, async (tx) => {
      const rule = await validateForwardingRule(tx, req.principal, body);
      const [row] =
        await tx`insert into forwarding_rules(org_id,environment_id,domain_id,recipient,sender,destinations,enabled) values(${req.principal.orgId},${req.principal.environmentId},${rule.domain_id},${rule.recipient},${rule.sender},${tx.json(rule.destinations)},${rule.enabled}) returning *`;
      await audit(tx, req.principal, 'forwarding_rule.created', String(row!.id));
      return row;
    });
  }
  @Put('forwarding-rules/:id') updateRule(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return withTenant(sql, req.principal, async (tx) => {
      const rule = await validateForwardingRule(tx, req.principal, body);
      const [row] =
        await tx`update forwarding_rules set recipient=${rule.recipient},sender=${rule.sender},destinations=${tx.json(toJson(rule.destinations))},enabled=${rule.enabled} where id=${parse(uuid, id)} and domain_id=${rule.domain_id} returning *`;
      if (!row) throw new MailError(404, 'Forwarding rule not found');
      await audit(tx, req.principal, 'forwarding_rule.updated', id);
      return row;
    });
  }
}
