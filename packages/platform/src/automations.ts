import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import {
  automationSchema,
  automationEventSchema,
  canSend,
  conditionMatches,
  fingerprint,
  preferenceToken,
  renderText,
} from '@flare/shared';
import type { Automation, Principal, Tenant } from '@flare/shared';
import { address, MailError, outbox, submitEmails } from '@flare/mail';
import type { PipelineOptions } from '@flare/mail';

export async function validateAutomation(
  tx: Transaction,
  principal: Principal,
  definition: Automation,
) {
  for (const step of definition.steps) {
    if (step.type !== 'send_email') continue;
    const [domain] =
      await tx`select id from domains where name=${address(step.from).split('@')[1]!} and sending=true`;
    if (!domain || !canSend(principal, String(domain.id)))
      throw new MailError(403, 'Automation sender domain is unavailable or outside API-key scope');
    const [template] =
      await tx`select html from template_versions where template_id=${step.template_id} and version=${step.template_version}`;
    if (!template) throw new MailError(422, `Template version for ${step.id} not found`);
    if (!String(template.html).includes('{{{FLARE_UNSUBSCRIBE_URL}}}'))
      throw new MailError(422, 'Automation email requires a preference link');
  }
}
export async function createAutomationEvent(sql: Sql, tenant: Tenant, raw: unknown) {
  const input = automationEventSchema.parse(raw);
  return withTenant(sql, tenant, async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${tenant.orgId}/${tenant.environmentId}/automation-event/${input.external_id}`},0))`;
    const [existing] =
      await tx`select * from automation_events where external_id=${input.external_id}`;
    if (existing) {
      if (
        fingerprint({
          contact_id: existing.contact_id,
          name: existing.name,
          data: existing.data,
        }) !== fingerprint({ contact_id: input.contact_id, name: input.name, data: input.data })
      )
        throw new MailError(409, 'Event ID is already used with different content');
      return { id: String(existing.id), duplicate: true };
    }
    const [contact] =
      await tx`select id from contacts where id=${input.contact_id} and deleted_at is null`;
    if (!contact) throw new MailError(404, 'Contact not found');
    const [row] =
      await tx`insert into automation_events(org_id,environment_id,contact_id,name,external_id,data) values(${tenant.orgId},${tenant.environmentId},${input.contact_id},${input.name},${input.external_id},${tx.json(toJson(input.data))}) returning id`;
    return { id: String(row!.id), duplicate: false };
  });
}
// Each consumer keeps its own outbox cursor. Webhook delivery cannot consume an automation event.
export async function fanOutAutomationEvents(sql: Sql) {
  await sql.begin(async (tx) => {
    const events =
      await tx`select * from event_outbox where automation_dispatched_at is null order by created_at,id limit 100 for update skip locked`;
    for (const event of events) {
      let contactId: string | undefined;
      if (!event.target_endpoint_id && String(event.type).startsWith('contact.'))
        contactId = event.data.id;
      else if (!event.target_endpoint_id && event.data.email_id) {
        const [message] =
          await tx`select contact_id from messages where id=${event.data.email_id} and org_id=${event.org_id} and environment_id=${event.environment_id}`;
        contactId = message?.contact_id;
      }
      if (contactId && /^[0-9a-f-]{36}$/i.test(contactId))
        await tx`insert into automation_events(org_id,environment_id,contact_id,name,external_id,data,created_at) select ${event.org_id},${event.environment_id},id,${event.type},${`outbox:${event.id}`},${tx.json(event.data)},${event.created_at} from contacts where id=${contactId} and org_id=${event.org_id} and environment_id=${event.environment_id} on conflict(org_id,environment_id,external_id) do nothing`;
      await tx`update event_outbox set automation_dispatched_at=now() where id=${event.id}`;
    }
  });
  return sql.begin(async (tx) => {
    const events =
      await tx`select * from automation_events where dispatched_at is null order by created_at,id limit 100 for update skip locked`;
    let created = 0;
    for (const event of events) {
      const definitions =
        await tx`select * from automations where enabled=true and org_id=${event.org_id} and environment_id=${event.environment_id} and definition->>'trigger'=${event.name} and created_at<=${event.created_at}`;
      for (const row of definitions) {
        const definition = automationSchema.parse(row.definition);
        const runs =
          await tx`insert into automation_runs(org_id,environment_id,automation_id,contact_id,event_id,definition,revision,current_step) values(${event.org_id},${event.environment_id},${row.id},${event.contact_id},${event.id},${tx.json(toJson(definition))},${row.revision},${definition.entry}) on conflict(automation_id,event_id) do nothing returning id`;
        created += runs.length;
      }
      // Wake wait-for-event steps promptly; the step itself validates the time window and event name.
      await tx`update automation_runs set next_step_at=now() where org_id=${event.org_id} and environment_id=${event.environment_id} and contact_id=${event.contact_id} and status='waiting'`;
      await tx`update automation_events set dispatched_at=now() where id=${event.id}`;
    }
    return created;
  });
}
export async function cancelAutomation(sql: Sql, tenant: Tenant, id: string) {
  return withTenant(sql, tenant, async (tx) => {
    const [run] = await tx`select status from automation_runs where id=${id} for update`;
    if (!run) throw new MailError(404, 'Automation run not found');
    if (!['queued', 'waiting', 'canceled'].includes(String(run.status)))
      throw new MailError(409, 'Run is already terminal');
    await tx`update automation_runs set status='canceled',finished_at=now(),updated_at=now() where id=${id}`;
    await tx`update automation_steps set status='canceled',finished_at=now() where run_id=${id} and status='waiting'`;
    const messages =
      await tx`update messages set status='canceled',updated_at=now() where automation_run_id=${id} and status in ('queued','scheduled') and delivery_started_at is null returning id`;
    for (const message of messages) {
      await tx`update message_recipients set status='canceled' where message_id=${message.id} and status='queued'`;
      await outbox(tx, tenant, 'email.canceled', { email_id: message.id });
    }
    if (run.status !== 'canceled') await outbox(tx, tenant, 'automation.canceled', { id });
    return { id, status: 'canceled' };
  });
}
export async function advanceAutomation(options: PipelineOptions, id: string) {
  const [lookup] =
    await options.sql`select org_id,environment_id from automation_runs where id=${id}`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) };
  return withTenant(options.sql, tenant, async (tx) => {
    const [run] =
      await tx`select * from automation_runs where id=${id} and status in ('queued','waiting') and next_step_at<=now() for update skip locked`;
    if (!run) return;
    const [contact] = await tx`select * from contacts where id=${run.contact_id} for update`;
    if (!contact || contact.deleted_at || contact.unsubscribed) {
      await tx`update automation_runs set status='canceled',error='Contact deleted or unsubscribed',finished_at=now(),updated_at=now() where id=${id}`;
      await tx`update automation_steps set status='canceled',finished_at=now() where run_id=${id} and status='waiting'`;
      await outbox(tx, tenant, 'automation.canceled', {
        id,
        reason: 'Contact unavailable or unsubscribed',
      });
      return;
    }
    const definition = automationSchema.parse(run.definition),
      step = definition.steps.find((s) => s.id === run.current_step)!;
    const [event] = await tx`select data from automation_events where id=${run.event_id}`;
    const data = { contact: { ...contact, properties: contact.properties }, event: event!.data };
    const [record] =
      await tx`select * from automation_steps where run_id=${id} and step_id=${step.id}`;
    let next: string | null =
      step.type === 'condition'
        ? conditionMatches(step.condition, data)
          ? step.then
          : step.else
        : step.next;
    let messageId: string | null = null,
      matchedEvent: string | null = null;
    if (step.type === 'wait' || step.type === 'wait_for_event') {
      if (!record || (record.status === 'failed' && !record.wake_at)) {
        const seconds = step.type === 'wait' ? step.seconds : step.timeout_seconds;
        await tx`insert into automation_steps(org_id,environment_id,run_id,step_id,type,status,wake_at) values(${tenant.orgId},${tenant.environmentId},${id},${step.id},${step.type},'waiting',now()+${seconds}*interval '1 second') on conflict(org_id,environment_id,run_id,step_id) do update set status='waiting',wake_at=excluded.wake_at,error=null,finished_at=null`;
        await tx`update automation_runs set status='waiting',next_step_at=now()+${seconds}*interval '1 second',attempts=0,error=null,updated_at=now() where id=${id}`;
        return { status: 'waiting' };
      }
      if (step.type === 'wait_for_event') {
        const [match] =
          await tx`select id from automation_events where contact_id=${contact.id} and name=${step.event} and created_at>=${record.started_at} and created_at<=${record.wake_at} and id!=${run.event_id} order by created_at,id limit 1`;
        matchedEvent = match ? String(match.id) : null;
        if (!match) next = step.on_timeout;
      }
      if (!matchedEvent && new Date(record.wake_at).getTime() > Date.now()) {
        await tx`update automation_runs set next_step_at=${record.wake_at} where id=${id}`;
        return { status: 'waiting' };
      }
    }
    if (step.type === 'send_email') {
      const publicApi = process.env.PUBLIC_API_URL ?? 'http://localhost:4000',
        web = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      if (
        process.env.NODE_ENV === 'production' &&
        (!publicApi.startsWith('https://') || !web.startsWith('https://'))
      )
        throw new MailError(503, 'Automation preference endpoints require HTTPS');
      const token = preferenceToken(
        {
          ...tenant,
          contactId: String(contact.id),
          exp: Math.floor(Date.now() / 1000) + 365 * 86400,
        },
        options.trackingKey,
      );
      const fallbacks = await tx`select name,fallback from contact_properties`;
      const values = {
        ...Object.fromEntries(fallbacks.map((p) => [String(p.name), p.fallback])),
        ...Object.fromEntries(Object.entries(contact.properties).filter(([, v]) => v !== null)),
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        ...data,
        FLARE_UNSUBSCRIBE_URL: `${web.replace(/\/$/, '')}/preferences/${token}`,
      };
      const [template] =
        await tx`select * from template_versions where template_id=${step.template_id} and version=${step.template_version}`;
      if (!template) throw new MailError(422, 'Pinned template is missing');
      const variables = { ...template.variables, ...values };
      const result = await submitEmails(
        options,
        {
          ...tenant,
          actorId: 'automation-worker',
          role: 'owner',
          kind: 'session',
          production: false,
        },
        [
          {
            from: step.from,
            to: [String(contact.email)],
            subject: renderText(String(template.subject), variables),
            html: renderText(String(template.html), variables, true),
            text: template.text_body
              ? renderText(String(template.text_body), variables)
              : undefined,
            headers: {
              'List-Unsubscribe': `<${publicApi.replace(/\/$/, '')}/v1/preferences/${token}/unsubscribe>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
            tags: [{ name: 'automation', value: String(run.automation_id) }],
          },
        ],
        {
          transaction: tx,
          campaign: { automationRunId: id, contactId: String(contact.id), topicId: null },
        },
      );
      messageId = result.data[0]!.id;
    }
    await tx`insert into automation_steps(org_id,environment_id,run_id,step_id,type,status,message_id,matched_event_id,finished_at) values(${tenant.orgId},${tenant.environmentId},${id},${step.id},${step.type},'completed',${messageId},${matchedEvent},now()) on conflict(org_id,environment_id,run_id,step_id) do update set status='completed',finished_at=now(),message_id=excluded.message_id,matched_event_id=excluded.matched_event_id`;
    await tx`update automation_runs set current_step=${next},status=${next ? 'queued' : 'completed'},next_step_at=now(),attempts=0,error=null,updated_at=now(),finished_at=${next ? null : new Date()} where id=${id}`;
    if (!next) await outbox(tx, tenant, 'automation.completed', { id });
    return { status: next ? 'queued' : 'completed', messageId };
  });
}
export async function failAutomation(sql: Sql, id: string, error: unknown) {
  const message = (error instanceof Error ? error.message : 'Automation processing failed').slice(
    0,
    500,
  );
  await sql.begin(async (tx) => {
    const [run] =
      await tx`select * from automation_runs where id=${id} and status in ('queued','waiting') for update`;
    if (!run) return;
    const attempts = Number(run.attempts) + 1,
      terminal = attempts >= 5 || (error instanceof MailError && error.status < 500);
    await tx`update automation_runs set attempts=${attempts},status=${terminal ? 'failed' : run.status},error=${message},next_step_at=now()+${Math.min(300, 2 ** attempts)}*interval '1 second',finished_at=${terminal ? new Date() : null},updated_at=now() where id=${id}`;
    if (terminal) {
      const step = automationSchema
        .parse(run.definition)
        .steps.find((s) => s.id === run.current_step)!;
      await tx`insert into automation_steps(org_id,environment_id,run_id,step_id,type,status,error,finished_at) values(${run.org_id},${run.environment_id},${id},${step.id},${step.type},'failed',${message},now()) on conflict(org_id,environment_id,run_id,step_id) do update set status='failed',error=excluded.error,finished_at=now()`;
      await outbox(
        tx,
        { orgId: String(run.org_id), environmentId: String(run.environment_id) },
        'automation.failed',
        { id, error: message },
      );
    }
  });
}
