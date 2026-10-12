import { createServer } from 'node:http';
import { createLogger } from '@flare/shared';
const logger = createLogger('smtp-relay');
// The SMTP listener is introduced with the authenticated email pipeline in phase 3.
const server = createServer((req, res) => {
  if (req.url === '/health') res.end('{"status":"ok","service":"smtp-relay"}');
  else res.writeHead(503).end('{"status":"pipeline-not-configured"}');
}).listen(4002, '0.0.0.0');
logger.info('SMTP relay health server listening');
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
