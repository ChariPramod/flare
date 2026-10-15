import { integrationTargets } from './targets.mjs';
import { connectDatabase } from '@flare/db';
import { configuredTransports, objectStore } from '@flare/mail';
import { forwardInbound, parseInbound } from '@flare/platform';

const { databaseUrl } = integrationTargets();
const [mode, id] = process.argv.slice(2);
if (
  process.env.FLARE_INBOUND_CRASH_TEST !== 'true' ||
  process.env.S3_ENDPOINT !== 'http://127.0.0.1:19000' ||
  process.env.S3_BUCKET !== 'flare-test' ||
  process.env.MAIL_SANDBOX !== 'true' ||
  process.env.SMTP_HOST !== '127.0.0.1' ||
  process.env.SMTP_PORT !== '11025' ||
  !['parse', 'forward'].includes(mode) ||
  !/^[a-f0-9-]{36}$/.test(id ?? '') ||
  !process.send
)
  throw new Error('Disposable inbound crash fixture required');
process.on('disconnect', () => process.exit(1));
const sql = connectDatabase(databaseUrl, { max: 1 }).client;
sql.options.onnotice = () => undefined;
const realStore = objectStore();
const store = {
  ...realStore,
  async put(key, body, contentType) {
    await realStore.put(key, body, contentType);
    process.send({ stage: 'object-written', key });
    if (key.endsWith(mode === 'parse' ? '/body.json' : '/message.eml')) {
      // All external writes are real. Pause only at the injected store boundary,
      // inside production's uncommitted transaction, until the parent SIGKILLs us.
      process.send({ stage: 'before-commit' });
      return await new Promise(() => {});
    }
  },
};
try {
  await sql`set application_name='flare-inbound-crash-fixture'`;
  const transports = configuredTransports();
  if (transports.length !== 1 || transports[0].name !== 'smtp' || !transports[0].sandbox)
    throw new Error('Only disposable sandbox Mailpit is allowed');
  if (mode === 'parse') await parseInbound(sql, store, id);
  else
    await forwardInbound(
      {
        sql,
        store,
        transports,
        encryptionKey: process.env.FLARE_ENCRYPTION_KEY,
        trackingKey: process.env.FLARE_ENCRYPTION_KEY,
      },
      id,
    );
  process.send({ stage: 'unexpected-return' });
  process.exit(1);
} catch {
  // Exceptions may include message content or credentials; send metadata only.
  process.send({ stage: 'fixture-failed' });
  process.exit(1);
}
