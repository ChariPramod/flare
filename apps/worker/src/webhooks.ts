import { withJob } from '@flare/shared';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { deliverWebhook, fanOutEvents, recoverWebhooks } from '@flare/platform';
export function startWebhookWorker(sql: Sql, connection: Redis, encryptionKey: string) {
  const queue = new Queue('webhook-delivery', { connection });
  const worker = new Worker<{ id: string }>(
    'webhook-delivery',
    async (job) =>
      withJob('webhook-delivery', job.data.id, undefined, undefined, async () => {
        await deliverWebhook(sql, encryptionKey, job.data.id);
      }),
    { connection, concurrency: 10 },
  );
  let running = false;
  return {
    worker,
    async dispatch() {
      if (running) return;
      running = true;
      try {
        await recoverWebhooks(sql);
        await fanOutEvents(sql);
        const rows =
          await sql`select d.id from webhook_deliveries d join webhook_endpoints e on e.id=d.endpoint_id where d.status='pending' and d.next_attempt_at<=now() and e.enabled=true order by d.next_attempt_at limit 100`;
        for (const row of rows)
          await queue.add(
            'deliver',
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
