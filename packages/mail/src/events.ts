import { verify, createPublicKey } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import type { Tenant } from '@flare/shared';
import { canTransition, MailError } from './validation.js';
import type { MailState } from './validation.js';
import { outbox } from './pipeline.js';

export type FeedbackClassification =
  'hard_bounce' | 'soft_bounce' | 'complaint' | 'delivered' | 'transient' | 'policy' | 'unknown';
export function normalizeFeedback(input: {
  classification: FeedbackClassification;
  diagnostic?: unknown;
  status?: unknown;
  reason?: unknown;
  timestamp?: unknown;
  sendingIp?: unknown;
  remoteIp?: unknown;
  tls?: unknown;
}) {
  const clean = (value: unknown, max: number) =>
    typeof value === 'string'
      ? value
          .slice(0, 4096)
          .replace(/\p{Cc}/gu, ' ')
          .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, '[email]')
          .replace(
            /(?:password|secret|token|authorization|api[-_ ]?key)\s*[:=]\s*\S+/gi,
            '[credential]',
          )
          .replace(/https?:\/\/[^\s]+/gi, '[url]')
          .slice(0, max)
      : undefined;
  const diagnostic = clean(input.diagnostic, 500);
  const status =
    typeof input.status === 'string' && /^[245]\.\d{1,3}\.\d{1,3}$/.test(input.status)
      ? input.status
      : undefined;
  const smtp = diagnostic?.match(/(?:^|\s)([245]\d{2})(?:\s|$)/)?.[1];
  const reason = clean(input.reason, 100);
  const timestamp =
    typeof input.timestamp === 'number'
      ? new Date(input.timestamp * 1000)
      : typeof input.timestamp === 'string'
        ? new Date(input.timestamp)
        : undefined;
  return {
    classification: input.classification,
    ...(diagnostic ? { diagnostic } : {}),
    ...(status ? { enhanced_status: status } : {}),
    ...(smtp ? { smtp_status: Number(smtp) } : {}),
    ...(reason ? { provider_reason: reason } : {}),
    ...(timestamp && Number.isFinite(timestamp.getTime())
      ? { reported_at: timestamp.toISOString() }
      : {}),
    ...(typeof input.sendingIp === 'string' && isIP(input.sendingIp)
      ? { sending_ip: input.sendingIp }
      : {}),
    ...(typeof input.remoteIp === 'string' && isIP(input.remoteIp)
      ? { remote_mta_ip: input.remoteIp }
      : {}),
    ...(typeof input.tls === 'boolean' ? { tls: input.tls } : {}),
  };
}

export type SuppressionReason =
  'manual' | 'soft_bounce' | 'unknown_bounce' | 'hard_bounce' | 'complaint';
const suppressionRank: Record<SuppressionReason, number> = {
  manual: 0,
  soft_bounce: 1,
  unknown_bounce: 2,
  hard_bounce: 3,
  complaint: 4,
};
export async function protectSuppression(
  tx: Transaction,
  tenant: Tenant,
  address: string,
  reason: SuppressionReason,
) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${address}/suppression`},0))`;
  const [previous] =
    await tx`select reason,protected from suppressions where org_id=${tenant.orgId} and address=${address} for update`;
  const next =
    previous && suppressionRank[previous.reason as SuppressionReason] >= suppressionRank[reason]
      ? (previous.reason as SuppressionReason)
      : reason;
  const protectedValue = Boolean(previous?.protected) || next !== 'manual';
  const changed = !previous || next !== previous.reason || protectedValue !== previous.protected;
  if (changed) {
    await tx`insert into suppressions(org_id,address,reason,protected) values(${tenant.orgId},${address},${next},${protectedValue}) on conflict(org_id,address) do update set reason=excluded.reason,protected=excluded.protected`;
    await outbox(tx, tenant, previous ? 'suppression.updated' : 'suppression.created', {
      email: address,
      reason: next,
      protected: protectedValue,
    });
  }
  return { changed, created: !previous, reason: next, protected: protectedValue };
}
export async function removeManualSuppression(tx: Transaction, tenant: Tenant, address: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${address}/suppression`},0))`;
  const [entry] =
    await tx`select reason,protected from suppressions where org_id=${tenant.orgId} and address=${address} for update`;
  if (entry && (entry.protected || entry.reason !== 'manual'))
    throw new MailError(
      409,
      'Provider feedback suppressions cannot be removed through this endpoint',
    );
  return tx`delete from suppressions where org_id=${tenant.orgId} and address=${address} returning address`;
}

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
  bounceClass?: 'hard' | 'soft' | 'unknown';
  data?: Record<string, unknown>;
};
const feedbackRecipient = z.object({
  emailAddress: z.string().email(),
  status: z.string().optional(),
  diagnosticCode: z.string().optional(),
});
const sesNotification = z.object({
  notificationType: z.string().optional(),
  eventType: z.string().optional(),
  mail: z.object({
    messageId: z.string().min(1).max(256),
    destination: z.array(z.string().email()).max(50),
    tags: z.record(z.array(z.string())).optional(),
  }),
  bounce: z
    .object({
      bounceType: z.string(),
      bounceSubType: z.string().optional(),
      timestamp: z.string().optional(),
      bouncedRecipients: z.array(feedbackRecipient).max(50),
    })
    .optional(),
  complaint: z
    .object({
      complaintFeedbackType: z.string().optional(),
      timestamp: z.string().optional(),
      complainedRecipients: z.array(feedbackRecipient).max(50),
    })
    .optional(),
  delivery: z
    .object({
      recipients: z.array(z.string().email()).max(50),
      smtpResponse: z.string().optional(),
      remoteMtaIp: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
  deliveryDelay: z
    .object({
      delayType: z.string().optional(),
      timestamp: z.string().optional(),
      delayedRecipients: z.array(feedbackRecipient).max(50),
    })
    .optional(),
  reject: z.object({ reason: z.string().optional() }).optional(),
  failure: z.object({ errorMessage: z.string().optional() }).optional(),
});
export function normalizeSesNotification(input: unknown) {
  const parsed = sesNotification.safeParse(input);
  if (!parsed.success) throw new MailError(422, 'Invalid SES notification');
  const notification = parsed.data;
  const types: Record<string, DeliveryEvent['type']> = {
    Delivery: 'delivered',
    Bounce: 'bounced',
    Complaint: 'complained',
    DeliveryDelay: 'delivery_delayed',
    Reject: 'failed',
    RenderingFailure: 'failed',
  };
  const kind = notification.eventType ?? notification.notificationType ?? '';
  const type = types[kind];
  if (!type) return [];
  const details =
    kind === 'Bounce'
      ? notification.bounce?.bouncedRecipients
      : kind === 'Complaint'
        ? notification.complaint?.complainedRecipients
        : kind === 'DeliveryDelay'
          ? notification.deliveryDelay?.delayedRecipients
          : kind === 'Delivery'
            ? notification.delivery?.recipients.map((emailAddress) => ({ emailAddress }))
            : notification.mail.destination.map((emailAddress) => ({ emailAddress }));
  if (!details?.length) throw new MailError(422, 'SES feedback is missing affected recipients');
  const destinations = new Set(notification.mail.destination.map((email) => email.toLowerCase()));
  const bounceClass: NonNullable<DeliveryEvent['bounceClass']> =
    notification.bounce?.bounceType === 'Permanent'
      ? 'hard'
      : notification.bounce?.bounceType === 'Transient'
        ? 'soft'
        : 'unknown';
  const classification: FeedbackClassification =
    type === 'bounced'
      ? bounceClass === 'hard'
        ? 'hard_bounce'
        : bounceClass === 'soft'
          ? 'soft_bounce'
          : 'unknown'
      : type === 'complained'
        ? 'complaint'
        : type === 'delivered'
          ? 'delivered'
          : type === 'delivery_delayed'
            ? 'transient'
            : kind === 'Reject'
              ? 'policy'
              : 'unknown';
  return [
    ...new Map(details.map((detail) => [detail.emailAddress.toLowerCase(), detail])).entries(),
  ].map(([recipient, detail]) => {
    if (!destinations.has(recipient))
      throw new MailError(422, 'SES feedback recipient is not a destination');
    const recipientDetail = detail as z.infer<typeof feedbackRecipient>;
    return {
      providerId: notification.mail.messageId,
      recipient,
      type,
      ...(type === 'bounced' ? { bounceClass } : {}),
      data: normalizeFeedback({
        classification,
        diagnostic:
          recipientDetail.diagnosticCode ??
          notification.delivery?.smtpResponse ??
          notification.failure?.errorMessage,
        status: recipientDetail.status,
        reason:
          notification.bounce?.bounceSubType ??
          notification.complaint?.complaintFeedbackType ??
          notification.deliveryDelay?.delayType ??
          notification.reject?.reason,
        timestamp:
          notification.bounce?.timestamp ??
          notification.complaint?.timestamp ??
          notification.delivery?.timestamp ??
          notification.deliveryDelay?.timestamp,
        sendingIp: notification.mail.tags?.['ses:outgoing-ip']?.[0],
        remoteIp: notification.delivery?.remoteMtaIp,
      }),
    };
  });
}
export async function recordEvent(sql: Sql, tenant: Tenant, event: DeliveryEvent) {
  const bounceClass =
    event.bounceClass ??
    (event.hardBounce === true ? 'hard' : event.hardBounce === false ? 'soft' : 'unknown');
  const classification =
    event.type === 'bounced'
      ? bounceClass === 'hard'
        ? 'hard_bounce'
        : bounceClass === 'soft'
          ? 'soft_bounce'
          : 'unknown'
      : event.type === 'complained'
        ? 'complaint'
        : event.type === 'delivered'
          ? 'delivered'
          : event.type === 'delivery_delayed'
            ? 'transient'
            : event.data?.classification === 'policy'
              ? 'policy'
              : 'unknown';
  const data = { ...event.data, classification };
  return withTenant(sql, tenant, async (tx) => {
    const [message] = await tx`select * from messages where id=${event.messageId} for update`;
    if (!message) throw new MailError(404, 'Message not found');
    if (event.recipient) {
      const [recipient] =
        await tx`select address from message_recipients where message_id=${event.messageId} and address=${event.recipient}`;
      if (!recipient) throw new MailError(422, 'Event recipient does not belong to this message');
    }
    const rows =
      await tx`insert into delivery_events(org_id,environment_id,message_id,source,source_id,type,recipient,data) values(${tenant.orgId},${tenant.environmentId},${event.messageId},${event.source},${event.sourceId},${event.type},${event.recipient ?? null},${tx.json(toJson(data))}) on conflict(source,source_id) do nothing returning id`;
    if (!rows.length) return { duplicate: true };
    if (event.recipient && ['bounced', 'complained'].includes(event.type)) {
      // Serialize suppression counters across environments for the same organization/address.
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${event.recipient}/suppression`},0))`;
      let reason: SuppressionReason | null =
        event.type === 'complained'
          ? 'complaint'
          : event.type === 'bounced' && bounceClass === 'hard'
            ? 'hard_bounce'
            : event.type === 'bounced' && bounceClass === 'unknown'
              ? 'unknown_bounce'
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
        await protectSuppression(tx, tenant, event.recipient, reason);
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
      ...data,
    });
    return { duplicate: false };
  });
}
