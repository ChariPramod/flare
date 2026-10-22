import { z } from 'zod';
import { toJson, withTenant } from '@flare/db';
import type { Transaction } from '@flare/db';
import { can, canSend, fingerprint, templateSchema } from '@flare/shared';
import type { Principal } from '@flare/shared';
import {
  address,
  authorizeMailSender,
  lockSendingPolicy,
  MailError,
  SendingPolicyError,
  submitEmails,
} from '@flare/mail';
import type { PipelineOptions } from '@flare/mail';
import { campaignAudienceSummary } from './campaigns.js';
import { campaignRecipientValues, renderContentPreview } from './campaign-content.js';
import { checkBroadcastOrigins, unsubscribeVariable } from './broadcasts.js';

export const campaignTestSchema = z
  .object({
    sandbox: z.boolean(),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    recipients: z
      .array(z.string().trim().email().max(254).toLowerCase())
      .min(1)
      .max(3)
      .refine(
        (values) => new Set(values).size === values.length,
        'Use distinct recipient addresses',
      ),
  })
  .strict();
export const campaignTestKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[\x21-\x7e]+$/);

async function savedCampaign(tx: Transaction, id: string) {
  const [campaign] = await tx`select * from broadcasts where id=${id} for share`;
  if (!campaign) throw new MailError(404, 'Broadcast not found');
  const [template] =
    await tx`select subject,html,text_body,variables from template_versions where template_id=${campaign.template_id} and version=${campaign.template_version}`;
  const revision = fingerprint(
    toJson({
      id,
      sender: campaign.sender,
      template_id: campaign.template_id,
      template_version: campaign.template_version,
      topic_id: campaign.topic_id,
      list_id: campaign.list_id,
      segment_id: campaign.segment_id,
      content: template ?? null,
    }),
  );
  return { campaign, template, revision };
}

function savedContent(template: Record<string, unknown> | undefined) {
  if (!template) throw new MailError(422, 'Pinned email content is unavailable');
  const parsed = templateSchema.safeParse({
    subject: template.subject,
    html: template.html,
    ...(template.text_body == null ? {} : { text: template.text_body }),
    variables: template.variables,
  });
  if (!parsed.success) throw new MailError(422, 'Pinned email content is invalid');
  if (!parsed.data.html.includes(unsubscribeVariable))
    throw new MailError(422, `Campaign HTML must include ${unsubscribeVariable}`);
  return parsed.data;
}

async function sampleEmail(
  tx: Transaction,
  template: Record<string, unknown> | undefined,
  email: string,
) {
  const content = savedContent(template);
  const properties = await tx`select name,fallback from contact_properties`;
  try {
    return renderContentPreview(
      content,
      campaignRecipientValues(
        content.variables,
        Object.fromEntries(properties.map((p) => [String(p.name), p.fallback])),
        { email, first_name: 'Test', last_name: 'Recipient', properties: {} },
        // A test must never carry a real contact's unsubscribe capability.
        'https://example.test/preferences/test-email',
      ),
    );
  } catch {
    throw new MailError(422, 'Pinned email content could not be rendered');
  }
}

export type CampaignCheck = {
  id: string;
  status: 'pass' | 'warning' | 'blocked';
  message: string;
  href: string;
  code?: string;
};
export async function campaignPreflight(options: PipelineOptions, p: Principal, id: string) {
  return withTenant(options.sql, p, async (tx) => {
    await lockSendingPolicy(tx, p.orgId);
    const { campaign, template, revision } = await savedCampaign(tx, id);
    const checks: CampaignCheck[] = [];
    const add = (id: string, status: CampaignCheck['status'], message: string, href: string) =>
      checks.push({ id, status, message, href });
    const sandbox =
      options.transports.length > 0 && options.transports.every((t) => t.sandbox === true);
    const [policy] =
      await tx`select state,marketing_enabled,daily_limit,per_minute_limit from sending_policies where org_id=${p.orgId}`;
    const [usage] =
      await tx`select count(*)::int as used from sending_quota where org_id=${p.orgId} and (state='reserved' or (state='consumed' and consumed_at>now()-interval '24 hours'))`;
    const remaining = Math.max(0, Number(policy?.daily_limit ?? 0) - Number(usage?.used ?? 0));
    add(
      'permission',
      can(p, 'write') ? 'pass' : 'blocked',
      can(p, 'write')
        ? 'Your role can submit campaign tests.'
        : 'A writable campaign role is required to send.',
      '/settings',
    );
    add(
      'approval',
      sandbox
        ? 'warning'
        : policy?.state === 'approved' && policy.marketing_enabled
          ? 'pass'
          : 'blocked',
      sandbox
        ? 'Mailpit sandbox: messages stay local. This does not prove real deliverability.'
        : `Organization: ${policy?.state ?? 'unavailable'}. Marketing ${policy?.marketing_enabled ? 'approved' : 'requires approval'}.`,
      '/emails',
    );
    try {
      await authorizeMailSender(
        tx,
        p,
        { from: String(campaign.sender), traffic_class: 'marketing' },
        options.transports,
        true,
      );
      add(
        'sender',
        'pass',
        sandbox
          ? 'Sender ownership and sandbox transport requirements pass.'
          : 'Sender ownership, approved marketing route, TLS and authentication freshness pass.',
        '/domains',
      );
    } catch (error) {
      if (!(error instanceof MailError)) throw error;
      checks.push({
        id: 'sender',
        status: 'blocked',
        message: error.message,
        href: '/domains',
        ...(error instanceof SendingPolicyError ? { code: error.code } : {}),
      });
    }
    try {
      const preview = await sampleEmail(tx, template, 'test@example.test');
      add(
        'content',
        preview.missing_variable_count || !preview.text ? 'warning' : 'pass',
        preview.missing_variable_count
          ? `${preview.missing_variable_count} sample values are empty; review personalization before sending.`
          : !preview.text
            ? 'HTML is valid. Add a plain-text alternative for broader compatibility.'
            : 'Pinned content and preference marker are valid.',
        `/templates/${campaign.template_id}?version=${campaign.template_version}`,
      );
    } catch (error) {
      add(
        'content',
        'blocked',
        error instanceof MailError ? error.message : 'Pinned content could not be rendered.',
        `/templates/${campaign.template_id}`,
      );
    }
    let audience: Awaited<ReturnType<typeof campaignAudienceSummary>> | null = null;
    try {
      audience = await campaignAudienceSummary(
        tx,
        campaign,
        campaign.status === 'draft' ? undefined : id,
      );
      add(
        'audience',
        audience.eligible ? 'pass' : 'blocked',
        `${audience.eligible} eligible; ${audience.total - audience.eligible} excluded by preferences, suppression or deletion.`,
        '/audience',
      );
    } catch (error) {
      if (!(error instanceof MailError)) throw error;
      add('audience', 'blocked', error.message, '/audience');
    }
    add(
      'quota',
      sandbox
        ? 'pass'
        : remaining === 0
          ? 'blocked'
          : remaining < (audience?.eligible ?? 0)
            ? 'warning'
            : 'pass',
      sandbox
        ? 'Isolated sandbox tests do not consume real sending allowance.'
        : `${remaining} recipients available now; ${policy?.per_minute_limit ?? 0}/minute dispatch limit. Capacity is checked again when work is accepted.`,
      '/emails',
    );
    try {
      checkBroadcastOrigins(options.transports);
      add(
        'links',
        'pass',
        'Preference-link origins are configured for this environment.',
        '/settings',
      );
    } catch (error) {
      if (!(error instanceof MailError)) throw error;
      add('links', 'blocked', error.message, '/settings');
    }
    return {
      revision,
      sandbox,
      checked_at: new Date().toISOString(),
      checks,
      audience,
      quota: {
        remaining,
        daily_limit: Number(policy?.daily_limit ?? 0),
        per_minute_limit: Number(policy?.per_minute_limit ?? 0),
      },
      ready: checks.every((check) => check.status !== 'blocked'),
      can_test: checks.every(
        (check) => ['audience', 'links'].includes(check.id) || check.status !== 'blocked',
      ),
    };
  });
}

export async function sendCampaignTest(
  options: PipelineOptions,
  p: Principal,
  id: string,
  source: z.input<typeof campaignTestSchema>,
  requestKey: string,
) {
  if (!can(p, 'write'))
    throw new MailError(403, 'A writable campaign role is required to send tests');
  const input = campaignTestSchema.parse(source);
  const key = campaignTestKeySchema.parse(requestKey);
  const hash = fingerprint(toJson({ id, ...input }));
  return withTenant(options.sql, p, async (tx) => {
    // Same order as admission, operator changes and dispatch; acceptance is one transaction.
    await lockSendingPolicy(tx, p.orgId);
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${p.orgId}/${p.environmentId}/campaign.test/${key}`},0))`;
    const { campaign, template, revision } = await savedCampaign(tx, id);
    await tx`delete from idempotency where operation='campaign.test' and key=${key} and expires_at<=now()`;
    const [cached] =
      await tx`select body_hash,response from idempotency where operation='campaign.test' and key=${key}`;
    if (cached) {
      if (cached.body_hash !== hash)
        throw new MailError(409, 'Idempotency key was used with a different test');
      const response = cached.response as CampaignTestResult;
      // Check the accepted messages, not an editable campaign's current sender.
      if (p.domainId) {
        const visible =
          await tx`select id from messages where id in ${tx(response.data.map((item) => item.id))} and domain_id=${p.domainId}`;
        if (visible.length !== response.data.length)
          throw new MailError(403, 'API key cannot access this test sender');
      }
      return response;
    }
    const [domain] =
      await tx`select id from domains where name=${address(String(campaign.sender)).split('@')[1]!}`;
    if (!domain || !canSend(p, String(domain.id)))
      throw new MailError(403, 'API key cannot send from this domain');
    const sandbox =
      options.transports.length > 0 && options.transports.every((t) => t.sandbox === true);
    if (input.sandbox !== sandbox)
      throw new MailError(
        409,
        'Delivery mode changed; refresh the checklist before sending a test',
      );
    if (revision !== input.revision)
      throw new MailError(409, 'Campaign changed; refresh the checklist before sending a test');
    const data: CampaignTestResult['data'] = [];
    for (const recipient of input.recipients) {
      const [contact] =
        await tx`select id,unsubscribed,deleted_at from contacts where email=${recipient} for share`;
      if (contact) {
        if (contact.unsubscribed || contact.deleted_at)
          throw new MailError(422, 'A test recipient has opted out or was deleted');
        if (campaign.topic_id) {
          const [topic] =
            await tx`select coalesce(p.enabled,t.default_opt_in) as enabled from audience_topics t left join contact_topic_preferences p on p.topic_id=t.id and p.contact_id=${contact.id} and p.org_id=t.org_id and p.environment_id=t.environment_id where t.id=${campaign.topic_id}`;
          if (!topic?.enabled)
            throw new MailError(422, 'A test recipient has not opted into this topic');
        }
      }
      const rendered = await sampleEmail(tx, template, recipient);
      const accepted = await submitEmails(
        options,
        p,
        [
          {
            from: String(campaign.sender),
            to: [recipient],
            subject: `[TEST] ${rendered.subject}`,
            html: `<p><strong>Flare test email.</strong> Sample personalization; preference links are disabled.</p>${rendered.html}`,
            ...(rendered.text == null
              ? {}
              : { text: `Flare test email. Preference links are disabled.\n\n${rendered.text}` }),
            traffic_class: 'marketing',
            tags: [{ name: 'campaign_test', value: id }],
            headers: { 'X-Campaign-Test': id },
          },
        ],
        {
          transaction: tx,
          ...(contact
            ? {
                campaign: {
                  contactId: String(contact.id),
                  topicId: campaign.topic_id ? String(campaign.topic_id) : null,
                },
              }
            : {}),
        },
      );
      const messageId = accepted.data[0]!.id;
      const [message] = await tx`select status from messages where id=${messageId}`;
      data.push({ id: messageId, status: String(message!.status) });
    }
    const response: CampaignTestResult = {
      data,
      sandbox: options.transports.length > 0 && options.transports.every((t) => t.sandbox === true),
      template_version: Number(campaign.template_version),
      revision,
      replay_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    await tx`insert into idempotency(org_id,environment_id,operation,key,body_hash,response) values(${p.orgId},${p.environmentId},'campaign.test',${key},${hash},${tx.json(toJson(response))})`;
    await tx`insert into audit_logs(org_id,environment_id,actor_id,action,resource_id,metadata) values(${p.orgId},${p.environmentId},${p.actorId},'broadcast.test_accepted',${id},${tx.json({ message_ids: data.map((item) => item.id), template_version: response.template_version })})`;
    return response;
  });
}
export type CampaignTestResult = {
  data: { id: string; status: string }[];
  sandbox: boolean;
  template_version: number;
  revision: string;
  replay_until: string;
};
