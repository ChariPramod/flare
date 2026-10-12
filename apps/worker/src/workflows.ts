import { Queue, UnrecoverableError, Worker } from 'bullmq';
import type { Sql } from '@flare/db';
import { decrypt } from '@flare/shared';
import type { Redis } from 'ioredis';

export function startWorkflowWorker(sql: Sql, connection: Redis, encryptionKey: string) {
  const queue = new Queue('workflow-triggers', { connection });
  const worker = new Worker<{ id: string }>(
    'workflow-triggers',
    async (job) => {
      const [run] =
        await sql`select r.*,e.novu_key_cipher from workflow_runs r join environments e on e.id=r.environment_id and e.org_id=r.org_id where r.id=${job.data.id}`;
      if (!run || run.status !== 'queued') return;
      if (!run.novu_key_cipher) throw new UnrecoverableError('Novu is not configured');
      const key = decrypt(
        String(run.novu_key_cipher),
        encryptionKey,
        `${run.org_id}/${run.environment_id}`,
      );
      await sql`update workflow_runs set attempts=attempts+1,updated_at=now() where id=${run.id}`;
      const response = await fetch(
        `${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}/v1/events/trigger`,
        {
          method: 'POST',
          headers: {
            Authorization: `ApiKey ${key}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': String(run.id),
          },
          body: JSON.stringify(run.payload),
          signal: AbortSignal.timeout(15000),
          redirect: 'error',
        },
      );
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          ![408, 409, 429].includes(response.status)
        )
          throw new UnrecoverableError(`Novu rejected trigger (${response.status})`);
        throw new Error(`Novu unavailable (${response.status})`);
      }
      const result = await response.json();
      const updated =
        await sql`update workflow_runs set status='accepted',response=${sql.json(JSON.parse(JSON.stringify(result)))},updated_at=now() where id=${run.id} and status='queued' returning id`;
      if (!updated.length)
        await fetch(
          `${process.env.NOVU_API_URL ?? 'http://novu-api:3000'}/v1/events/trigger/${encodeURIComponent(String(run.transaction_id))}`,
          {
            method: 'DELETE',
            headers: { Authorization: `ApiKey ${key}` },
            signal: AbortSignal.timeout(15000),
            redirect: 'error',
          },
        );
    },
    { connection, concurrency: 10 },
  );
  worker.on('failed', (job, error) => {
    if (
      job &&
      (job.attemptsMade >= Number(job.opts.attempts ?? 1) || error instanceof UnrecoverableError)
    )
      void sql`update workflow_runs set status='failed',error=${error.message.slice(0, 500)},updated_at=now() where id=${job.data.id} and status='queued'`.catch(
        () => undefined,
      );
  });
  let polling = false;
  const dispatch = async () => {
    if (polling) return;
    polling = true;
    try {
      const rows =
        await sql`select id from workflow_runs where status='queued' order by created_at limit 100`;
      for (const row of rows)
        await queue.add(
          'trigger',
          { id: String(row.id) },
          {
            jobId: String(row.id),
            attempts: 4,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: 1000,
            removeOnFail: 1000,
          },
        );
    } finally {
      polling = false;
    }
  };
  return {
    worker,
    dispatch,
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
