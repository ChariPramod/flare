import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import {
  canSend,
  preferenceToken,
  renderText,
  templateSchema,
  validateTemplate,
} from '@flare/shared';
import type { Tenant, Principal, Segment } from '@flare/shared';
import {
  MailError,
  submitEmails,
  outbox,
  schedule,
  address,
  lockSendingPolicy,
  releaseUnusedQuota,
} from '@flare/mail';
import type { PipelineOptions } from '@flare/mail';
import { segmentWhere } from './audience.js';
import { sendingPause } from './sending-pause.js';
export const unsubscribeVariable = '{{{FLARE_UNSUBSCRIBE_URL}}}';
function checkOrigins() {
  if (
    process.env.NODE_ENV === 'production' &&
    ![process.env.PUBLIC_API_URL, process.env.WEB_ORIGIN].every((v) => v?.startsWith('https://'))
  )
    throw new MailError(503, 'Production broadcasts require HTTPS PUBLIC_API_URL and WEB_ORIGIN');
}
export async function scheduleBroadcast(sql: Sql, p: Principal, id: string, at?: string) {
  checkOrigins();
  return withTenant(sql, p, async (tx) => {
    const [row] = await tx`select * from broadcasts where id=${id} for update`;
    if (!row) throw new MailError(404, 'Broadcast not found');
    if (!['draft', 'scheduled'].includes(String(row.status)))
      throw new MailError(409, 'Only draft or scheduled broadcasts can be scheduled');
    const [template] =
      await tx`select * from template_versions where template_id=${row.template_id} and version=${row.template_version}`;
    if (!template || !String(template.html).includes(unsubscribeVariable))
      throw new MailError(422, `Broadcast HTML must include ${unsubscribeVariable}`);
    const domainName = address(String(row.sender)).split('@')[1]!;
    const [domain] =
      await tx`select id from domains where name=${domainName} and status='verified' and sending=true`;
    if (!domain) throw new MailError(403, `Sender domain ${domainName} is not verified`);
    if (!canSend(p, String(domain.id)))
      throw new MailError(403, 'API key cannot send from this domain');
    let match = tx`true`;
    if (row.segment_id) {
      const [segment] =
        await tx`select definition from audience_segments where id=${row.segment_id}`;
      if (!segment) throw new MailError(422, 'Segment not found');
      match = segmentWhere(tx, segment.definition as Segment);
    }
    const due = schedule(at);
    // Freeze audience membership atomically when scheduled; preferences are checked again before every delivery.
    await tx`delete from broadcast_recipients where broadcast_id=${id}`;
    await tx`insert into broadcast_recipients(org_id,environment_id,broadcast_id,contact_id) select c.org_id,c.environment_id,${id},c.id from contacts c where c.deleted_at is null and ${match}`;
    await tx`update broadcasts set status='scheduled',scheduled_at=${due},next_dispatch_at=${due},error=null,updated_at=now() where id=${id}`;
    await outbox(tx, p, 'broadcast.scheduled', { id, scheduled_at: due.toISOString() });
    return { id, status: 'scheduled', scheduled_at: due };
  });
}
export async function cancelBroadcast(sql: Sql, tenant: Tenant, id: string) {
  return withTenant(sql, tenant, async (tx) => {
    await lockSendingPolicy(tx, tenant.orgId);
    const [row] = await tx`select status from broadcasts where id=${id} for update`;
    if (!row) throw new MailError(404, 'Broadcast not found');
    if (row.status === 'sent') throw new MailError(409, 'Broadcast submission has completed');
    await tx`update broadcasts set status='canceled',finished_at=now(),updated_at=now() where id=${id}`;
    await tx`update broadcast_recipients set status='canceled' where broadcast_id=${id} and status='pending'`;
    const messages =
      await tx`update messages set status='canceled',claim_id=null,lease_until=null,hold_reason=null,updated_at=now() where broadcast_id=${id} and status in ('queued','scheduled','held') and delivery_started_at is null returning id`;
    for (const m of messages) {
      await tx`update message_recipients set status='canceled' where message_id=${m.id} and status='queued'`;
      await releaseUnusedQuota(tx, tenant, String(m.id));
      await outbox(tx, tenant, 'email.canceled', { email_id: m.id });
    }
    if (row.status !== 'canceled') await outbox(tx, tenant, 'broadcast.canceled', { id });
    return { id, status: 'canceled', canceled_messages: messages.length };
  });
}
export async function dispatchBroadcast(
  options: PipelineOptions,
  id: string,
  preferenceBase: string,
) {
  checkOrigins();
  const [lookup] = await options.sql`select org_id,environment_id from broadcasts where id=${id}`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) };
  return withTenant(options.sql, tenant, async (tx) => {
    // Delivery locks the organization before message and campaign rows.
    await lockSendingPolicy(tx, tenant.orgId);
    const [broadcast] =
      await tx`select * from broadcasts where id=${id} and status in ('scheduled','sending') and next_dispatch_at<=now() for update skip locked`;
    if (!broadcast) return;
    const [version] =
      await tx`select * from template_versions where template_id=${broadcast.template_id} and version=${broadcast.template_version}`;
    if (!version) throw new MailError(422, 'Pinned template missing');
    const template = validateTemplate(
      templateSchema.parse({
        subject: version.subject,
        html: version.html,
        text: version.text_body ?? undefined,
        variables: version.variables,
      }),
    );
    if (broadcast.status === 'scheduled') await outbox(tx, tenant, 'broadcast.started', { id });
    await tx`update broadcasts set status='sending',started_at=coalesce(started_at,now()),error=null where id=${id}`;
    const definitions = await tx`select name,fallback from contact_properties`;
    const fallback = Object.fromEntries(definitions.map((p) => [String(p.name), p.fallback]));
    const recipients =
      await tx`select r.contact_id,c.* from broadcast_recipients r join contacts c on c.id=r.contact_id and c.org_id=r.org_id and c.environment_id=r.environment_id where r.broadcast_id=${id} and r.status='pending' order by r.contact_id limit ${Number(broadcast.rate_per_second)} for update of r,c`;
    const principal: Principal = {
      ...tenant,
      actorId: 'broadcast-worker',
      kind: 'session',
      role: 'owner',
      production: false,
    };
    for (const [index, contact] of recipients.entries()) {
      const [topic] = broadcast.topic_id
        ? await tx`select coalesce(p.enabled,t.default_opt_in) as enabled from audience_topics t left join contact_topic_preferences p on p.topic_id=t.id and p.org_id=t.org_id and p.environment_id=t.environment_id and p.contact_id=${contact.id} where t.id=${broadcast.topic_id}`
        : [];
      const suppressed = await tx`select address from suppressions where address=${contact.email}`;
      if (
        contact.unsubscribed ||
        contact.deleted_at ||
        (broadcast.topic_id && !topic?.enabled) ||
        suppressed.length
      ) {
        await tx`update broadcast_recipients set status='skipped',error='Unsubscribed, topic opt-out, deleted or suppressed' where broadcast_id=${id} and contact_id=${contact.id}`;
        continue;
      }
      try {
        await tx.savepoint(async (sp) => {
          const token = preferenceToken(
            {
              ...tenant,
              contactId: String(contact.id),
              exp: Math.floor(Date.now() / 1000) + 365 * 86400,
            },
            options.trackingKey,
          );
          const preferenceUrl = `${preferenceBase.replace(/\/$/, '')}/preferences/${token}`;
          const oneClick = `${(process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/v1/preferences/${token}/unsubscribe`;
          const values = {
            ...template.variables,
            ...fallback,
            ...Object.fromEntries(
              Object.entries(contact.properties).filter(([, value]) => value !== null),
            ),
            email: contact.email,
            first_name: contact.first_name,
            last_name: contact.last_name,
            FLARE_UNSUBSCRIBE_URL: preferenceUrl,
          };
          const email = {
            from: String(broadcast.sender),
            to: [String(contact.email)],
            subject: renderText(template.subject, values),
            html: renderText(template.html, values, true),
            text: template.text ? renderText(template.text, values) : undefined,
            tags: [{ name: 'broadcast', value: id }],
            headers: {
              'List-Unsubscribe': `<${oneClick}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          };
          const result = await submitEmails(options, principal, [email], {
            transaction: sp,
            campaign: {
              broadcastId: id,
              contactId: String(contact.id),
              topicId: broadcast.topic_id ? String(broadcast.topic_id) : null,
            },
          });
          await sp`update broadcast_recipients set status='queued',message_id=${result.data[0]!.id},error=null where broadcast_id=${id} and contact_id=${contact.id}`;
        });
      } catch (error) {
        const pause = sendingPause(error);
        if (pause) {
          // The savepoint rolled back this recipient's mail and quota. Preserve
          // earlier accepted recipients and retry this same pending recipient.
          await tx`update broadcast_recipients set error=${pause.reason} where broadcast_id=${id} and contact_id=${contact.id} and status='pending'`;
          await tx`update broadcasts set error=${pause.reason},next_dispatch_at=now()+${pause.seconds}*interval '1 second',updated_at=now() where id=${id}`;
          return { processed: index, finished: false, paused: true, retry_after: pause.seconds };
        }
        if (!(error instanceof MailError)) throw error;
        await tx`update broadcast_recipients set status='failed',error=${error.message.slice(0, 500)} where broadcast_id=${id} and contact_id=${contact.id}`;
      }
    }
    const [pending] =
      await tx`select count(*)::int as n from broadcast_recipients where broadcast_id=${id} and status='pending'`;
    const finished = Number(pending!.n) === 0;
    await tx`update broadcasts set status=${finished ? 'sent' : 'sending'},next_dispatch_at=now()+interval '1 second',finished_at=${finished ? new Date() : null},updated_at=now() where id=${id}`;
    if (finished)
      await outbox(tx, tenant, 'broadcast.sent', {
        id,
        meaning: 'Audience submission completed; inspect message outcomes for delivery',
      });
    return { processed: recipients.length, finished };
  });
}
export async function broadcastStats(sql: Sql, tenant: Tenant, id: string) {
  return withTenant(sql, tenant, async (tx) => ({
    recipients:
      await tx`select r.status,count(*)::int as count from broadcast_recipients r where broadcast_id=${id} group by r.status`,
    messages:
      await tx`select m.status,count(*)::int as count from messages m where broadcast_id=${id} group by m.status`,
    events:
      await tx`select e.type,count(distinct e.message_id)::int as count from delivery_events e join messages m on m.id=e.message_id and m.org_id=e.org_id and m.environment_id=e.environment_id where m.broadcast_id=${id} and coalesce(e.data->>'machine','false')!='true' group by e.type`,
  }));
}
