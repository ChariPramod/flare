import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { decrypt } from '@flare/shared';
import { MailError } from '@flare/mail';
import { advancePublication, syncPublicationWorkflow } from '@flare/platform';
export function startPublicationWorker(sql: Sql, connection: Redis, encryptionKey: string) {
  const queue = new Queue('publications', { connection });
  const worker = new Worker<{ id: string }>(
    'publications',
    async (job) => {
      const [row] =
        await sql`select e.novu_key_cipher,e.org_id,e.id from publication_operations p join environments e on e.id=p.target_environment_id and e.org_id=p.org_id where p.id=${job.data.id}`;
      const key = row?.novu_key_cipher
        ? decrypt(String(row.novu_key_cipher), encryptionKey, `${row.org_id}/${row.id}`)
        : null;
      await advancePublication(sql, job.data.id, async (_tenant, workflow, deps) => {
        if (!key)
          throw new MailError(422, 'Configure the Production Novu key before retrying publication');
        await syncPublicationWorkflow(
          process.env.NOVU_API_URL ?? 'http://novu-api:3000',
          key,
          workflow,
          deps,
        );
      });
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
          await sql`select id from publication_operations where status='pending' order by created_at limit 100`;
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
