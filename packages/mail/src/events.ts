import { verify, createPublicKey } from 'node:crypto';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';
import { canTransition, MailError } from './validation.js';
import type { MailState } from './validation.js';
import { outbox } from './pipeline.js';

export function verifyPostal(raw: Buffer, signature: string, publicKey: string) {
  if (
    !publicKey ||
    !signature ||
    !verify('RSA-SHA256', raw, createPublicKey(publicKey), Buffer.from(signature, 'base64'))
  )
    throw new MailError(401, 'Invalid Postal signature');
}
export const snsSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  Message: z.string(),
  MessageId: z.string(),
  TopicArn: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.string().url(),
  Subject: z.string().optional(),
  Token: z.string().optional(),
  SubscribeURL: z.string().optional(),
});
export type SnsMessage = z.infer<typeof snsSchema>;
export function snsCanonical(message: SnsMessage) {
  const keys =
    message.Type === 'Notification'
      ? [
          'Message',
          'MessageId',
          ...(message.Subject !== undefined ? ['Subject'] : []),
          'Timestamp',
          'TopicArn',
          'Type',
        ]
      : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return keys
    .map((key) => {
      const value = message[key as keyof SnsMessage];
      if (value === undefined) throw new MailError(400, 'Missing SNS signing field');
      return `${key}\n${value}\n`;
    })
    .join('');
}
export async function verifySns(message: SnsMessage, allowedTopics: string[]) {
  if (!allowedTopics.includes(message.TopicArn)) throw new MailError(401, 'Untrusted SNS topic');
  const parts = message.TopicArn.split(':');
  const region = parts[3];
  const suffix = parts[1] === 'aws-cn' ? 'amazonaws.com.cn' : 'amazonaws.com';
  const url = new URL(message.SigningCertURL);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== `sns.${region}.${suffix}` ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname)
  )
    throw new MailError(401, 'Untrusted SNS certificate URL');
  // TLS authenticates the exact AWS certificate endpoint; redirects cannot change that trust boundary.
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new MailError(503, 'SNS certificate unavailable');
  const certificate = await response.text();
  if (
    certificate.length > 16000 ||
    !verify(
      message.SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1',
      Buffer.from(snsCanonical(message)),
      certificate,
      Buffer.from(message.Signature, 'base64'),
    )
  )
    throw new MailError(401, 'Invalid SNS signature');
}
export type DeliveryEvent = {
  source: string;
  sourceId: string;
  messageId: string;
  recipient?: string;
  type:
    'delivered' | 'delivery_delayed' | 'bounced' | 'complained' | 'failed' | 'opened' | 'clicked';
  hardBounce?: boolean;
  data?: Record<string, unknown>;
};
export async function recordEvent(sql: Sql, tenant: Tenant, event: DeliveryEvent) {
  return withTenant(sql, tenant, async (tx) => {
    const [message] = await tx`select * from messages where id=${event.messageId} for update`;
    if (!message) throw new MailError(404, 'Message not found');
    if (event.recipient) {
      const [recipient] =
        await tx`select address from message_recipients where message_id=${event.messageId} and address=${event.recipient}`;
      if (!recipient) throw new MailError(422, 'Event recipient does not belong to this message');
    }
    const rows =
      await tx`insert into delivery_events(org_id,environment_id,message_id,source,source_id,type,recipient,data) values(${tenant.orgId},${tenant.environmentId},${event.messageId},${event.source},${event.sourceId},${event.type},${event.recipient ?? null},${tx.json(toJson(event.data ?? {}))}) on conflict(source,source_id) do nothing returning id`;
    if (!rows.length) return { duplicate: true };
    if (event.recipient && ['bounced', 'complained'].includes(event.type)) {
      // Serialize suppression counters across environments for the same organization/address.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${event.recipient}/suppression`},0))`;
      let reason =
        event.type === 'complained'
          ? 'complaint'
          : event.type === 'bounced' && event.hardBounce
            ? 'hard_bounce'
            : null;
      if (!reason && event.type === 'bounced') {
        // Org-scoped RLS includes every environment. Count a soft bounce once per
        // message, never once per provider retry.
        await tx`insert into soft_bounces(org_id,address,message_id) values(${tenant.orgId},${event.recipient},${event.messageId}) on conflict do nothing`;
        const [count] =
          await tx`select count(*)::int as n from soft_bounces where address=${event.recipient} and created_at>now()-interval '7 days'`;
        if (Number(count!.n) >= 3) reason = 'soft_bounce';
      }
      if (reason) {
        const inserted =
          await tx`insert into suppressions(org_id,address,reason) values(${tenant.orgId},${event.recipient},${reason}) on conflict do nothing returning address`;
        if (inserted.length)
          await outbox(tx, tenant, 'suppression.created', { email: event.recipient, reason });
      }
    }
    if (!['opened', 'clicked'].includes(event.type)) {
      const target = event.type as MailState;
      const [uncertain] =
        await tx`select id from transport_attempts where message_id=${event.messageId} and status='ambiguous' limit 1`;
      const recipients =
        await tx`select address,status from message_recipients where message_id=${event.messageId} and (${event.recipient ?? null}::text is null or address=${event.recipient ?? null}) for update`;
      for (const recipient of recipients) {
        // A provider callback may beat the synchronous acceptance response.
        const current =
          (recipient.status === 'queued' && message.delivery_started_at) ||
          (recipient.status === 'failed' && uncertain)
            ? 'sent'
            : (String(recipient.status) as MailState);
        if (canTransition(current, target))
          await tx`update message_recipients set status=${target} where message_id=${event.messageId} and address=${recipient.address}`;
      }
      const states = (
        await tx`select status from message_recipients where message_id=${event.messageId}`
      ).map((v) => String(v.status));
      const aggregate: MailState = states.includes('complained')
        ? 'complained'
        : states.includes('bounced')
          ? 'bounced'
          : states.includes('delivery_delayed')
            ? 'delivery_delayed'
            : states.includes('queued') || states.includes('sent')
              ? 'sent'
              : states.includes('failed')
                ? 'failed'
                : states.includes('delivered')
                  ? 'delivered'
                  : 'suppressed';
      const current =
        (message.delivery_started_at && ['queued', 'scheduled'].includes(String(message.status))) ||
        (message.status === 'failed' && uncertain)
          ? 'sent'
          : (message.status as MailState);
      if (current === aggregate || canTransition(current, aggregate))
        await tx`update messages set status=${aggregate},updated_at=now() where id=${event.messageId}`;
    }
    await outbox(tx, tenant, `email.${event.type}`, {
      email_id: event.messageId,
      recipient: event.recipient,
      ...event.data,
    });
    return { duplicate: false };
  });
}
