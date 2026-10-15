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
  evaluateFeedbackPolicy,
  domainRecords,
  domainResolver,
  resolveDmarc,
  parseNamedTransports,
  transportInstanceIdentity,
  probeNamedSesIdentity,
  providerEvidenceSchema,
} from '@flare/mail';
import type { DnsRecord, DnsResolver } from '@flare/mail';
export async function sweepSendingFeedback(
  sql: Sql,
  cursor?: string,
  evaluate = evaluateFeedbackPolicy,
) {
  const rows =
    await sql`select org_id from sending_policies where state='approved' and (${cursor ?? null}::uuid is null or org_id>${cursor ?? null}::uuid) order by org_id limit 100`;
  let failed = 0;
  for (const row of rows) {
    try {
      await evaluate(sql, String(row.org_id));
    } catch {
      failed++;
    }
  }
  // Advance even when an individual organization fails; the next wrap retries it without starving others.
  return {
    cursor: rows.length === 100 ? String(rows.at(-1)!.org_id) : undefined,
    processed: rows.length,
    failed,
  };
}
export async function verifyDueMailDomains(sql: Sql, dns: DnsResolver = domainResolver) {
  const due =
    await sql`update domains set next_check_at=now()+interval '2 minutes' where id in (select id from domains where next_check_at<=now() order by next_check_at for update skip locked limit 10) returning *,next_check_at::text as check_claim`;
  const results = await Promise.allSettled(
    due.map(async (domain) => {
      const instructions = domainRecords({
        name: String(domain.name),
        region: String(domain.region),
        sending: Boolean(domain.sending),
        receiving: Boolean(domain.receiving),
        open_tracking: Boolean(domain.open_tracking),
        click_tracking: Boolean(domain.click_tracking),
        tracking_subdomain: String(domain.tracking_subdomain),
        enforce_tls: Boolean(domain.enforce_tls),
        dkim_selector: String(domain.dkim_selector),
        dkim_public: String(domain.dkim_public),
      });
      const [verified, dmarc] = await Promise.all([
        verifyRecords(
          instructions.filter((record) => record.purpose !== 'dmarc'),
          dns,
        ),
        resolveDmarc(String(domain.name), dns),
      ]);
      const records: DnsRecord[] = instructions.map((record) =>
        record.purpose === 'dmarc'
          ? {
              ...record,
              status:
                dmarc.status === 'verified'
                  ? 'verified'
                  : dmarc.status === 'temporary_failure'
                    ? 'temporary_failure'
                    : 'failed',
            }
          : verified.find(
              (item) =>
                item.purpose === record.purpose &&
                item.name === record.name &&
                item.type === record.type,
            )!,
      );
      const status = verificationStatus(records);
      await withTenant(
        sql,
        { orgId: String(domain.org_id), environmentId: String(domain.environment_id) },
        async (tx) => {
          const changed =
            await tx`update domains set status=${status},records=${tx.json(toJson(records))},dmarc_evidence=${tx.json(toJson(dmarc))},checked_at=now(),verified_at=case when ${status}='verified' then coalesce(verified_at,now()) else null end,verification_attempts=case when ${status}='verified' then 0 else verification_attempts+1 end,next_check_at=now()+${verificationDelay(Number(domain.verification_attempts), status === 'verified')}*interval '1 second' where id=${domain.id} and records=${tx.json(toJson(domain.records))} and next_check_at=${domain.check_claim}::timestamptz and dkim_selector=${domain.dkim_selector} and dkim_public=${domain.dkim_public} and name=${domain.name} and sending=${domain.sending} and receiving=${domain.receiving} and open_tracking=${domain.open_tracking} and click_tracking=${domain.click_tracking} and tracking_subdomain=${domain.tracking_subdomain} returning id`;
          if (changed.length && domain.status !== status)
            await outbox(
              tx,
              { orgId: String(domain.org_id), environmentId: String(domain.environment_id) },
              `domain.${status}`,
              { id: domain.id, name: domain.name, previous_status: domain.status },
            );
        },
      );
    }),
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed) throw new Error(`DNS verification failed for ${failed} domains`);
  return due.length;
}
export async function refreshSesReadiness(sql: Sql, probe = probeNamedSesIdentity) {
  if (!process.env.MAIL_TRANSPORTS) return 0;
  const instances = parseNamedTransports(process.env.MAIL_TRANSPORTS).filter(
    (item) => item.kind === 'ses',
  );
  if (!instances.length) return 0;
  const due =
    await sql`update domain_transport_readiness set provider_check_after=now()+interval '2 minutes' where (org_id,environment_id,domain_id,transport_instance) in (select org_id,environment_id,domain_id,transport_instance from domain_transport_readiness where revoked_at is null and provider_check_after<=now() and transport_instance=any(${sql.array(instances.map((item) => item.id))}::text[]) order by provider_check_after for update skip locked limit 10) returning *,provider_check_after::text as check_claim`;
  for (const row of due) {
    const config = instances.find((instance) => instance.id === row.transport_instance)!;
    let fingerprint: string | undefined;
    try {
      fingerprint = transportInstanceIdentity(config).config_fingerprint;
    } catch {
      /* Missing credentials must invalidate previous provider success, not refresh it. */
    }
    const proof = providerEvidenceSchema.safeParse(row.evidence);
    const [domain] =
      await sql`select name from domains where org_id=${row.org_id} and environment_id=${row.environment_id} and id=${row.domain_id}`;
    if (!domain) continue;
    let result: Awaited<ReturnType<typeof probe>> | { evidence: null } = { evidence: null };
    if (fingerprint === row.config_fingerprint && proof.success) {
      try {
        result = await probe(config, String(domain.name));
      } catch {
        /* A provider outage immediately invalidates previous success. */
      }
    }
    const evidence = proof.success ? { ...proof.data } : null;
    if (evidence) {
      // Retain the original received-message timestamp; only provider configuration is being observed again.
      delete evidence.ses;
      if (result.evidence) evidence.ses = result.evidence;
    }
    await sql`update domain_transport_readiness set evidence=${sql.json(toJson(evidence ?? row.evidence))},provider_checked_at=now(),provider_check_after=now()+interval '1 hour' where org_id=${row.org_id} and environment_id=${row.environment_id} and domain_id=${row.domain_id} and transport_instance=${row.transport_instance} and config_fingerprint=${row.config_fingerprint} and evidence=${sql.json(toJson(row.evidence))} and revoked_at is null and provider_check_after=${row.check_claim}::timestamptz`;
  }
  return due.length;
}
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
  let feedbackCursor: string | undefined;
  async function dispatch() {
    if (running) return;
    running = true;
    try {
      await recoverDeliveries(sql);
      const sweep = await sweepSendingFeedback(sql, feedbackCursor);
      feedbackCursor = sweep.cursor;
      const due =
        await sql`select id from messages where delivery_finished_at is null and status not in ('canceled','suppressed','failed') and scheduled_at<=now() and next_attempt_at<=now() and claim_id is null order by next_attempt_at,scheduled_at limit 100`;
      for (const row of due)
        await queue.add(
          'deliver',
          { id: String(row.id) },
          { jobId: String(row.id), removeOnComplete: true, removeOnFail: true },
        );
      if (sweep.failed)
        throw new Error(`Sending feedback evaluation failed for ${sweep.failed} organizations`);
    } finally {
      running = false;
    }
  }
  let verifying = false;
  async function verifyDomains() {
    if (verifying) return;
    verifying = true;
    try {
      await verifyDueMailDomains(sql);
      await refreshSesReadiness(sql);
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
