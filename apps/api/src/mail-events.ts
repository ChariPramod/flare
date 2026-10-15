import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Controller, Get, Post, Param, Req, Res, Body } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  MailError,
  verifyPostal,
  verifySns,
  snsSchema,
  recordEvent,
  normalizeFeedback,
  normalizeSesNotification,
  verifyTracking,
} from '@flare/mail';
import type { DeliveryEvent } from '@flare/mail';
import { Public } from './auth.js';
import { config, parse, sql } from './context.js';
const postalTypes: Record<string, DeliveryEvent['type']> = {
  MessageSent: 'delivered',
  MessageDelayed: 'delivery_delayed',
  MessageDeliveryFailed: 'failed',
  MessageBounced: 'bounced',
};
const postalMessage = z
  .object({
    token: z.string().optional(),
    message_id: z.string().optional(),
    to: z.string().optional(),
  })
  .passthrough();
@Controller()
export class MailEventController {
  @Public() @Post('v1/events/postal') async postal(
    @Req() req: RawBodyRequest<Request>,
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
    const event = parse(
      z
        .object({
          event: z.string(),
          uuid: z.string().min(1).max(256),
          payload: z
            .object({
              message: postalMessage.optional(),
              original_message: postalMessage.optional(),
            })
            .passthrough(),
        })
        .passthrough(),
      body,
    );
    const type = postalTypes[event.event];
    if (!type) return { ignored: true };
    const info =
      event.event === 'MessageBounced' ? event.payload.original_message : event.payload.message;
    if (!info) throw new MailError(422, 'Missing Postal message');
    const recipient = info.to?.toLowerCase();
    if (!recipient || !z.string().email().safeParse(recipient).success)
      throw new MailError(422, 'Missing or invalid Postal recipient');
    const rfcId = info.message_id?.match(/^<?([0-9a-f-]{36})@[^<>]+>?$/i)?.[1];
    const [message] =
      await sql`select distinct m.id,m.org_id,m.environment_id from messages m join transport_attempts a on a.message_id=m.id where a.provider='postal' and (m.id::text=${rfcId ?? ''} or a.provider_ids->>${recipient ?? ''}=${info.token ?? ''}) limit 1`;
    if (!message) throw new MailError(404, 'Postal message correlation not available yet');
    return recordEvent(
      sql,
      { orgId: String(message.org_id), environmentId: String(message.environment_id) },
      {
        source: 'postal',
        sourceId: event.uuid,
        messageId: String(message.id),
        recipient,
        type,
        ...(type === 'bounced' ? { bounceClass: 'unknown' as const } : {}),
        data: normalizeFeedback({
          classification:
            type === 'delivered'
              ? 'delivered'
              : type === 'delivery_delayed'
                ? 'transient'
                : 'unknown',
          diagnostic: event.payload.output,
          reason: event.payload.status,
          timestamp: event.payload.timestamp,
          tls: event.payload.sent_with_ssl,
        }),
      },
    );
  }
  @Public() @Post('v1/events/sns') async sns(@Body() body: unknown) {
    const event = parse(snsSchema, body);
    await verifySns(event, (process.env.SES_SNS_TOPIC_ARNS ?? '').split(',').filter(Boolean));
    if (event.Type === 'SubscriptionConfirmation') {
      if (!event.SubscribeURL) throw new MailError(400, 'Missing SNS subscription URL');
      const url = new URL(event.SubscribeURL);
      const cert = new URL(event.SigningCertURL);
      if (
        url.origin !== cert.origin ||
        url.pathname !== '/' ||
        url.username ||
        url.password ||
        url.searchParams.get('Action') !== 'ConfirmSubscription' ||
        url.searchParams.get('Token') !== event.Token ||
        url.searchParams.get('TopicArn') !== event.TopicArn
      )
        throw new MailError(401, 'Invalid SNS confirmation URL');
      const result = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      if (!result.ok) throw new MailError(503, 'SNS confirmation failed');
      return { confirmed: true };
    }
    if (event.Type !== 'Notification') return { ignored: true };
    let payload: unknown;
    try {
      payload = JSON.parse(event.Message);
    } catch {
      throw new MailError(422, 'Invalid SNS JSON');
    }
    const feedback = normalizeSesNotification(payload);
    if (!feedback.length) return { ignored: true };
    for (const item of feedback) {
      const [message] =
        await sql`select m.id,m.org_id,m.environment_id from messages m join transport_attempts a on a.message_id=m.id where a.provider='ses' and a.provider_ids->>${item.recipient}=${item.providerId} limit 1`;
      if (!message) throw new MailError(404, 'SES message correlation not available yet');
      await recordEvent(
        sql,
        { orgId: String(message.org_id), environmentId: String(message.environment_id) },
        {
          source: 'sns',
          sourceId: `${event.MessageId}/${item.recipient}`,
          messageId: String(message.id),
          recipient: item.recipient,
          type: item.type,
          bounceClass: item.bounceClass,
          data: item.data,
        },
      );
    }
    return { received: true };
  }
  @Public() @Get('t/:token') async track(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const data = verifyTracking(token, config.JWT_SECRET);
    const [message] = await sql`select org_id,environment_id from messages where id=${data.id}`;
    if (!message) throw new MailError(404, 'Email not found');
    const agent = req.get('user-agent') ?? '';
    const sourceId = createHmac('sha256', config.JWT_SECRET)
      .update(`${token}/${req.ip}/${agent}/${Math.floor(Date.now() / 300000)}`)
      .digest('hex');
    await recordEvent(
      sql,
      { orgId: String(message.org_id), environmentId: String(message.environment_id) },
      {
        source: 'tracking',
        sourceId,
        messageId: data.id,
        type: data.kind === 'open' ? 'opened' : 'clicked',
        data: {
          likely_machine: /googleimageproxy|google-proxy|apple|bot|scanner|prefetch/i.test(agent),
          ...(data.url ? { url: data.url } : {}),
        },
      },
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (data.kind === 'click') return res.redirect(302, data.url!);
    return res
      .type('image/gif')
      .send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
}
