import { startWorkflowWorker } from './workflows.js';
import { startWebhookWorker } from './webhooks.js';
import { startMailWorker } from './mail.js';
import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { createLogger, infrastructureConfig } from '@flare/shared';
const config = infrastructureConfig.parse(process.env);
const logger = createLogger('worker');
const { client } = connectDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on('error', (err: Error) => logger.error({ err }, 'Redis connection failed'));
const workflowWorker = startWorkflowWorker(client, redis, config.FLARE_ENCRYPTION_KEY);
const mailWorker = startMailWorker(client, redis, config.FLARE_ENCRYPTION_KEY, config.JWT_SECRET);
const webhookWorker = startWebhookWorker(client, redis, config.FLARE_ENCRYPTION_KEY);
webhookWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Webhook worker error'));
const webhookDispatch = setInterval(() => {
  void webhookWorker
    .dispatch()
    .catch((err: unknown) => logger.error({ err }, 'Webhook dispatch failed'));
}, 2000);
const retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? 30);
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650)
  throw new Error('LOG_RETENTION_DAYS must be 1–3650');
const retention = setInterval(() => {
  void client`delete from request_logs where created_at<now()-${retentionDays}*interval '1 day'`.catch(
    (err: unknown) => logger.error({ err }, 'Request log retention failed'),
  );
}, 3600000);
mailWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Email worker error'));
const mailDispatch = setInterval(() => {
  void mailWorker
    .dispatch()
    .catch((err: unknown) => logger.error({ err }, 'Email dispatch failed'));
}, 2000);
const domainPolling = setInterval(() => {
  void mailWorker
    .verifyDomains()
    .catch((err: unknown) => logger.error({ err }, 'Domain verification failed'));
}, 10000);
workflowWorker.worker.on('error', (err: Error) => logger.error({ err }, 'Workflow worker error'));
const dispatch = setInterval(() => {
  void workflowWorker
    .dispatch()
    .catch((err: unknown) => logger.error({ err }, 'Workflow dispatch failed'));
}, 2000);
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.end('{"status":"ok","service":"worker"}');
    return;
  }
  if (req.url !== '/ready') {
    res.writeHead(404).end();
    return;
  }
  void Promise.all([client`select 1`, redis.ping()]).then(
    () => res.end('{"status":"ready"}'),
    () => res.writeHead(503).end('{"status":"unavailable"}'),
  );
}).listen(4001, '0.0.0.0');
logger.info('Worker health server listening');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    clearInterval(dispatch);
    clearInterval(mailDispatch);
    clearInterval(domainPolling);
    clearInterval(webhookDispatch);
    clearInterval(retention);
    server.close();
    void Promise.all([workflowWorker.close(), mailWorker.close(), webhookWorker.close()])
      .then(() => Promise.all([client.end(), redis.quit()]))
      .then(() => process.exit(0));
  });
