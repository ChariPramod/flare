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
