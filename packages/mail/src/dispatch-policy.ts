import type { Transaction } from '@flare/db';
import type { Tenant } from '@flare/shared';
import { mailRouteSnapshotSchema } from './routes.js';
import { lockSendingPolicy, releaseUnusedQuota, reserveSendingQuota } from './sending-policy.js';

export interface DispatchPolicyMessage {
  id: string;
  sandbox: boolean;
  traffic_class: unknown;
  submitting_key_id: unknown;
  route_snapshot: unknown;
}
export interface DispatchPolicyResult {
  recipients: string[];
  holdReason?: string;
  retryAfter?: number;
}
/** Call inside the SAME transaction that validates the delivery claim and inserts
 * its transport attempt. Any failed claim/attempt insertion must roll this back.
 * Quota is logical-recipient based; pacing counts each actual network attempt.
 */
export async function prepareDispatchPolicy(
  tx: Transaction,
  tenant: Tenant,
  message: DispatchPolicyMessage,
  queuedRecipients: string[],
  options: { sandboxAuthorized?: boolean } = {},
): Promise<DispatchPolicyResult> {
  const hold = (holdReason: string, retryAfter = 60): DispatchPolicyResult => ({
    recipients: [],
    holdReason,
    retryAfter,
  });
  await lockSendingPolicy(tx, tenant.orgId);
  await releaseUnusedQuota(tx, tenant, message.id);
  if (!queuedRecipients.length) return { recipients: [] };
  const uniqueRecipients = [...new Set(queuedRecipients)];
  // Match feedback/manual-suppression serialization. Keep these locks until the
  // enclosing transaction commits its attempt; a later callback cannot recall it.
  for (const recipient of [...uniqueRecipients].sort())
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${recipient}/suppression`},0))`;
  const suppressed =
    await tx`update message_recipients r set status='suppressed' where r.org_id=${tenant.orgId} and r.environment_id=${tenant.environmentId} and r.message_id=${message.id} and r.address in ${tx(uniqueRecipients)} and r.status='queued' and exists(select 1 from suppressions s where s.org_id=r.org_id and s.address=r.address) returning address`;
  for (const recipient of suppressed)
    await tx`insert into event_outbox(org_id,environment_id,type,data) values(${tenant.orgId},${tenant.environmentId},'email.suppressed',${tx.json({ email_id: message.id, recipient: String(recipient.address) })})`;
  if (suppressed.length) await releaseUnusedQuota(tx, tenant, message.id);
  // Never charge or submit recipients that became terminal since the caller read them.
  const queued =
    await tx`select address from message_recipients where org_id=${tenant.orgId} and environment_id=${tenant.environmentId} and message_id=${message.id} and address in ${tx(uniqueRecipients)} and status='queued' order by address for update`;
  const available = new Set(queued.map((row) => String(row.address)));
  const candidates = uniqueRecipients.filter((recipient) => available.has(recipient));
  if (!candidates.length) return { recipients: [] };
  if (message.sandbox)
    return options.sandboxAuthorized
      ? { recipients: candidates }
      : hold('sandbox_transport_required');
  const [policy] = await tx`select * from sending_policies where org_id=${tenant.orgId}`;
  if (!policy || policy.state !== 'approved')
    return hold(policy?.state === 'suspended' ? 'sending_suspended' : 'sending_not_approved');
  if (message.traffic_class !== 'transactional' && message.traffic_class !== 'marketing')
    return hold('classification_required');
  if (message.traffic_class === 'marketing' && !policy.marketing_enabled)
    return hold('marketing_not_approved');
  const parsed = mailRouteSnapshotSchema.safeParse(message.route_snapshot);
  if (!parsed.success) return hold('route_required');
  const route = parsed.data;
  if (route.traffic_class !== message.traffic_class || route.trust_tier !== policy.trust_tier)
    return hold('route_purpose_mismatch');
  let key: Record<string, unknown> | undefined;
  if (message.submitting_key_id !== null && message.submitting_key_id !== undefined) {
    if (typeof message.submitting_key_id !== 'string') return hold('credential_unavailable');
    [key] =
      await tx`select mail_traffic_class,critical_sending from api_keys where id=${message.submitting_key_id} and org_id=${tenant.orgId} and environment_id=${tenant.environmentId} and revoked_at is null for share`;
    if (!key) return hold('credential_unavailable');
    if (key.mail_traffic_class && key.mail_traffic_class !== message.traffic_class)
      return hold('credential_class_mismatch');
  }
  if (
    route.critical &&
    (!key?.critical_sending ||
      policy.trust_tier !== 'pareto' ||
      message.traffic_class !== 'transactional')
  )
    return hold('critical_grant_required');
  const [pace] =
    await tx`select coalesce(sum(recipients),0)::int as used,coalesce(greatest(1,ceil(extract(epoch from min(created_at)+interval '60 seconds'-statement_timestamp()))),60)::int as retry_after from sending_dispatches where org_id=${tenant.orgId} and created_at>statement_timestamp()-interval '60 seconds'`;
  const remaining = Math.max(0, Number(policy.per_minute_limit) - Number(pace!.used));
  if (!remaining) return hold('sending_rate_limited', Number(pace!.retry_after));
  const [usage] =
    await tx`select count(*)::int as n from sending_quota where org_id=${tenant.orgId} and (state='reserved' or (state='consumed' and consumed_at>statement_timestamp()-interval '24 hours'))`;
  let dailyRemaining = Number(policy.daily_limit) - Number(usage!.n);
  if (dailyRemaining < 0) return hold('recipient_quota_exhausted');
  const reserved =
    await tx`select recipient from sending_quota where org_id=${tenant.orgId} and environment_id=${tenant.environmentId} and message_id=${message.id} and state<>'released'`;
  const accounted = new Set(reserved.map((row) => String(row.recipient)));
  const recipients: string[] = [];
  for (const recipient of candidates) {
    if (!accounted.has(recipient)) {
      if (!dailyRemaining) continue;
      dailyRemaining--;
    }
    recipients.push(recipient);
    if (recipients.length === remaining) break;
  }
  if (!recipients.length) return hold('recipient_quota_exhausted');
  await reserveSendingQuota(tx, tenant, message.id, recipients, Number(policy.daily_limit));
  // Lock contention must not backdate dispatches or shorten their rolling
  // allowance windows. Keep the exact database timestamp for first consumption;
  // network retries receive a fresh dispatch timestamp but retain logical usage.
  await tx`
    with dispatch as (
      insert into sending_dispatches(org_id,environment_id,message_id,recipients,created_at)
      values(${tenant.orgId},${tenant.environmentId},${message.id},${recipients.length},clock_timestamp())
      returning created_at
    )
    update sending_quota set state='consumed',consumed_at=coalesce(consumed_at,dispatch.created_at)
    from dispatch
    where org_id=${tenant.orgId} and environment_id=${tenant.environmentId}
      and message_id=${message.id} and recipient in ${tx(recipients)} and state='reserved'`;
  return { recipients };
}
