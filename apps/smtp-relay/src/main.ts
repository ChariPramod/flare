import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createLogger, infrastructureConfig, hashToken } from '@flare/shared';
import type { Principal } from '@flare/shared';
import { connectDatabase } from '@flare/db';
import { submitEmails, objectStore, configuredTransports, MailError } from '@flare/mail';
import { createRelay } from './server.js';
const logger = createLogger('smtp-relay');
const config = infrastructureConfig.parse(process.env);
const { client: sql } = connectDatabase(config.DATABASE_URL);
const store = objectStore();
const smtp = createRelay({
  cert: readFileSync(process.env.SMTP_TLS_CERT ?? '/app/ops/certs/relay.crt'),
  key: readFileSync(process.env.SMTP_TLS_KEY ?? '/app/ops/certs/relay.key'),
  async authenticate(token): Promise<Principal> {
    if (!token.startsWith('fl_')) throw new MailError(401, 'Invalid API key');
    const [key] =
      await sql`select k.*,e.name as environment_name from api_keys k join environments e on e.id=k.environment_id and e.org_id=k.org_id where k.token_hash=${hashToken(token)} and k.revoked_at is null`;
    if (!key) throw new MailError(401, 'Invalid API key');
    await sql`update api_keys set last_used_at=now() where id=${key.id}`;
    return {
      orgId: String(key.org_id),
      environmentId: String(key.environment_id),
      actorId: String(key.id),
      role: 'developer',
      kind: 'api_key',
      permission: key.permission as 'full_access' | 'sending_access',
      domainId: key.domain_id ? String(key.domain_id) : null,
      production: key.environment_name === 'Production',
    };
  },
  async submit(principal, input, headers) {
    const result = await submitEmails(
      {
        sql,
        store,
        encryptionKey: config.FLARE_ENCRYPTION_KEY,
        trackingKey: config.JWT_SECRET,
        transports: configuredTransports(),
      },
      principal,
      [input],
      { smtpHeaders: headers },
    );
    return result.data[0]!.id;
  },
});
smtp.on('error', (err: Error) => logger.error({ err }, 'SMTP listener failed'));
smtp.listen(Number(process.env.SMTP_RELAY_PORT ?? 2525), '0.0.0.0');
const server = createServer((req, res) => {
  if (req.url === '/health') res.end('{"status":"ok","service":"smtp-relay"}');
  else if (req.url === '/ready')
    void sql`select 1`.then(
      () => res.end('{"status":"ready"}'),
      () => res.writeHead(503).end(),
    );
  else res.writeHead(404).end();
}).listen(4002, '0.0.0.0');
logger.info('SMTP relay health server listening');
for (const signal of ['SIGTERM', 'SIGINT'])
  process.once(signal, () => {
    server.close();
    smtp.close(() => {
      void sql.end().then(() => process.exit(0));
    });
  });
