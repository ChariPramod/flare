import { withJob } from '@flare/shared';
import { randomUUID } from 'node:crypto';
import { withTenant, toJson } from '@flare/db';
import type { Sql } from '@flare/db';
import { outbox } from '@flare/mail';
import type { Tenant } from '@flare/shared';

export type WorkflowOutcome = {
  kind: 'accepted' | 'transient' | 'rejected' | 'ambiguous';
  response?: unknown;
  error?: string;
};
export type WorkflowDispatch = (
  run: Record<string, unknown>,
  cancel: boolean,
) => Promise<WorkflowOutcome>;
export async function cancelWorkflow(sql: Sql, tenant: Tenant, transactionId: string) {
  return withTenant(sql, tenant, async (tx) => {
    const rows =
      await tx`update workflow_runs set cancellation_status=case when status='queued' and attempts=0 then 'confirmed' else 'pending' end,status='canceled',next_attempt_at=now(),updated_at=now() where parent_transaction_id=${transactionId} and status in ('queued','dispatching','accepted','ambiguous') returning id,workflow_id,transaction_id,cancellation_status`;
    for (const row of rows)
      await outbox(tx, tenant, 'workflow.canceled', {
        id: row.id,
        workflowId: row.workflow_id,
        transactionId: row.transaction_id,
        compensation: row.cancellation_status,
      });
    return rows;
  });
}
export async function recoverWorkflowRuns(sql: Sql) {
  await sql.begin(async (tx) => {
    const rows =
      await tx`select * from workflow_runs where claim_id is not null and lease_until<now() for update skip locked limit 100`;
    for (const row of rows) {
      const cancel = row.status === 'canceled';
      await tx`update workflow_attempts set status='ambiguous',error='Worker lease expired',finished_at=now() where run_id=${row.id} and status='started'`;
      await tx`update workflow_runs set status=${cancel ? 'canceled' : 'ambiguous'},claim_id=null,lease_until=null,error='Worker interrupted; engine acceptance is unknown',next_attempt_at=now(),updated_at=now() where id=${row.id}`;
      if (!cancel)
        await outbox(
          tx,
          { orgId: String(row.org_id), environmentId: String(row.environment_id) },
          'workflow.ambiguous',
          { id: row.id, transactionId: row.transaction_id },
        );
    }
  });
}
export async function dispatchWorkflow(sql: Sql, id: string, sender: WorkflowDispatch) {
  const claim = randomUUID();
  const run = await sql.begin(async (tx) => {
    const [row] =
      await tx`select * from workflow_runs where id=${id} and claim_id is null and next_attempt_at<=now() and (status='queued' or (status='canceled' and cancellation_status='pending')) for update skip locked`;
    if (!row) return;
    const cancel = row.status === 'canceled';
    const ordinal = Number(cancel ? row.cancellation_attempts : row.attempts) + 1;
    await tx`update workflow_runs set status=${cancel ? 'canceled' : 'dispatching'},claim_id=${claim},lease_until=now()+interval '1 minute',attempts=attempts+${cancel ? 0 : 1},cycle_attempts=cycle_attempts+${cancel ? 0 : 1},cancellation_attempts=cancellation_attempts+${cancel ? 1 : 0},updated_at=now() where id=${id}`;
    await tx`insert into workflow_attempts(org_id,environment_id,run_id,kind,ordinal) values(${row.org_id},${row.environment_id},${id},${cancel ? 'cancel' : 'trigger'},${ordinal})`;
    return {
      ...row,
      traceparent: row.traceparent as string | undefined,
      request_id: row.request_id as string | undefined,
      org_id: String(row.org_id),
      environment_id: String(row.environment_id),
      workflow_id: String(row.workflow_id),
      transaction_id: String(row.transaction_id),
      cancel,
      ordinal,
      cycle: Number(row.cycle_attempts) + 1,
    };
  });
  if (!run) return;
  let outcome: WorkflowOutcome;
  try {
    outcome = await withJob('workflow-triggers', id, run.traceparent, run.request_id, () =>
      sender(run, run.cancel),
    );
  } catch {
    outcome = { kind: 'ambiguous', error: 'Engine outcome unknown after connection failure' };
  }
  // A database error here deliberately retains the lease. Recovery cannot safely resend.
  await sql.begin(async (tx) => {
    const [current] =
      await tx`select * from workflow_runs where id=${id} and claim_id=${claim} for update`;
    if (!current) return;
    const error = outcome.error?.slice(0, 500) ?? null;
    await tx`update workflow_attempts set status=${outcome.kind},error=${error},finished_at=now() where run_id=${id} and kind=${run.cancel ? 'cancel' : 'trigger'} and ordinal=${run.ordinal}`;
    let status = String(current.status);
    let compensation = String(current.cancellation_status);
    if (run.cancel)
      compensation =
        outcome.kind === 'accepted'
          ? 'confirmed'
          : run.ordinal >= 4 || outcome.kind === 'rejected'
            ? 'failed'
            : 'pending';
    else if (status !== 'canceled')
      status =
        outcome.kind === 'accepted'
          ? 'accepted'
          : outcome.kind === 'ambiguous'
            ? 'ambiguous'
            : outcome.kind === 'rejected' || run.cycle >= 4
              ? 'failed'
              : 'queued';
    await tx`update workflow_runs set status=${status},cancellation_status=${compensation},claim_id=null,lease_until=null,response=${tx.json(toJson(outcome.response ?? null))},error=${error},next_attempt_at=now()+${outcome.kind === 'transient' || run.cancel ? Math.min(300, 2 ** Math.min(run.ordinal, 8)) : 0}*interval '1 second',updated_at=now() where id=${id}`;
    if (run.cancel || ['accepted', 'failed', 'ambiguous'].includes(status))
      await outbox(
        tx,
        { orgId: String(run.org_id), environmentId: String(run.environment_id) },
        run.cancel ? `workflow.cancellation.${compensation}` : `workflow.${status}`,
        { id, workflowId: run.workflow_id, transactionId: run.transaction_id, error },
      );
  });
}
export async function sendWorkflowRequest(
  url: string,
  key: string,
  run: Record<string, unknown>,
  cancel: boolean,
): Promise<WorkflowOutcome> {
  const response = await fetch(
    `${url}/v1/events/trigger${cancel ? `/${encodeURIComponent(String(run.transaction_id))}` : ''}`,
    {
      method: cancel ? 'DELETE' : 'POST',
      headers: {
        Authorization: `ApiKey ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': String(run.id),
        ...(run.traceparent ? { traceparent: String(run.traceparent) } : {}),
        'x-request-id': String(run.request_id ?? run.id),
      },
      ...(cancel ? {} : { body: JSON.stringify(run.payload) }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    },
  );
  if (response.status === 429)
    return { kind: 'transient', error: 'Engine rate limit refused the request' };
  if (response.status >= 400 && response.status < 500 && ![408, 409].includes(response.status))
    return { kind: 'rejected', error: `Engine rejected request (${response.status})` };
  if (!response.ok)
    return { kind: 'ambiguous', error: `Engine acceptance unknown (${response.status})` };
  const data = await response.json();
  if (cancel && data !== true && (data as { data?: unknown } | null)?.data !== true)
    return { kind: 'transient', error: 'Engine has not confirmed cancellation' };
  return { kind: 'accepted', response: data };
}
