import { NotFoundException } from '@nestjs/common';
import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';

const jobStates = [
  'pending',
  'queued',
  'running',
  'completed',
  'failed',
  'delayed',
  'canceled',
  'merged',
  'skipped',
] as const;
type JobState = (typeof jobStates)[number] | 'unknown';
const terminal = new Set<JobState>(['completed', 'failed', 'canceled', 'merged', 'skipped']);
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 128) : null);
const timestamp = (value: unknown) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
export interface EngineJob {
  id: string | null;
  type: string;
  status: JobState;
  created_at: string | null;
  updated_at: string | null;
}
export interface EngineNotification {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'canceled' | 'unknown';
  created_at: string | null;
  updated_at: string | null;
  jobs: EngineJob[];
}
export interface EngineObservation {
  status: 'available' | 'unavailable' | 'not_found' | 'not_requested';
  checked_at: string | null;
  partial: boolean;
  notifications: EngineNotification[];
}
export async function workflowActivity(
  sql: Sql,
  tenant: Tenant,
  id: string,
  lookup: (transactionId: string, signal: AbortSignal) => Promise<unknown>,
  detail?: (notificationId: string, signal: AbortSignal) => Promise<unknown>,
) {
  // Authorize local evidence before accessing this environment's engine credentials.
  const [run] = await withTenant(
    sql,
    tenant,
    (tx) => tx`select * from workflow_runs where id=${id}`,
  );
  if (!run) throw new NotFoundException();
  let engine: unknown = null;
  let observation: EngineObservation = {
    status: 'not_requested',
    checked_at: null,
    partial: false,
    notifications: [],
  };
  if (run.status === 'accepted') {
    // One deadline covers the list and every detail, rather than multiplying the client timeout.
    const signal = AbortSignal.timeout(5000);
    try {
      engine = await lookup(String(run.transaction_id), signal);
      if (!Array.isArray(engine)) throw new Error('Invalid activity response');
      observation = {
        status: engine.length ? 'available' : 'not_found',
        checked_at: null,
        partial: engine.length > 10,
        notifications: [],
      };
      const seen = new Set<string>();
      const notifications = await Promise.all(
        engine.slice(0, 10).map(async (value) => {
          const item = record(value),
            notificationId = text(item._id);
          // Detail IDs come exclusively from the tenant-scoped, transaction-filtered list.
          if (
            !notificationId ||
            item._id !== notificationId ||
            seen.has(notificationId) ||
            (item.transactionId !== undefined && item.transactionId !== run.transaction_id)
          ) {
            observation.partial = true;
            return null;
          }
          seen.add(notificationId);
          let native = item;
          try {
            if (detail) native = record(await detail(notificationId, signal));
            if (
              native._id !== notificationId ||
              (native.transactionId !== undefined && native.transactionId !== run.transaction_id)
            )
              throw new Error('Invalid activity detail');
          } catch {
            observation.partial = true;
            native = {};
          }
          const rawJobs = Array.isArray(native.jobs) ? native.jobs : [];
          if (!rawJobs.length || rawJobs.length > 50) observation.partial = true;
          const jobs: EngineJob[] = rawJobs.slice(0, 50).map((value) => {
            const job = record(value);
            return {
              id: text(job._id),
              type: text(job.type) ?? 'unknown',
              status: jobStates.includes(job.status as (typeof jobStates)[number])
                ? (job.status as JobState)
                : 'unknown',
              created_at: timestamp(job.createdAt),
              updated_at: timestamp(job.updatedAt),
            };
          });
          const statuses = jobs.map((job) => job.status);
          let status: EngineNotification['status'] = 'unknown';
          if (statuses.length && !statuses.includes('unknown') && rawJobs.length <= 50) {
            status = statuses.includes('running')
              ? 'running'
              : statuses.some((value) => !terminal.has(value))
                ? 'pending'
                : statuses.includes('failed')
                  ? 'failed'
                  : statuses.includes('canceled')
                    ? 'canceled'
                    : 'completed';
          }
          return {
            id: notificationId,
            status,
            created_at: timestamp(native.createdAt),
            updated_at: timestamp(native.updatedAt),
            jobs,
          };
        }),
      );
      observation.notifications = notifications.filter(
        (value): value is EngineNotification => value !== null,
      );
    } catch {
      // Keep raw successful evidence, but never expose exception details or credentials.
      observation = { status: 'unavailable', checked_at: null, partial: false, notifications: [] };
    }
    observation.checked_at = new Date().toISOString();
  }
  const delayed = observation.notifications.some((notification) =>
    notification.jobs.some(
      (job) =>
        ['delay', 'digest'].includes(job.type) &&
        ['pending', 'queued', 'delayed'].includes(job.status),
    ),
  );
  const unknown = observation.notifications.some(
    (notification) => notification.status === 'unknown',
  );
  const eligible =
    run.status === 'queued' ||
    (run.status === 'accepted' &&
      observation.status === 'available' &&
      !observation.partial &&
      !unknown &&
      delayed);
  return {
    ...run,
    engine,
    engine_observation: observation,
    cancellation: {
      eligible,
      transaction_id: String(run.parent_transaction_id ?? run.transaction_id),
      scope: 'trigger' as const,
      reason:
        run.status === 'queued'
          ? 'queued'
          : eligible
            ? 'pending_action'
            : run.status !== 'accepted'
              ? 'local_state'
              : observation.status !== 'available' || observation.partial || unknown
                ? 'unknown'
                : 'no_pending_action',
    },
  };
}
