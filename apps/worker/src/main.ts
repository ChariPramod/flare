import { createServer } from 'node:http';
import { Redis } from 'ioredis';
import { connectDatabase } from '@flare/db';
import { createLogger, infrastructureConfig } from '@flare/shared';
const config = infrastructureConfig.parse(process.env);
const logger = createLogger('worker');
const { client } = connectDatabase(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on('error', (err: Error) => logger.error({ err }, 'Redis connection failed'));
const server = createServer((req, res) => {
  if (req.url === '/health') { res.end('{"status":"ok","service":"worker"}'); return; }
  if (req.url !== '/ready') { res.writeHead(404).end(); return; }
  void Promise.all([client`select 1`, redis.ping()]).then(() => res.end('{"status":"ready"}'), () => res.writeHead(503).end('{"status":"unavailable"}'));
}).listen(4001, '0.0.0.0');
logger.info('Worker health server listening');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  server.close(); void Promise.all([client.end(), redis.quit()]).then(() => process.exit(0));
});
