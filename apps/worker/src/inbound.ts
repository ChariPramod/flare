import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { objectStore, configuredTransports } from '@flare/mail';
import { parseInbound, forwardInbound } from '@flare/platform';
export function startInboundWorker(
  sql: Sql,
  connection: Redis,
  encryptionKey: string,
  trackingKey: string,
) {
  const queue = new Queue('inbound', { connection });
  const options = {
    sql,
    store: objectStore(),
    transports: configuredTransports(),
    encryptionKey,
    trackingKey,
  };
  const worker = new Worker<{ id: string; kind: 'parse' | 'forward' }>(
    'inbound',
    async (job) => {
      if (job.data.kind === 'parse') await parseInbound(sql, options.store, job.data.id);
      else await forwardInbound(options, job.data.id);
    },
    { connection, concurrency: 4 },
  );
  let polling = false;
  return {
    worker,
    async dispatch() {
      if (polling) return;
      polling = true;
      try {
        const rows =
          await sql`select id,'parse' as kind from inbound_messages where status='pending' and next_attempt_at<=now() union all select id,'forward' as kind from inbound_forwards where status='pending' and next_attempt_at<=now() limit 100`;
        for (const row of rows)
          await queue.add(
            String(row.kind),
            { id: String(row.id), kind: row.kind },
            { jobId: String(row.id), removeOnComplete: true, removeOnFail: true },
          );
      } finally {
        polling = false;
      }
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
