import { BadRequestException } from '@nestjs/common';
import { withTenant } from '@flare/db';
import type { Sql } from '@flare/db';
import type { Tenant } from '@flare/shared';
import { z } from 'zod';
import type { reconciliationQuery } from '@flare/shared';
import { workflowActivity } from './workflow-activity.js';

const cursorSchema = z
  .object({
    org: z.string().uuid(),
    environment: z.string().uuid(),
    before: z.string(),
    created: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
  })
  .strict();
const iso = (value: unknown) =>
  (value instanceof Date ? value : new Date(String(value))).toISOString();
const metadata = (run: Record<string, unknown>) => ({
  id: String(run.id),
  workflow_id: String(run.workflow_id),
  transaction_id: String(run.transaction_id),
  parent_transaction_id:
    run.parent_transaction_id == null ? null : String(run.parent_transaction_id),
  status: String(run.status),
  attempts: Number(run.attempts),
  cancellation_status: String(run.cancellation_status),
  created_at: iso(run.created_at),
  updated_at: iso(run.updated_at),
  queue_presence: 'unknown' as const,
  replay_allowed: false as const,
});
export async function acceptedWorkflowInventory(
  sql: Sql,
  tenant: Tenant,
  input: z.infer<typeof reconciliationQuery>,
) {
  const before = new Date(input.before).toISOString();
  let cursor: z.infer<typeof cursorSchema> | undefined;
  if (input.cursor) {
    try {
      cursor = cursorSchema.parse(
        JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')),
      );
      if (
        cursor.org !== tenant.orgId ||
        cursor.environment !== tenant.environmentId ||
        cursor.before !== before
      )
        throw new Error('Cursor scope differs');
    } catch {
      throw new BadRequestException(
        'Invalid reconciliation cursor for this environment and before filter',
      );
    }
  }
  return withTenant(sql, tenant, async (tx) => {
    // Preserve database timestamp precision in both cursor and bound parameters.
    // Explicit text casts prevent the client timestamp serializer truncating microseconds.
    const rows =
      await tx`select id, workflow_id, transaction_id, parent_transaction_id, status, attempts, cancellation_status, created_at, updated_at,
      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as cursor_created
      from workflow_runs where status='accepted' and created_at < ${before}::text::timestamptz
      and (${cursor?.created ?? null}::text::timestamptz is null or (created_at,id) > (${cursor?.created ?? null}::text::timestamptz,${cursor?.id ?? null}::uuid))
      order by created_at,id limit ${input.limit + 1}`;
    const selected = rows.slice(0, input.limit),
      last = selected.at(-1);
    return {
      data: selected.map(metadata),
      before,
      next_cursor:
        rows.length > input.limit && last
          ? Buffer.from(
              JSON.stringify({
                org: tenant.orgId,
                environment: tenant.environmentId,
                before,
                created: last.cursor_created,
                id: last.id,
              }),
            ).toString('base64url')
          : null,
    };
  });
}
const nativeTypes = new Set([
  'email',
  'sms',
  'in_app',
  'in-app',
  'push',
  'chat',
  'delay',
  'digest',
  'custom',
  'trigger',
  'throttle',
]);
export async function inspectWorkflow(
  sql: Sql,
  tenant: Tenant,
  id: string,
  lookup: (transactionId: string, signal: AbortSignal) => Promise<unknown>,
  detail: (notificationId: string, signal: AbortSignal) => Promise<unknown>,
) {
  const run = await workflowActivity(sql, tenant, id, lookup, detail);
  const observed = run.engine_observation;
  const saved = metadata(run);
  // Deliberately do not spread the run: existing activity compatibility includes content/raw engine.
  return {
    ...saved,
    cancellation: run.cancellation,
    engine_observation: {
      ...observed,
      notifications: observed.notifications.map((notification) => ({
        ...notification,
        jobs: notification.jobs.map((job) => ({
          ...job,
          type: nativeTypes.has(job.type) ? job.type : 'unknown',
        })),
      })),
    },
    observation_age_ms: observed.checked_at
      ? Math.max(0, Date.now() - Date.parse(observed.checked_at))
      : null,
    partial:
      saved.status === 'accepted' &&
      (observed.status !== 'available' ||
        observed.partial ||
        observed.notifications.some(
          (notification) =>
            notification.status === 'unknown' ||
            notification.jobs.some((job) => job.status === 'unknown' || !nativeTypes.has(job.type)),
        )),
  };
}
