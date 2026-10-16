/** Metadata-only inspection. Native database evidence cannot establish queue membership. */
export interface WorkflowRunMetadata {
  id: string;
  workflow_id: string;
  transaction_id: string;
  parent_transaction_id: string | null;
  status: string;
  attempts: number;
  cancellation_status: string;
  created_at: string;
  updated_at: string;
  queue_presence: 'unknown';
  replay_allowed: false;
}
export interface WorkflowInspection extends WorkflowRunMetadata {
  cancellation: { eligible: boolean; transaction_id: string; scope: 'trigger'; reason: string };
  engine_observation: {
    status: 'available' | 'unavailable' | 'not_found' | 'not_requested';
    checked_at: string | null;
    partial: boolean;
    notifications: Array<{
      id: string;
      status: string;
      created_at: string | null;
      updated_at: string | null;
      jobs: Array<{
        id: string | null;
        type: string;
        status: string;
        created_at: string | null;
        updated_at: string | null;
      }>;
    }>;
  };
  observation_age_ms: number | null;
  partial: boolean;
}
export interface WorkflowInventory {
  data: WorkflowRunMetadata[];
  before: string;
  next_cursor: string | null;
}
export interface ReconciliationOptions {
  before: string;
  cursor?: string;
  maxRuns?: number;
  concurrency?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
}
export interface WorkflowReconciliation {
  data: Array<
    | WorkflowInspection
    | (WorkflowRunMetadata & { inspection_error: 'unavailable' | 'deadline'; partial: true })
  >;
  before: string;
  next_cursor: string | null;
  complete: boolean;
  partial: boolean;
  inventory_complete: boolean;
  stop_reason: 'complete' | 'limit' | 'deadline' | 'unavailable';
  checked_at: string;
}
interface Reader {
  workflowInventory(input: {
    before: string;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<WorkflowInventory>;
  inspectWorkflow(id: string, signal?: AbortSignal): Promise<WorkflowInspection>;
}
const integer = (value: number, min: number, max: number) =>
  Number.isInteger(value) && value >= min && value <= max;
// Bound callers even when a custom fetch implementation ignores AbortSignal.
async function bounded<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(new Error('Reconciliation deadline'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([work(), stopped]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}
export async function reconcileWorkflows(
  reader: Reader,
  options: ReconciliationOptions,
): Promise<WorkflowReconciliation> {
  const maxRuns = options.maxRuns ?? 100,
    concurrency = options.concurrency ?? 2,
    deadlineMs = options.deadlineMs ?? 30000;
  if (
    !integer(maxRuns, 1, 100) ||
    !integer(concurrency, 1, 4) ||
    !integer(deadlineMs, 1000, 60000) ||
    !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(options.before) ||
    !Number.isFinite(Date.parse(options.before)) ||
    (options.cursor !== undefined && (!options.cursor.length || options.cursor.length > 2048))
  )
    throw new Error('Invalid reconciliation bounds or before timestamp');
  const signal = AbortSignal.any([
    AbortSignal.timeout(deadlineMs),
    ...(options.signal ? [options.signal] : []),
  ]);
  const report: WorkflowReconciliation = {
    data: [],
    before: new Date(options.before).toISOString(),
    next_cursor: options.cursor ?? null,
    complete: false,
    partial: false,
    inventory_complete: false,
    stop_reason: 'complete',
    checked_at: new Date().toISOString(),
  };
  const seen = new Set<string>();
  while (report.data.length < maxRuns) {
    let page: WorkflowInventory;
    try {
      page = await bounded(signal, () =>
        reader.workflowInventory({
          before: report.before,
          ...(report.next_cursor ? { cursor: report.next_cursor } : {}),
          limit: Math.min(20, maxRuns - report.data.length),
          signal,
        }),
      );
      if (
        page.data.length > Math.min(20, maxRuns - report.data.length) ||
        page.data.some((row) => seen.has(row.id)) ||
        new Set(page.data.map((row) => row.id)).size !== page.data.length ||
        (page.next_cursor !== null &&
          (page.next_cursor === report.next_cursor || !page.data.length))
      )
        throw new Error('Invalid inventory progress');
    } catch {
      report.partial = true;
      report.stop_reason = signal.aborted ? 'deadline' : 'unavailable';
      break;
    }
    const results: WorkflowReconciliation['data'] = new Array(page.data.length);
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, page.data.length) }, async () => {
        for (;;) {
          const position = index++,
            row = page.data[position];
          if (!row) return;
          seen.add(row.id);
          try {
            const observation = await bounded(signal, () => reader.inspectWorkflow(row.id, signal));
            if (observation.id !== row.id || observation.transaction_id !== row.transaction_id)
              throw new Error('Inspection identity mismatch');
            results[position] = observation;
          } catch {
            results[position] = {
              ...row,
              inspection_error: signal.aborted ? 'deadline' : 'unavailable',
              partial: true,
            };
          }
        }
      }),
    );
    report.data.push(...results);
    report.partial ||= results.some((result) => result.partial);
    report.next_cursor = page.next_cursor;
    report.inventory_complete = page.next_cursor === null;
    if (signal.aborted) {
      report.stop_reason = 'deadline';
      report.partial = true;
      break;
    }
    if (report.inventory_complete) break;
    if (report.data.length === maxRuns) {
      report.stop_reason = 'limit';
      report.partial = true;
    }
  }
  report.complete = report.inventory_complete && !report.partial;
  report.checked_at = new Date().toISOString();
  for (const item of report.data) {
    if ('engine_observation' in item && item.engine_observation.checked_at)
      item.observation_age_ms = Math.max(
        0,
        Date.parse(report.checked_at) - Date.parse(item.engine_observation.checked_at),
      );
  }
  return report;
}
