import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { fingerprint, templateSchema, validateTemplate } from '@flare/shared';
import type { Principal, Segment, Tenant } from '@flare/shared';
import { address, MailError, outbox } from '@flare/mail';
import { segmentWhere } from './audience.js';

const uuid = z.string().uuid();
export const campaignDraftSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sender: z.string().trim().min(3).max(998),
    template_id: uuid.optional(),
    template_version: z.number().int().positive().optional(),
    content: templateSchema.optional(),
    list_id: uuid.nullable().default(null),
    segment_id: uuid.nullable().default(null),
    topic_id: uuid.nullable().default(null),
    rate_per_second: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.list_id && input.segment_id)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a contact list or a segment' });
    if (
      input.content
        ? input.template_id !== undefined || input.template_version !== undefined
        : !input.template_id || !input.template_version
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Supply email content or a template ID and version',
      });
  });
export type CampaignDraft = z.infer<typeof campaignDraftSchema>;
type AudienceSelection = {
  list_id?: string | null;
  segment_id?: string | null;
  topic_id?: string | null;
};

/** Resolve only tenant-visible selectors; a missing list must never widen to all contacts. */
export async function campaignAudienceMatch(tx: Transaction, selection: AudienceSelection) {
  if (selection.list_id && selection.segment_id)
    throw new MailError(422, 'Choose a contact list or a segment');
  let match = tx`true`;
  if (selection.list_id) {
    const [list] = await tx`select id from contact_lists where id=${selection.list_id}`;
    if (!list) throw new MailError(422, 'Contact list not found in this environment');
    match = tx`exists(select 1 from contact_list_members lm where lm.list_id=${selection.list_id} and lm.org_id=c.org_id and lm.environment_id=c.environment_id and lm.contact_id=c.id)`;
  }
  if (selection.segment_id) {
    const [segment] =
      await tx`select definition from audience_segments where id=${selection.segment_id}`;
    if (!segment) throw new MailError(422, 'Segment not found in this environment');
    match = segmentWhere(tx, segment.definition as Segment);
  }
  if (selection.topic_id) {
    const [topic] = await tx`select id from audience_topics where id=${selection.topic_id}`;
    if (!topic) throw new MailError(422, 'Audience topic not found in this environment');
  }
  return { match };
}

/** Counts are mutually exclusive, with the same preference checks used before delivery. */
export async function campaignAudienceSummary(
  tx: Transaction,
  selection: AudienceSelection,
  snapshotId?: string,
) {
  const { match: currentMatch } = await campaignAudienceMatch(tx, selection);
  const match = snapshotId
    ? tx`exists(select 1 from broadcast_recipients r where r.broadcast_id=${snapshotId} and r.org_id=c.org_id and r.environment_id=c.environment_id and r.contact_id=c.id)`
    : currentMatch;
  const topicEnabled = selection.topic_id
    ? tx`coalesce((select coalesce(p.enabled,t.default_opt_in) from audience_topics t left join contact_topic_preferences p on p.org_id=t.org_id and p.environment_id=t.environment_id and p.topic_id=t.id and p.contact_id=c.id where t.id=${selection.topic_id} and t.org_id=c.org_id and t.environment_id=c.environment_id),false)`
    : tx`true`;
  const included = snapshotId ? tx`true` : tx`c.deleted_at is null`;
  const reason = tx`case when c.deleted_at is not null then 'deleted' when c.unsubscribed then 'unsubscribed' when exists(select 1 from suppressions s where s.org_id=c.org_id and s.address=c.email) then 'suppressed' when not ${topicEnabled} then 'topic_opt_out' else 'eligible' end`;
  const counts =
    await tx`select ${reason} as reason,count(*)::int as count from contacts c where ${included} and ${match} group by 1`;
  const count = (key: string) => Number(counts.find((row) => row.reason === key)?.count ?? 0);
  const sample =
    await tx`select c.id,c.email,c.first_name,c.last_name from contacts c where c.deleted_at is null and ${match} and ${reason}='eligible' order by c.email,c.id limit 5`;
  return {
    total: counts.reduce((total, row) => total + Number(row.count), 0),
    eligible: count('eligible'),
    excluded: {
      unsubscribed: count('unsubscribed'),
      suppressed: count('suppressed'),
      topic_opt_out: count('topic_opt_out'),
      deleted: count('deleted'),
    },
    sample: sample.map((row) => ({
      id: String(row.id),
      email: String(row.email),
      first_name: String(row.first_name),
      last_name: String(row.last_name),
    })),
    snapshot: Boolean(snapshotId),
  };
}

export async function previewCampaignAudience(sql: Sql, tenant: Tenant, id: string) {
  return withTenant(sql, tenant, async (tx) => {
    const [row] = await tx`select * from broadcasts where id=${id}`;
    if (!row) throw new MailError(404, 'Broadcast not found');
    return campaignAudienceSummary(tx, row, row.status === 'draft' ? undefined : String(row.id));
  });
}

async function campaignTemplate(
  tx: Transaction,
  principal: Principal,
  campaignId: string,
  input: CampaignDraft,
) {
  if (!input.content) {
    const [template] =
      await tx`select t.id,v.version from email_templates t join template_versions v on v.template_id=t.id and v.org_id=t.org_id and v.environment_id=t.environment_id where t.id=${input.template_id!} and v.version=${input.template_version!} and not t.archived`;
    if (!template) throw new MailError(422, 'Template version not found in this environment');
    return { templateId: String(template.id), version: Number(template.version) };
  }
  const [environment] =
    await tx`select name from environments where id=${principal.environmentId} and org_id=${principal.orgId}`;
  if (!environment) throw new MailError(404, 'Environment not found');
  if (environment.name === 'Production')
    throw new MailError(
      403,
      'Compose campaign content in Development and publish it to Production',
    );
  let content: z.infer<typeof templateSchema>;
  try {
    content = validateTemplate(input.content);
  } catch (error) {
    throw new MailError(422, (error as Error).message);
  }
  // Campaign-owned versions keep edits independent from reusable shared templates.
  const identifier = `campaign-${campaignId}`;
  let [template] =
    await tx`select id,current_version from email_templates where identifier=${identifier} for update`;
  if (template) {
    [template] =
      await tx`update email_templates set current_version=current_version+1,updated_at=now() where id=${template.id} returning id,current_version`;
  } else {
    [template] =
      await tx`insert into email_templates(org_id,environment_id,name,identifier) values(${principal.orgId},${principal.environmentId},${input.name},${identifier}) returning id,current_version`;
  }
  await tx`insert into template_versions(org_id,environment_id,template_id,version,subject,html,text_body,variables) values(${principal.orgId},${principal.environmentId},${template!.id},${template!.current_version},${content.subject},${content.html},${content.text ?? null},${tx.json(toJson(content.variables))})`;
  await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id,metadata) values(${principal.orgId},${principal.environmentId},${principal.actorId},'template.campaign_version_created',${template!.id},${tx.json({ version: Number(template!.current_version), campaign_id: campaignId })})`;
  return { templateId: String(template!.id), version: Number(template!.current_version) };
}

export async function createCampaign(
  sql: Sql,
  principal: Principal,
  source: CampaignDraft,
  requestKey?: string,
) {
  const input = campaignDraftSchema.parse(source);
  if (requestKey !== undefined && !z.string().min(1).max(200).safeParse(requestKey).success)
    throw new MailError(422, 'Idempotency keys must be 1–200 characters');
  address(input.sender);
  const requestHash = requestKey === undefined ? null : fingerprint(toJson(input));
  return withTenant(sql, principal, async (tx) => {
    if (requestKey !== undefined) {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${principal.orgId}/${principal.environmentId}/campaign.create/${requestKey}`},0))`;
      const [existing] = await tx`select * from broadcasts where creation_key=${requestKey}`;
      if (existing) {
        if (existing.creation_hash !== requestHash)
          throw new MailError(409, 'Idempotency key was used with a different campaign');
        return existing;
      }
    }
    await campaignAudienceMatch(tx, input);
    const id = randomUUID();
    const template = await campaignTemplate(tx, principal, id, input);
    const [row] =
      await tx`insert into broadcasts(id,org_id,environment_id,name,sender,template_id,template_version,list_id,segment_id,topic_id,rate_per_second,creation_key,creation_hash) values(${id},${principal.orgId},${principal.environmentId},${input.name},${input.sender},${template.templateId},${template.version},${input.list_id},${input.segment_id},${input.topic_id},${input.rate_per_second},${requestKey ?? null},${requestHash}) returning *`;
    await outbox(tx, principal, 'broadcast.created', { id });
    await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id) values(${principal.orgId},${principal.environmentId},${principal.actorId},'broadcast.created',${id})`;
    return row!;
  });
}

export async function updateCampaign(
  sql: Sql,
  principal: Principal,
  id: string,
  source: CampaignDraft,
) {
  const input = campaignDraftSchema.parse(source);
  address(input.sender);
  return withTenant(sql, principal, async (tx) => {
    const [old] = await tx`select status from broadcasts where id=${id} for update`;
    if (!old) throw new MailError(404, 'Broadcast not found');
    if (old.status !== 'draft') throw new MailError(409, 'Only drafts can be edited');
    await campaignAudienceMatch(tx, input);
    const template = await campaignTemplate(tx, principal, id, input);
    const [row] =
      await tx`update broadcasts set name=${input.name},sender=${input.sender},template_id=${template.templateId},template_version=${template.version},list_id=${input.list_id},segment_id=${input.segment_id},topic_id=${input.topic_id},rate_per_second=${input.rate_per_second},updated_at=now() where id=${id} returning *`;
    await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id) values(${principal.orgId},${principal.environmentId},${principal.actorId},'broadcast.updated',${id})`;
    return row!;
  });
}
