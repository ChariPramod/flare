import { withJob } from '@flare/shared';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { configuredTransports, objectStore } from '@flare/mail';
import { advanceAutomation, failAutomation, fanOutAutomationEvents } from '@flare/platform';
export function startAutomationWorker(
  sql: Sql,
  connection: Redis,
  encryptionKey: string,
  trackingKey: string,
) {
  const queue = new Queue('automation-steps', { connection });
  const worker = new Worker<{ id: string }>(
    'automation-steps',
    async (job) =>
      withJob('automations', job.data.id, undefined, undefined, async () => {
        try {
          await advanceAutomation(
            {
              sql,
              store: objectStore(),
              transports: configuredTransports(),
              encryptionKey,
              trackingKey,
            },
            job.data.id,
          );
        } catch (error) {
          await failAutomation(sql, job.data.id, error);
          throw error;
        }
      }),
    { connection, concurrency: 8 },
  );
  let polling = false;
  return {
    worker,
    async dispatch() {
      if (polling) return;
      polling = true;
      try {
        await fanOutAutomationEvents(sql);
        const rows =
          await sql`select id from automation_runs where status in ('queued','waiting') and next_step_at<=now() order by next_step_at limit 100`;
        for (const row of rows)
          await queue.add(
            'advance',
            { id: String(row.id) },
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
