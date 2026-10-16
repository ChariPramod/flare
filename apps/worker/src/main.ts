import { dependencyReady } from '@flare/shared';
import { periodicTask } from './lifecycle.js';
import { objectStore, sweepObjectUploads } from '@flare/mail';
import {
  startTelemetry,
  stopTelemetry,
  shutdownDeadline,
  registry,
  metricsAuthorized,
  backlog,
} from '@flare/shared';
import { startPublicationWorker } from './publication.js';
import { startInboundWorker } from './inbound.js';
import { startAutomationWorker } from './automations.js';
import { startBroadcastWorker } from './broadcasts.js';
import { startWorkflowWorker } from './workflows.js';
import { startWebhookWorker } from './webhooks.js';
import { startMailWorker } from './mail.js';
import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { createLogger, infrastructureConfig } from '@flare/shared';
startTelemetry();
const config = infrastructureConfig.parse(process.env);
const readinessStore = objectStore();
const logger = createLogger('worker');
const { client } = connectDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on('error', (err: Error) => logger.error({ err }, 'Redis connection failed'));
const publicationWorker = startPublicationWorker(client, redis, config.FLARE_ENCRYPTION_KEY);
publicationWorker.worker.on('error', (err: Error) =>
  logger.error({ err }, 'Publication worker error'),
);
const publicationDispatch = periodicTask(
  1000,
  () => publicationWorker.dispatch(),
  (err) => logger.error({ err }, 'Publication dispatch failed'),
);
const inboundWorker = startInboundWorker(
  client,
  redis,
  config.FLARE_ENCRYPTION_KEY,
  config.JWT_SECRET,
);
inboundWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Inbound worker error'));
const inboundDispatch = periodicTask(
  1000,
  () => inboundWorker.dispatch(),
  (err) => logger.error({ err }, 'Inbound dispatch failed'),
);
const workflowWorker = startWorkflowWorker(client, redis, config.FLARE_ENCRYPTION_KEY);
const mailWorker = startMailWorker(client, redis, config.FLARE_ENCRYPTION_KEY, config.JWT_SECRET);
const broadcastWorker = startBroadcastWorker(
  client,
  redis,
  config.FLARE_ENCRYPTION_KEY,
  config.JWT_SECRET,
);
broadcastWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Broadcast worker error'));
const broadcastDispatch = periodicTask(
  1000,
  () => broadcastWorker.dispatch(),
  (err) => logger.error({ err }, 'Broadcast dispatch failed'),
);
const automationWorker = startAutomationWorker(
  client,
  redis,
  config.FLARE_ENCRYPTION_KEY,
  config.JWT_SECRET,
);
automationWorker.worker.on('error', (err: Error) =>
  logger.error({ err }, 'Automation worker error'),
);
const automationDispatch = periodicTask(
  1000,
  () => automationWorker.dispatch(),
  (err) => logger.error({ err }, 'Automation dispatch failed'),
);
const webhookWorker = startWebhookWorker(client, redis, config.FLARE_ENCRYPTION_KEY);
webhookWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Webhook worker error'));
const webhookDispatch = periodicTask(
  2000,
  () => webhookWorker.dispatch(),
  (err) => logger.error({ err }, 'Webhook dispatch failed'),
);
const retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? 30);
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650)
  throw new Error('LOG_RETENTION_DAYS must be 1–3650');
const objectCleanup = periodicTask(
  60000,
  () => sweepObjectUploads(client, readinessStore),
  () => logger.error('Object upload cleanup failed; journal retained for retry'),
);
const retention = periodicTask(
  60000,
  () =>
    client.begin(async (tx) => {
      await tx`delete from request_logs where id in (select id from request_logs where created_at<now()-${retentionDays}*interval '1 day' order by created_at for update skip locked limit 1000)`;
      await tx`delete from idempotency where ctid in (select ctid from idempotency where expires_at<now() for update skip locked limit 1000)`;
    }),
  (err) => logger.error({ err }, 'Request log retention failed'),
);
mailWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Email worker error'));
const mailDispatch = periodicTask(
  2000,
  () => mailWorker.dispatch(),
  (err) => logger.error({ err }, 'Email dispatch failed'),
);
const domainPolling = periodicTask(
  10000,
  () => mailWorker.verifyDomains(),
  (err) => logger.error({ err }, 'Domain verification failed'),
);
workflowWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Workflow worker error'));
const dispatch = periodicTask(
  2000,
  () => workflowWorker.dispatch(),
  (err) => logger.error({ err }, 'Workflow dispatch failed'),
);
const backlogPoll = periodicTask(
  15000,
  async () => {
    const rows =
      await client`select 'workflow' as kind,count(*)::int as n from (select id from workflow_runs where status in ('queued','dispatching') limit 10001) w union all select 'email',count(*)::int from (select id from messages where delivery_finished_at is null and status in ('queued','scheduled') limit 10001) m union all select 'webhook',count(*)::int from (select id from webhook_deliveries where status in ('pending','delivering') limit 10001) h`;
    for (const row of rows) backlog.set({ kind: String(row.kind) }, Number(row.n));
  },
  (err) => logger.error({ err }, 'Backlog metrics failed'),
);
const server = createServer((req, res) => {
  if (req.url === '/internal/metrics') {
    if (!metricsAuthorized(req.headers.authorization)) {
      res.writeHead(404).end();
      return;
    }
    void registry.metrics().then(
      (body) => res.writeHead(200, { 'Content-Type': registry.contentType }).end(body),
      () => res.writeHead(503).end(),
    );
    return;
  }
  if (req.url === '/health') {
    res.end('{"status":"ok","service":"worker"}');
    return;
  }
  if (req.url !== '/ready') {
    res.writeHead(404).end();
    return;
  }
  void dependencyReady([client`select 1`, redis.ping(), readinessStore.ready()]).then(
    () => res.end('{"status":"ready"}'),
    () => res.writeHead(503).end('{"status":"unavailable"}'),
  );
}).listen(4001, '0.0.0.0');
logger.info('Worker health server listening');
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    shutdownDeadline();
    const healthClosed = new Promise<void>((resolve) => server.close(() => resolve()));
    void Promise.all([
      backlogPoll.stop(),
      dispatch.stop(),
      inboundDispatch.stop(),
      publicationDispatch.stop(),
      mailDispatch.stop(),
      domainPolling.stop(),
      webhookDispatch.stop(),
      retention.stop(),
      objectCleanup.stop(),
      broadcastDispatch.stop(),
      automationDispatch.stop(),
    ])
      .then(() =>
        Promise.all([
          workflowWorker.close(),
          inboundWorker.close(),
          publicationWorker.close(),
          mailWorker.close(),
          webhookWorker.close(),
          broadcastWorker.close(),
          automationWorker.close(),
          healthClosed,
        ]),
      )
      .then(stopTelemetry)
      .then(() => Promise.all([client.end(), redis.quit()]))
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        logger.error({ err }, 'Worker graceful shutdown failed');
        process.exit(1);
      });
  });
