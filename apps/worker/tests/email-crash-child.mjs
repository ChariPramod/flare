import { integrationTargets } from './targets.mjs';
import { connectDatabase } from '@flare/db';
import { configuredTransports, deliverEmail, objectStore } from '@flare/mail';

integrationTargets();

// Integration-only process. Never accept production targets or emit SMTP content/secrets.
if (
  process.env.FLARE_EMAIL_CRASH_TEST !== 'true' ||
  new URL(process.env.TEST_DATABASE_URL).pathname !== '/flare_test' ||
  new URL(process.env.TEST_REDIS_URL).pathname !== '/15' ||
  process.env.S3_ENDPOINT !== 'http://127.0.0.1:19000' ||
  process.env.S3_BUCKET !== 'flare-test' ||
  !/^[a-f0-9-]{36}$/.test(process.argv[2] ?? '') ||
  !process.send
)
  throw new Error('Disposable email crash fixture required');
process.on('disconnect', () => process.exit(1));
const sql = connectDatabase(process.env.TEST_DATABASE_URL, { max: 2 }).client;
sql.options.onnotice = () => undefined;
try {
  const configs = JSON.parse(process.env.MAIL_TRANSPORTS);
  if (configs.length !== 1 || configs[0].host !== '127.0.0.1' || configs[0].port !== 11025)
    throw new Error('Only disposable loopback Mailpit is allowed');
  const [smtp, ...others] = configuredTransports();
  if (!smtp?.instance || smtp.name !== 'smtp' || smtp.sandbox || others.length)
    throw new Error('Named non-sandbox SMTP fixture required');
  await deliverEmail(
    {
      sql,
      encryptionKey: process.env.FLARE_ENCRYPTION_KEY,
      trackingKey: process.env.FLARE_ENCRYPTION_KEY,
      store: objectStore(),
      transports: [
        {
          name: smtp.name,
          instance: smtp.instance,
          sandbox: false,
          supportsRequiredTls: () => smtp.supportsRequiredTls(),
          async send(message) {
            const accepted = await smtp.send(message);
            if (
              accepted.accepted.length !== message.to.length ||
              accepted.rejected.length ||
              accepted.retryableRejected?.length
            )
              throw new Error('SMTP fixture did not accept every recipient');
            // Real SMTP acceptance has happened, but deliverEmail has not persisted
            // it. The parent kills this process while the production lease is live.
            process.send({ stage: 'smtp-accepted' });
            return await new Promise(() => {});
          },
        },
      ],
    },
    process.argv[2],
  );
  process.send({ stage: 'unexpected-return' });
  process.exit(1);
} catch {
  // Deliberately omit exception text: it may contain credentials or message data.
  process.send({ stage: 'fixture-failed' });
  process.exit(1);
}
