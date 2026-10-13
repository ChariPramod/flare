import { withJob } from '@flare/shared';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { configuredTransports, objectStore } from '@flare/mail';
import { dispatchBroadcast } from '@flare/platform';
export function startBroadcastWorker(
  sql: Sql,
  connection: Redis,
  encryptionKey: string,
  trackingKey: string,
) {
  const queue = new Queue('broadcast-dispatch', { connection });
  const worker = new Worker<{ id: string }>(
    'broadcast-dispatch',
    async (job) =>
      withJob('broadcasts', job.data.id, undefined, undefined, async () => {
        try {
          await dispatchBroadcast(
            {
              sql,
              store: objectStore(),
              transports: configuredTransports(),
              encryptionKey,
              trackingKey,
            },
            job.data.id,
            process.env.WEB_ORIGIN ?? 'http://localhost:3000',
          );
        } catch (error) {
          await sql`update broadcasts set error=${(error instanceof Error ? error.message : 'Dispatch failed').slice(0, 500)},next_dispatch_at=now()+interval '1 minute' where id=${job.data.id} and status in ('scheduled','sending')`;
          throw error;
        }
      }),
    { connection, concurrency: 4 },
  );
  let running = false;
  return {
    worker,
    async dispatch() {
      if (running) return;
      running = true;
      try {
        const rows =
          await sql`select id from broadcasts where status in ('scheduled','sending') and next_dispatch_at<=now() order by next_dispatch_at limit 100`;
        for (const row of rows)
          await queue.add(
            'dispatch',
            { id: String(row.id) },
            { jobId: String(row.id), removeOnComplete: true, removeOnFail: true },
          );
      } finally {
        running = false;
      }
    },
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}
