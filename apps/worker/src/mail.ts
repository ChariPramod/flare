import { withJob } from '@flare/shared';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '@flare/db';
import { toJson, withTenant } from '@flare/db';
import {
  deliverEmail,
  recoverDeliveries,
  objectStore,
  configuredTransports,
  verifyRecords,
  verificationStatus,
  verificationDelay,
  outbox,
} from '@flare/mail';
import type { DnsRecord } from '@flare/mail';
export function startMailWorker(
  sql: Sql,
  connection: Redis,
  encryptionKey: string,
  trackingKey: string,
) {
  const store = objectStore();
  const queue = new Queue('email-delivery', { connection });
  const worker = new Worker<{ id: string }>(
    'email-delivery',
    async (job) => {
      const [context] =
        await sql`select request_id,traceparent from messages where id=${job.data.id}`;
      await withJob('email-delivery', job.data.id, context?.traceparent, context?.request_id, () =>
        deliverEmail(
          { sql, store, encryptionKey, trackingKey, transports: configuredTransports() },
          job.data.id,
        ),
      );
    },
    { connection, concurrency: 10 },
  );
  let running = false;
  async function dispatch() {
    if (running) return;
    running = true;
    try {
      await recoverDeliveries(sql);
      const due =
        await sql`select id from messages where delivery_finished_at is null and status not in ('canceled','suppressed','failed') and scheduled_at<=now() and next_attempt_at<=now() and claim_id is null order by next_attempt_at,scheduled_at limit 100`;
      for (const row of due)
        await queue.add(
          'deliver',
          { id: String(row.id) },
          { jobId: String(row.id), removeOnComplete: true, removeOnFail: true },
        );
    } finally {
      running = false;
    }
  }
  let verifying = false;
  async function verifyDomains() {
    if (verifying) return;
    verifying = true;
    try {
      // Claim DNS work by moving the next check forward; a crash makes it eligible again in two minutes.
      const due =
        await sql`update domains set next_check_at=now()+interval '2 minutes' where id in (select id from domains where next_check_at<=now() order by next_check_at for update skip locked limit 10) returning *`;
      for (const domain of due) {
        const records = await verifyRecords(domain.records as DnsRecord[]);
        const status = verificationStatus(records);
        await withTenant(
          sql,
          { orgId: String(domain.org_id), environmentId: String(domain.environment_id) },
          async (tx) => {
            const changed =
              await tx`update domains set status=${status},records=${tx.json(toJson(records))},checked_at=now(),verified_at=case when ${status}='verified' then now() else null end,verification_attempts=verification_attempts+1,next_check_at=now()+${verificationDelay(Number(domain.verification_attempts), status === 'verified')}*interval '1 second' where id=${domain.id} and records=${tx.json(toJson(domain.records))} returning id`;
            if (changed.length && domain.status !== status)
              await outbox(
                tx,
                { orgId: String(domain.org_id), environmentId: String(domain.environment_id) },
                `domain.${status}`,
                { id: domain.id, name: domain.name, previous_status: domain.status },
              );
          },
        );
      }
    } finally {
      verifying = false;
    }
  }
  return {
    worker,
    dispatch,
    verifyDomains,
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
