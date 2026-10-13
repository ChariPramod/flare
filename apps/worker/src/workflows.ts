import { Queue, Worker } from 'bullmq';
import type { Sql } from '@flare/db';
import { decrypt } from '@flare/shared';
import { dispatchWorkflow, recoverWorkflowRuns, sendWorkflowRequest } from '@flare/platform';
import type { Redis } from 'ioredis';
export function startWorkflowWorker(sql: Sql, connection: Redis, encryptionKey: string) {
  const queue = new Queue('workflow-triggers', { connection });
  const worker = new Worker<{ id: string }>(
    'workflow-triggers',
    async (job) => {
      await dispatchWorkflow(sql, job.data.id, async (run, cancel) => {
        const [environment] =
          await sql`select novu_key_cipher from environments where id=${String(run.environment_id)} and org_id=${String(run.org_id)}`;
        if (!environment?.novu_key_cipher)
          return { kind: 'rejected', error: 'Novu is not configured' };
        let key: string;
        try {
          key = decrypt(
            String(environment.novu_key_cipher),
            encryptionKey,
            `${run.org_id}/${run.environment_id}`,
          );
        } catch {
          return { kind: 'rejected', error: 'Novu credentials cannot be decrypted' };
        }
        return sendWorkflowRequest(
          process.env.NOVU_API_URL ?? 'http://novu-api:3000',
          key,
          run,
          cancel,
        );
      });
    },
    { connection, concurrency: 10 },
  );
  let polling = false;
  return {
    worker,
    dispatch: async () => {
      if (polling) return;
      polling = true;
      try {
        await recoverWorkflowRuns(sql);
        const rows =
          await sql`select id from workflow_runs where claim_id is null and next_attempt_at<=now() and (status='queued' or (status='canceled' and cancellation_status='pending')) order by next_attempt_at limit 100`;
        for (const row of rows) {
          const previous = await queue.getJob(String(row.id));
          if (previous && ['completed', 'failed'].includes(await previous.getState()))
            await previous.remove();
          await queue.add(
            'trigger',
            { id: String(row.id) },
            { jobId: String(row.id), removeOnComplete: true, removeOnFail: true },
          );
        }
      } finally {
        polling = false;
      }
    },
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
