import { z } from 'zod';
import { toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import type { Principal, Tenant } from '@flare/shared';
import { MailError } from './validation.js';

export const trafficClassSchema = z.enum(['transactional', 'marketing']);
const bindingSchema = z
  .object({ id: z.string().uuid(), revision: z.number().int().positive() })
  .strict();
export const sendingPolicyUpdateSchema = z
  .object({
    expected_revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(2000),
    state: z.enum(['pending_review', 'approved', 'suspended']).optional(),
    daily_limit: z.number().int().min(1).max(1000000).optional(),
    per_minute_limit: z.number().int().min(1).max(10000).optional(),
    complaint_threshold: z.number().int().min(1).max(100).optional(),
    hard_bounce_rate: z.number().min(0).max(1).optional(),
    hard_bounce_min: z.number().int().min(1).max(10000).optional(),
    marketing_enabled: z.boolean().optional(),
    default_traffic_class: trafficClassSchema.nullable().optional(),
    trust_tier: z.enum(['customer', 'pareto']).optional(),
    route_bindings: z
      .object({
        transactional: bindingSchema.optional(),
        marketing: bindingSchema.optional(),
        critical: bindingSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const sendingCredentialUpdateSchema = z
  .object({
    expected_revision: z.number().int().nonnegative(),
    reason: z.string().trim().min(10).max(2000),
    traffic_class: trafficClassSchema.nullable(),
    critical_sending: z.boolean(),
  })
  .strict();
export const suppressionRestorationSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    reason: z.string().trim().min(10).max(2000),
    expected_revision: z.number().int().nonnegative(),
  })
  .strict();
export interface OperatorActor {
  actorId: string;
  sessionId: string;
  authorize(tx: Transaction): Promise<void>;
}
export async function lockSendingPolicy(tx: Transaction, orgId: string) {
  await tx`select pg_advisory_xact_lock(hashtextextended(${`${orgId}/sending-policy`},0))`;
}
export async function policyAudit(
  tx: Transaction,
  orgId: string,
  actor: string,
  action: string,
  metadata: unknown,
) {
  await tx`insert into audit_logs(org_id,actor_id,action,resource_id,metadata) values(${orgId},${actor},${action},${orgId},${tx.json(toJson(metadata))})`;
}
export async function sendingFeedback(sql: Sql | Transaction, orgId: string) {
  // Legacy complaints predate normalized data. Classify them by their definitive
  // event type without rewriting history or guessing historical bounce severity.
  const [feedback] = await sql`
    with observations as (
      select e.message_id,e.recipient,e.type,case when e.type='complained' then 'complaint' else e.data->>'classification' end as classification,
        min(e.created_at) as first_at,max(e.created_at) as latest_at
      from delivery_events e join messages m on m.id=e.message_id and m.org_id=e.org_id and m.environment_id=e.environment_id
      where e.org_id=${orgId} and not m.sandbox
        and e.type in ('bounced','complained')
        and (e.source in ('postal','sns','ses') or e.source like 'postal:%' or e.source like 'ses:%' or e.source like 'sns:%')
      group by e.message_id,e.recipient,e.type,case when e.type='complained' then 'complaint' else e.data->>'classification' end
    ), cohort as (
      select o.*,exists(select 1 from sending_quota q where q.org_id=${orgId} and q.message_id=o.message_id and q.recipient=o.recipient and q.consumed_at>now()-interval '24 hours') as recent_recipient
      from observations o where first_at>now()-interval '24 hours'
    )
    select (select count(*)::int from sending_quota where org_id=${orgId} and consumed_at>now()-interval '24 hours') as recipients_24h,
      count(*) filter(where type='bounced' and classification='hard_bounce' and recent_recipient)::int as hard_bounces,
      count(*) filter(where type='complained')::int as complaints,
      count(*) filter(where type='bounced' and coalesce(classification,'unknown')='unknown')::int as unknown,
      count(*) filter(where type='complained' and first_at>coalesce((select feedback_reviewed_at from sending_policies where org_id=${orgId}),'-infinity'::timestamptz))::int as unreviewed_complaints,
      count(*) filter(where type='bounced' and classification='hard_bounce' and recent_recipient and first_at>coalesce((select feedback_reviewed_at from sending_policies where org_id=${orgId}),'-infinity'::timestamptz))::int as unreviewed_hard_bounces,
      max(latest_at) as latest_at
    from cohort`;
  return feedback!;
}
export async function getSendingPolicy(sql: Sql, orgId: string) {
  const [policy] =
    await sql`select p.*,o.name from sending_policies p join organizations o on o.id=p.org_id where p.org_id=${orgId}`;
  if (!policy) throw new MailError(404, 'Organization not found');
  const [usage] =
    await sql`select count(*) filter(where state='reserved')::int as reserved,count(*) filter(where state='consumed' and consumed_at>now()-interval '24 hours')::int as sent_24h from sending_quota where org_id=${orgId}`;
  return {
    ...policy,
    hard_bounce_rate: Number(policy.hard_bounce_rate),
    usage,
    feedback: await sendingFeedback(sql, orgId),
  };
}
export async function listSendingPolicies(sql: Sql) {
  const rows =
    await sql`select org_id from sending_policies order by updated_at desc,org_id limit 100`;
  return Promise.all(rows.map((row) => getSendingPolicy(sql, String(row.org_id))));
}
export async function listSendingPolicyAudit(sql: Sql, orgId: string) {
  return sql`select id,actor_id,action,resource_id,metadata,created_at from audit_logs where org_id=${orgId} and action like 'operator.%' order by created_at desc limit 100`;
}
export async function updateSendingPolicy(
  sql: Sql,
  actor: OperatorActor,
  orgId: string,
  value: unknown,
) {
  const input = sendingPolicyUpdateSchema.parse(value);
  await sql.begin(async (tx) => {
    await actor.authorize(tx);
    await lockSendingPolicy(tx, orgId);
    const [before] = await tx`select * from sending_policies where org_id=${orgId} for update`;
    if (!before) throw new MailError(404, 'Organization not found');
    if (before.revision !== input.expected_revision)
      throw new MailError(409, 'Sending policy changed; refresh before editing');
    const { expected_revision: _revision, reason, ...changes } = input;
    const after = { ...before, ...changes };
    if (after.default_traffic_class === 'marketing' && !after.marketing_enabled)
      throw new MailError(422, 'Marketing sending requires explicit approval');
    if (after.trust_tier !== 'pareto' && (after.route_bindings as Record<string, unknown>).critical)
      throw new MailError(422, 'Critical routing requires Pareto authorization');
    if (changes.route_bindings || changes.trust_tier) {
      await tx`select pg_advisory_xact_lock_shared(hashtextextended('mail-route-registry',0))`;
      for (const [purpose, binding] of Object.entries(
        after.route_bindings as Record<string, { id: string; revision: number }>,
      )) {
        const [route] =
          await tx`select * from mail_routes where id=${binding.id} and revision=${binding.revision}`;
        if (
          !route ||
          route.disabled_at ||
          !route.verified_at ||
          route.trust_tier !== after.trust_tier ||
          route.traffic_class !== (purpose === 'marketing' ? 'marketing' : 'transactional') ||
          route.critical !== (purpose === 'critical')
        )
          throw new SendingPolicyError(
            422,
            'route_binding_invalid',
            'Route binding must reference an active verified revision within the approved purpose and trust boundary',
          );
      }
    }
    const resuming = before.state === 'suspended' && after.state === 'approved';
    const reviewedFeedback = resuming ? await sendingFeedback(tx, orgId) : null;
    await tx`update sending_policies set feedback_reviewed_at=case when ${resuming} then clock_timestamp() else feedback_reviewed_at end,state=${after.state!},daily_limit=${after.daily_limit!},per_minute_limit=${after.per_minute_limit!},complaint_threshold=${after.complaint_threshold!},hard_bounce_rate=${after.hard_bounce_rate!},hard_bounce_min=${after.hard_bounce_min!},marketing_enabled=${after.marketing_enabled!},default_traffic_class=${after.default_traffic_class ?? null},trust_tier=${after.trust_tier!},route_bindings=${tx.json(toJson(after.route_bindings))},revision=revision+1,suspension_reason=${after.state === 'suspended' ? reason : null},reviewed_at=now(),updated_at=now() where org_id=${orgId}`;
    await policyAudit(tx, orgId, actor.actorId, 'operator.sending_policy.updated', {
      reason,
      session_id: actor.sessionId,
      before,
      reviewed_feedback: reviewedFeedback,
      after: { ...after, revision: Number(before.revision) + 1 },
    });
    await tx`update messages set next_attempt_at=now() where org_id=${orgId} and status='held' and claim_id is null`;
    // The policy/credential/message locks may outlive the original MFA window.
    await actor.authorize(tx);
  });
  return getSendingPolicy(sql, orgId);
}
export async function updateSendingCredential(
  sql: Sql,
  actor: OperatorActor,
  orgId: string,
  keyId: string,
  value: unknown,
) {
  const input = sendingCredentialUpdateSchema.parse(value);
  await sql.begin(async (tx) => {
    await actor.authorize(tx);
    await lockSendingPolicy(tx, orgId);
    const [policy] = await tx`select * from sending_policies where org_id=${orgId} for update`;
    if (!policy) throw new MailError(404, 'Organization not found');
    if (policy.revision !== input.expected_revision)
      throw new MailError(409, 'Sending policy changed; refresh before editing');
    if (
      input.critical_sending &&
      (policy.trust_tier !== 'pareto' || input.traffic_class !== 'transactional')
    )
      throw new MailError(422, 'Critical sending requires Pareto transactional authorization');
    if (input.traffic_class === 'marketing' && !policy.marketing_enabled)
      throw new MailError(422, 'Marketing sending requires explicit approval');
    const [before] =
      await tx`select id,mail_traffic_class,critical_sending from api_keys where org_id=${orgId} and id=${keyId} and revoked_at is null for update`;
    if (!before) throw new MailError(404, 'Active credential not found');
    await tx`update api_keys set mail_traffic_class=${input.traffic_class},critical_sending=${input.critical_sending} where org_id=${orgId} and id=${keyId}`;
    await tx`update sending_policies set revision=revision+1,updated_at=now() where org_id=${orgId}`;
    await policyAudit(tx, orgId, actor.actorId, 'operator.credential.updated', {
      ...input,
      key_id: keyId,
      session_id: actor.sessionId,
      before,
    });
    await actor.authorize(tx);
  });
  return getSendingPolicy(sql, orgId);
}
export async function restoreProtectedSuppression(
  sql: Sql,
  actor: OperatorActor,
  orgId: string,
  value: unknown,
) {
  const input = suppressionRestorationSchema.parse(value);
  await sql.begin(async (tx) => {
    await actor.authorize(tx);
    await lockSendingPolicy(tx, orgId);
    const [policy] =
      await tx`select revision from sending_policies where org_id=${orgId} for update`;
    if (!policy) throw new MailError(404, 'Organization not found');
    if (policy.revision !== input.expected_revision)
      throw new MailError(409, 'Sending policy changed; refresh before editing');
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${orgId}/${input.email}/suppression`},0))`;
    const [suppression] =
      await tx`delete from suppressions where org_id=${orgId} and address=${input.email} returning *`;
    if (!suppression) throw new MailError(404, 'Suppression not found');
    // Historical feedback remains immutable; restoration never erases reputation evidence.
    await tx`update sending_policies set revision=revision+1,updated_at=now() where org_id=${orgId}`;
    await policyAudit(tx, orgId, actor.actorId, 'operator.suppression.restored', {
      ...input,
      session_id: actor.sessionId,
      previous: suppression,
    });
    await actor.authorize(tx);
  });
  return { email: input.email, restored: true };
}
export async function evaluateFeedbackPolicy(sql: Sql, orgId: string) {
  await sql.begin(async (tx) => {
    await lockSendingPolicy(tx, orgId);
    const [policy] = await tx`select * from sending_policies where org_id=${orgId} for update`;
    if (!policy || policy.state !== 'approved') return;
    const feedback = await sendingFeedback(tx, orgId);
    const complaint = Number(feedback.unreviewed_complaints) >= Number(policy.complaint_threshold);
    const bounce =
      Number(feedback.unreviewed_hard_bounces) > 0 &&
      Number(feedback.recipients_24h) >= Number(policy.hard_bounce_min) &&
      Number(feedback.hard_bounces) / Number(feedback.recipients_24h) >=
        Number(policy.hard_bounce_rate);
    if (!complaint && !bounce) return;
    const reason = complaint ? 'complaint_threshold' : 'hard_bounce_threshold';
    await tx`update sending_policies set state='suspended',revision=revision+1,suspension_reason=${reason},updated_at=now() where org_id=${orgId}`;
    await policyAudit(tx, orgId, 'system', 'operator.sending_policy.auto_suspended', {
      reason,
      feedback,
      previous_revision: policy.revision,
    });
  });
}

export class SendingPolicyError extends MailError {
  constructor(
    status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(status, message);
  }
}
export async function sendingAdmission(
  tx: Transaction,
  p: Principal,
  requested: 'transactional' | 'marketing' | undefined,
  marketingSource: boolean,
) {
  await lockSendingPolicy(tx, p.orgId);
  const [policy] = await tx`select * from sending_policies where org_id=${p.orgId}`;
  if (!policy || policy.state !== 'approved')
    throw new SendingPolicyError(403, 'sending_not_approved', 'Sending requires operator approval');
  const [key] =
    p.kind === 'api_key'
      ? await tx`select mail_traffic_class,critical_sending from api_keys where id=${p.actorId} and org_id=${p.orgId} and environment_id=${p.environmentId} and revoked_at is null for share`
      : [];
  if (p.kind === 'api_key' && !key)
    throw new SendingPolicyError(
      403,
      'credential_unavailable',
      'The sending credential is no longer active',
    );
  const bound = key?.mail_traffic_class ?? policy.default_traffic_class;
  const trafficClass = marketingSource ? 'marketing' : (requested ?? bound);
  if (!trafficClass)
    throw new SendingPolicyError(
      403,
      'classification_required',
      'An approved traffic classification is required',
    );
  if (key?.mail_traffic_class && trafficClass !== key.mail_traffic_class)
    throw new SendingPolicyError(
      403,
      'credential_class_mismatch',
      'Traffic classification conflicts with the credential binding',
    );
  if (trafficClass === 'marketing' && !policy.marketing_enabled)
    throw new SendingPolicyError(
      403,
      'marketing_not_approved',
      'Marketing sending requires operator approval',
    );
  const critical =
    Boolean(key?.critical_sending) &&
    policy.trust_tier === 'pareto' &&
    trafficClass === 'transactional';
  return { policy, trafficClass: trafficClass as 'transactional' | 'marketing', critical };
}
export async function reserveSendingQuota(
  tx: Transaction,
  tenant: Tenant,
  id: string,
  recipients: string[],
  dailyLimit: number,
) {
  await lockSendingPolicy(tx, tenant.orgId);
  const [usage] =
    await tx`select count(*)::int as n from sending_quota where org_id=${tenant.orgId} and (state='reserved' or (state='consumed' and consumed_at>statement_timestamp()-interval '24 hours'))`;
  const existing =
    await tx`select recipient from sending_quota where org_id=${tenant.orgId} and message_id=${id} and state<>'released'`;
  const seen = new Set(existing.map((row) => String(row.recipient)));
  const additional = [...new Set(recipients)].filter((recipient) => !seen.has(recipient));
  if (Number(usage!.n) + additional.length > dailyLimit)
    throw new SendingPolicyError(
      429,
      'recipient_quota_exhausted',
      'Organization recipient allowance exhausted',
      60,
    );
  for (const recipient of additional)
    await tx`insert into sending_quota(org_id,environment_id,message_id,recipient,state) values(${tenant.orgId},${tenant.environmentId},${id},${recipient},'reserved') on conflict(org_id,message_id,recipient) do update set state='reserved' where sending_quota.state='released'`;
}
export async function releaseUnusedQuota(tx: Transaction, tenant: Tenant, id: string) {
  await lockSendingPolicy(tx, tenant.orgId);
  await tx`update sending_quota q set state='released' where org_id=${tenant.orgId} and message_id=${id} and state='reserved' and exists(select 1 from message_recipients r where r.message_id=q.message_id and r.org_id=q.org_id and r.address=q.recipient and r.status in ('canceled','suppressed','failed'))`;
}
