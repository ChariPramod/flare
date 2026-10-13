import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';
export interface MetricFilter {
  from: string;
  to: string;
  domain_id?: string;
  tag_name?: string;
  tag_value?: string;
  workflow?: string;
  channel?: string;
}
export async function deliveryMetrics(sql: Sql, tenant: Tenant, q: MetricFilter) {
  return withTenant(sql, tenant, async (tx) => {
    const series = await tx`with recipients as (
      select m.id,date_trunc('day',m.created_at at time zone 'UTC') as day,r.address,r.status,
      (r.status in ('sent','delivered','delivery_delayed','bounced','complained') or exists(select 1 from event_outbox o where o.org_id=m.org_id and o.environment_id=m.environment_id and o.data->>'email_id'=m.id::text and o.type='email.sent' and (o.data->>'recipient'=r.address or o.data->>'recipient' is null))) as accepted,
      exists(select 1 from delivery_events e where e.org_id=m.org_id and e.environment_id=m.environment_id and e.message_id=m.id and e.type='delivered' and (e.recipient=r.address or e.recipient is null)) as delivered,
      exists(select 1 from delivery_events e where e.org_id=m.org_id and e.environment_id=m.environment_id and e.message_id=m.id and e.type='bounced' and (e.recipient=r.address or e.recipient is null)) as bounced,
      exists(select 1 from delivery_events e where e.org_id=m.org_id and e.environment_id=m.environment_id and e.message_id=m.id and e.type='complained' and (e.recipient=r.address or e.recipient is null)) as complained,
      exists(select 1 from delivery_events e where e.org_id=m.org_id and e.environment_id=m.environment_id and e.message_id=m.id and e.type='opened' and coalesce(e.data->>'machine','false')!='true') as opened,
      exists(select 1 from delivery_events e where e.org_id=m.org_id and e.environment_id=m.environment_id and e.message_id=m.id and e.type='clicked' and coalesce(e.data->>'machine','false')!='true') as clicked
      from messages m join message_recipients r on r.message_id=m.id and r.org_id=m.org_id and r.environment_id=m.environment_id
      where m.created_at>=${q.from}::timestamptz and m.created_at<${q.to}::timestamptz
      and (${q.channel ?? 'email'}='email')
      and (${q.domain_id ?? null}::uuid is null or m.domain_id=${q.domain_id ?? null})
      and (${q.tag_name ?? null}::text is null or exists(select 1 from jsonb_array_elements(coalesce(m.request->'tags','[]')) tag where tag->>'name'=${q.tag_name ?? null} and (${q.tag_value ?? null}::text is null or tag->>'value'=${q.tag_value ?? null})))
      and (${q.workflow ?? null}::text is null or coalesce(m.request->'tags','[]') @> ${tx.json(q.workflow ? [{ name: 'workflow', value: q.workflow }] : [])})
    ) select day,count(distinct id)::int as messages,count(distinct id) filter(where accepted)::int as sent,count(distinct id) filter(where delivered)::int as delivered,count(*) filter(where accepted)::int as sent_recipients,count(*) filter(where delivered)::int as delivered_recipients,count(*) filter(where bounced)::int as bounced,count(*) filter(where complained)::int as complained,count(distinct id) filter(where opened)::int as opened,count(distinct id) filter(where clicked)::int as clicked,count(*) filter(where status='failed')::int as failed,count(*) filter(where status='suppressed')::int as suppressed from recipients group by day order by day`;
    const names = [
      'messages',
      'sent',
      'delivered',
      'sent_recipients',
      'delivered_recipients',
      'bounced',
      'complained',
      'opened',
      'clicked',
      'failed',
      'suppressed',
    ];
    const totals = Object.fromEntries(
      names.map((key) => [key, series.reduce((sum, row) => sum + Number(row[key]), 0)]),
    );
    const rate = (n: string, d: string) => (totals[d] ? totals[n]! / totals[d]! : null);
    const rates = {
      delivery: rate('delivered_recipients', 'sent_recipients'),
      bounce: rate('bounced', 'sent_recipients'),
      complaint: rate('complained', 'sent_recipients'),
      open: rate('opened', 'sent'),
      click: rate('clicked', 'sent'),
    };
    const workflows =
      await tx`select r.workflow_id,r.status,count(*)::int as count from workflow_runs r where r.created_at>=${q.from}::timestamptz and r.created_at<${q.to}::timestamptz and (${q.workflow ?? null}::text is null or r.workflow_id=${q.workflow ?? null}) and (${q.channel ?? null}::text is null or exists(select 1 from workflows w where w.identifier=r.workflow_id and w.org_id=r.org_id and w.environment_id=r.environment_id and w.definition->'steps' @> ${tx.json(q.channel ? [{ type: q.channel }] : [])})) group by r.workflow_id,r.status order by r.workflow_id`;
    const engine =
      await tx`select type,data->>'channel' as channel,count(*)::int as count from engine_events where created_at>=${q.from}::timestamptz and created_at<${q.to}::timestamptz and (${q.channel ?? null}::text is null or data->>'channel'=${q.channel ?? null}) and (${q.workflow ?? null}::text is null or data->>'workflowId'=${q.workflow ?? null}) group by type,data->>'channel'`;
    return {
      from: q.from,
      to: q.to,
      totals,
      rates,
      series,
      workflows,
      engine,
      alerts: [
        ...(rates.bounce !== null && rates.bounce > 0.04 ? ['Bounce rate exceeds 4%.'] : []),
        ...(rates.complaint !== null && rates.complaint > 0.0008
          ? ['Complaint rate exceeds 0.08%.']
          : []),
      ],
      basis:
        'UTC message creation cohorts. Delivery/bounce/complaint rates use accepted recipients; opens/clicks use accepted messages and exclude known machine events. Untracked messages remain in the denominator.',
    };
  });
}
