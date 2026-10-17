import type { Sql } from '@flare/db';
import {
  dependencyReadiness,
  dependencyReady,
  failureKinds,
  operationKinds,
  operationalCollectionSuccess,
  recordOperationalSnapshot,
  safetyKinds,
} from '@flare/shared';
import type { OperationalSnapshot } from '@flare/shared';

/** One read-only snapshot, bounded counts and statement time; never return tenant/content data. */
export async function readOperationalSnapshot(sql: Sql): Promise<OperationalSnapshot> {
  const rows = await sql.begin('read only', async (tx) => {
    await tx`set local statement_timeout='2500ms'`;
    await tx`set local lock_timeout='500ms'`;
    return tx`
      with due as (
        (select 'workflow' as kind,next_attempt_at as due_at from workflow_runs where (status in ('queued','dispatching') or cancellation_status='pending') and next_attempt_at<=statement_timestamp() order by next_attempt_at limit 10001)
        union all (select 'email',greatest(scheduled_at,next_attempt_at) from messages where delivery_finished_at is null and status in ('queued','scheduled') and greatest(scheduled_at,next_attempt_at)<=statement_timestamp() order by greatest(scheduled_at,next_attempt_at) limit 10001)
        union all (select 'webhook',next_attempt_at from webhook_deliveries where status in ('pending','delivering') and next_attempt_at<=statement_timestamp() order by next_attempt_at limit 10001)
        union all (select 'inbound',next_attempt_at from inbound_messages where status='pending' and next_attempt_at<=statement_timestamp() order by next_attempt_at limit 10001)
        union all (select 'forward',next_attempt_at from inbound_forwards where status='pending' and next_attempt_at<=statement_timestamp() order by next_attempt_at limit 10001)
        union all (select 'automation',next_step_at from automation_runs where status in ('queued','waiting') and next_step_at<=statement_timestamp() order by next_step_at limit 10001)
        union all (select 'publication',i.next_attempt_at from publication_items i join publication_operations o on o.id=i.operation_id and o.org_id=i.org_id and o.environment_id=i.environment_id where o.status='pending' and i.status='pending' and i.next_attempt_at<=statement_timestamp() and not exists(select 1 from publication_items earlier where earlier.operation_id=i.operation_id and earlier.ordinal<i.ordinal and earlier.status<>'completed') order by i.next_attempt_at limit 10001)
        union all (select 'broadcast',next_dispatch_at from broadcasts where status in ('scheduled','sending') and next_dispatch_at<=statement_timestamp() order by next_dispatch_at limit 10001)
        union all (select 'outbox',created_at from event_outbox where dispatched_at is null or automation_dispatched_at is null order by created_at limit 10001)
      ), failures as (
        (select 'workflow' as kind from workflow_runs where status in ('failed','ambiguous') or cancellation_status='failed' limit 10001)
        union all (select 'email' from messages where status='failed' limit 10001)
        union all (select 'webhook' from webhook_deliveries where status='failed' limit 10001)
        union all (select 'inbound' from inbound_messages where status='failed' limit 10001)
        union all (select 'forward' from inbound_forwards where status='failed' limit 10001)
        union all (select 'automation' from automation_runs where status='failed' limit 10001)
        union all (select 'publication' from publication_operations where status='failed' limit 10001)
      ), safety as (
        (select 'ambiguous_email' as kind from messages m where exists(select 1 from transport_attempts a where a.message_id=m.id and a.org_id=m.org_id and a.environment_id=m.environment_id and a.status='ambiguous') limit 10001)
        union all (select 'ambiguous_workflow' from workflow_runs where status='ambiguous' limit 10001)
        union all (select 'held_email' from messages where status='held' and delivery_finished_at is null limit 10001)
        union all (select 'suspended_organizations' from sending_policies where state='suspended' limit 10001)
        union all (select 'stale_dns' from domains d join environments e on e.id=d.environment_id and e.org_id=d.org_id where e.name='Production' and d.sending and d.status='verified' and (d.checked_at is null or d.checked_at<statement_timestamp()-interval '24 hours' or d.checked_at>statement_timestamp()) limit 10001)
        union all (select 'stale_transport' from domain_transport_readiness r join domains d on d.id=r.domain_id and d.org_id=r.org_id and d.environment_id=r.environment_id join environments e on e.id=r.environment_id and e.org_id=r.org_id where e.name='Production' and d.sending and r.revoked_at is null and (r.checked_at<statement_timestamp()-interval '24 hours' or r.checked_at>statement_timestamp()) limit 10001)
      ), pending as (
        (select 'workflow' as kind from workflow_runs where status in ('queued','dispatching') limit 10001)
        union all (select 'email' from messages where delivery_finished_at is null and status in ('queued','scheduled') limit 10001)
        union all (select 'webhook' from webhook_deliveries where status in ('pending','delivering') limit 10001)
      )
      select 'due' as metric,kind,count(*)::int as n,greatest(0,extract(epoch from statement_timestamp()-min(due_at)))::float8 as age from due group by kind
      union all select 'failed',kind,count(*)::int,0 from failures group by kind
      union all select 'safety',kind,count(*)::int,0 from safety group by kind
      union all select 'pending',kind,count(*)::int,0 from pending group by kind`;
  });
  const snapshot = {
    due: Object.fromEntries(operationKinds.map((kind) => [kind, { count: 0, age: 0 }])),
    failed: Object.fromEntries(failureKinds.map((kind) => [kind, 0])),
    safety: Object.fromEntries(safetyKinds.map((kind) => [kind, 0])),
    pending: { workflow: 0, email: 0, webhook: 0 },
  } as OperationalSnapshot;
  for (const row of rows) {
    const kind = String(row.kind);
    if (row.metric === 'due' && operationKinds.includes(kind as (typeof operationKinds)[number]))
      snapshot.due[kind as (typeof operationKinds)[number]] = {
        count: Number(row.n),
        age: Number(row.age),
      };
    else if (
      row.metric === 'failed' &&
      failureKinds.includes(kind as (typeof failureKinds)[number])
    )
      snapshot.failed[kind as (typeof failureKinds)[number]] = Number(row.n);
    else if (row.metric === 'safety' && safetyKinds.includes(kind as (typeof safetyKinds)[number]))
      snapshot.safety[kind as (typeof safetyKinds)[number]] = Number(row.n);
    else if (row.metric === 'pending' && ['workflow', 'email', 'webhook'].includes(kind))
      snapshot.pending[kind as keyof OperationalSnapshot['pending']] = Number(row.n);
    else throw new Error('Unexpected operational metric category');
  }
  return snapshot;
}

/** Dependencies run outside the database transaction. A failed collection retains old gauges
 * with an explicit failure flag and unchanged timestamp instead of reporting healthy zeroes. */
export async function collectOperationalMetrics(
  sql: Sql,
  probes: { redis: () => Promise<unknown>; objects: () => Promise<unknown> },
) {
  const work = await Promise.allSettled([
    readOperationalSnapshot(sql)
      .then((snapshot) => {
        recordOperationalSnapshot(snapshot);
        dependencyReadiness.set({ dependency: 'database' }, 1);
      })
      .catch((error) => {
        operationalCollectionSuccess.set(0);
        dependencyReadiness.set({ dependency: 'database' }, 0);
        throw error;
      }),
    ...(['redis', 'objects'] as const).map(async (dependency) => {
      try {
        await dependencyReady([Promise.resolve().then(probes[dependency])]);
        dependencyReadiness.set({ dependency }, 1);
      } catch {
        dependencyReadiness.set({ dependency }, 0);
      }
    }),
  ]);
  const failed = work.find((result) => result.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}
