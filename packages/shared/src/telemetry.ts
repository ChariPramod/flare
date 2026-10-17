import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { context, propagation, trace, SpanStatusCode, ROOT_CONTEXT } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
export const registry = new Registry();
registry.setDefaultLabels({ service: process.env.OTEL_SERVICE_NAME ?? 'flare' });
collectDefaultMetrics({ register: registry, prefix: 'flare_' });
export const requestDuration = new Histogram({
  name: 'flare_http_seconds',
  help: 'HTTP response duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15],
  registers: [registry],
});
export const jobRuns = new Counter({
  name: 'flare_jobs_total',
  help: 'Completed job processor invocations',
  labelNames: ['queue', 'outcome'],
  registers: [registry],
});
export const backlog = new Gauge({
  name: 'flare_pending_operations',
  help: 'Pending durable operations, capped at 10001',
  labelNames: ['kind'],
  registers: [registry],
});
export const operationKinds = [
  'workflow',
  'email',
  'webhook',
  'inbound',
  'forward',
  'automation',
  'publication',
  'broadcast',
  'outbox',
] as const;
export const failureKinds = [
  'workflow',
  'email',
  'webhook',
  'inbound',
  'forward',
  'automation',
  'publication',
] as const;
export const safetyKinds = [
  'ambiguous_email',
  'ambiguous_workflow',
  'held_email',
  'suspended_organizations',
  'stale_dns',
  'stale_transport',
] as const;
export type OperationalSnapshot = {
  due: Record<(typeof operationKinds)[number], { count: number; age: number }>;
  failed: Record<(typeof failureKinds)[number], number>;
  safety: Record<(typeof safetyKinds)[number], number>;
  pending: Record<'workflow' | 'email' | 'webhook', number>;
};
const dueOperations = new Gauge({
  name: 'flare_due_operations',
  help: 'Due durable operations, capped at 10001 per kind; future schedules are excluded',
  labelNames: ['kind'],
  registers: [registry],
});
const dueAge = new Gauge({
  name: 'flare_oldest_due_operation_seconds',
  help: 'Seconds since the oldest currently due operation became eligible, zero when empty',
  labelNames: ['kind'],
  registers: [registry],
});
const deadLetters = new Gauge({
  name: 'flare_dead_letters',
  help: 'Persisted terminal failures matching the dead-letter view, capped at 10001 per kind; does not imply redrive is safe',
  labelNames: ['kind'],
  registers: [registry],
});
const safetyIssues = new Gauge({
  name: 'flare_sending_safety_issues',
  help: 'Sending safety records requiring inspection, capped at 10001 per kind; not a readiness certificate',
  labelNames: ['kind'],
  registers: [registry],
});
export const operationalCollectionSuccess = new Gauge({
  name: 'flare_operational_collection_success',
  help: 'Whether the last durable operational snapshot succeeded',
  registers: [registry],
});
const operationalCollectionTime = new Gauge({
  name: 'flare_operational_collection_timestamp_seconds',
  help: 'Unix timestamp of the last complete durable operational snapshot; zero until collected',
  registers: [registry],
});
export const dependencyReadiness = new Gauge({
  name: 'flare_dependency_ready',
  help: 'Last worker probe of a shared dependency succeeded; not an API or Novu readiness certificate',
  labelNames: ['dependency'],
  registers: [registry],
});
/** Validate every value before publishing any part of a fixed-cardinality snapshot. */
export function recordOperationalSnapshot(snapshot: OperationalSnapshot, at = Date.now() / 1000) {
  const counts = [
    ...operationKinds.map((kind) => snapshot.due[kind].count),
    ...failureKinds.map((kind) => snapshot.failed[kind]),
    ...safetyKinds.map((kind) => snapshot.safety[kind]),
    ...(['workflow', 'email', 'webhook'] as const).map((kind) => snapshot.pending[kind]),
  ];
  if (
    counts.some((n) => !Number.isInteger(n) || n < 0 || n > 10001) ||
    operationKinds.some(
      (kind) => !Number.isFinite(snapshot.due[kind].age) || snapshot.due[kind].age < 0,
    ) ||
    !Number.isFinite(at) ||
    at < 0
  )
    throw new Error('Invalid operational metric snapshot');
  for (const kind of operationKinds) {
    dueOperations.set({ kind }, snapshot.due[kind].count);
    dueAge.set({ kind }, snapshot.due[kind].age);
  }
  for (const kind of failureKinds) deadLetters.set({ kind }, snapshot.failed[kind]);
  for (const kind of safetyKinds) safetyIssues.set({ kind }, snapshot.safety[kind]);
  for (const kind of ['workflow', 'email', 'webhook'] as const)
    backlog.set({ kind }, snapshot.pending[kind]);
  operationalCollectionTime.set(at);
  operationalCollectionSuccess.set(1);
}
export const providerAttempts = new Counter({
  name: 'flare_provider_attempts_total',
  help: 'Email transport attempts',
  labelNames: ['provider', 'outcome'],
  registers: [registry],
});
let sdk: NodeSDK | undefined;
export function startTelemetry() {
  if (!sdk && process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    sdk = new NodeSDK({ traceExporter: new OTLPTraceExporter(), instrumentations: [] });
    sdk.start();
  }
}
export async function stopTelemetry() {
  await sdk?.shutdown();
}
type Correlation = { requestId: string; traceparent: string };
const local = new AsyncLocalStorage<Correlation>();
const validParent = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^00-(?!0{32}-)[0-9a-f]{32}-(?!0{16}-)[0-9a-f]{16}-0[01]$/.test(value);
export function correlation() {
  return local.getStore();
}
export function withRequest<T>(id: string, parent: unknown, fn: () => T): T {
  const traceparent = validParent(parent)
    ? parent
    : `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
  return local.run({ requestId: id, traceparent }, () =>
    context.with(propagation.extract(ROOT_CONTEXT, { traceparent }), fn),
  );
}
export async function withJob<T>(
  queue: string,
  id: string,
  parent: unknown,
  requestId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return withRequest(requestId ?? id, parent, () =>
    trace
      .getTracer('flare')
      .startActiveSpan(
        `job.${queue}`,
        { attributes: { 'job.id': id, 'request.id': requestId ?? id } },
        async (span) => {
          const headers: Record<string, string> = {};
          propagation.inject(context.active(), headers);
          const saved = local.getStore();
          if (saved && headers.traceparent) saved.traceparent = headers.traceparent;
          try {
            const result = await fn();
            jobRuns.inc({ queue, outcome: 'completed' });
            return result;
          } catch (error) {
            jobRuns.inc({ queue, outcome: 'failed' });
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        },
      ),
  );
}
export function requestSpan() {
  return trace.getTracer('flare').startSpan('http.request', {
    attributes: { 'request.id': correlation()?.requestId ?? randomUUID() },
  });
}
export function metricsAuthorized(header: unknown) {
  const token = process.env.METRICS_TOKEN;
  if (!token || token.length < 32 || typeof header !== 'string') return false;
  const expected = Buffer.from(`Bearer ${token}`),
    actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function shutdownDeadline() {
  const timer = setTimeout(
    () => {
      process.stderr.write('Graceful shutdown deadline exceeded\n');
      process.exit(1);
    },
    Number(process.env.SHUTDOWN_TIMEOUT_MS ?? 30000),
  );
  timer.unref();
  return timer;
}
export async function dependencyReady(work: Promise<unknown>[]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 2500);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
