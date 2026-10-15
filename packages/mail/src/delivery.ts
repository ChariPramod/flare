import { providerAttempts } from '@flare/shared';
import { randomUUID } from 'node:crypto';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { mailLimits } from './validation.js';
import { outbox } from './pipeline.js';
import type { PipelineOptions } from './pipeline.js';
import { TransportError } from './transports.js';

export async function deliverEmail(options: PipelineOptions, id: string) {
  const claim = randomUUID();
  const { sql } = options;
  const [message] =
    await sql`update messages set claim_id=${claim},delivery_started_at=coalesce(delivery_started_at,now()),lease_until=now()+interval '2 minutes',updated_at=now() where id=${id} and delivery_finished_at is null and status not in ('canceled','suppressed','failed') and scheduled_at<=now() and next_attempt_at<=now() and claim_id is null returning *`;
  if (!message) return;
  const tenant = { orgId: String(message.org_id), environmentId: String(message.environment_id) };
  let leaseLost = false;
  const heartbeat = setInterval(() => {
    void sql`update messages set lease_until=now()+interval '2 minutes' where id=${id} and claim_id=${claim}`.then(
      (rows) => {
        if (!rows.count) leaseLost = true;
      },
      () => {
        leaseLost = true;
      },
    );
  }, 20_000);
  const finishFailure = async (tx: Transaction, error: string) => {
    const rows =
      await tx`update messages set status=case when status in ('queued','scheduled') then 'failed' else status end,delivery_finished_at=now(),error=${error},claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim} returning id`;
    if (rows.length) {
      await tx`update message_recipients set status='failed' where message_id=${id} and status='queued'`;
      await outbox(tx, tenant, 'email.failed', { email_id: id, error });
    }
  };
  const fail = (error: string) => withTenant(sql, tenant, (tx) => finishFailure(tx, error));
  const postpone = async (tx: Transaction, seconds: number) => {
    await tx`update messages set next_attempt_at=now()+${seconds}*interval '1 second',claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim}`;
  };
  let unresolvedAttempt = false;
  try {
    const raw = await options.store.get(String(message.mime_key), mailLimits().mime);
    let ordinal = Number(
      (await sql`select count(*)::int as n from transport_attempts where message_id=${id}`)[0]!.n,
    );
    for (const transport of options.transports) {
      const previous =
        await sql`select status from transport_attempts where message_id=${id} and provider=${transport.name} and retry_cycle=${message.redrives} order by ordinal`;
      if (
        previous.some((attempt) =>
          ['started', 'ambiguous', 'permanent_failure'].includes(String(attempt.status)),
        )
      ) {
        await fail('Previous transport outcome prohibits automatic retry');
        return;
      }
      const retry = previous.length;
      if (retry >= 4) continue;
      if (leaseLost) return;
      const [domain] =
        await sql`select status,sending,enforce_tls from domains where id=${message.domain_id} and org_id=${tenant.orgId} and environment_id=${tenant.environmentId}`;
      if (!domain || domain.status !== 'verified' || !domain.sending) {
        await fail('Sender domain is no longer verified');
        return;
      }
      if (domain.enforce_tls) {
        try {
          if (!(await transport.supportsRequiredTls())) continue;
        } catch {
          continue;
        }
      }
      const to = await withTenant(sql, tenant, async (tx) => {
        if (message.contact_id) {
          const [eligibility] =
            await tx`select c.unsubscribed,c.deleted_at,b.status as broadcast_status,a.status as automation_status,coalesce(p.enabled,t.default_opt_in,true) as topic_enabled from contacts c left join broadcasts b on b.id=${message.broadcast_id} and b.org_id=c.org_id and b.environment_id=c.environment_id left join automation_runs a on a.id=${message.automation_run_id} and a.org_id=c.org_id and a.environment_id=c.environment_id left join audience_topics t on t.id=${message.audience_topic_id} and t.org_id=c.org_id and t.environment_id=c.environment_id left join contact_topic_preferences p on p.contact_id=c.id and p.topic_id=t.id and p.org_id=c.org_id and p.environment_id=c.environment_id where c.id=${message.contact_id}`;
          if (
            !eligibility ||
            eligibility.unsubscribed ||
            eligibility.deleted_at ||
            eligibility.broadcast_status === 'canceled' ||
            eligibility.automation_status === 'canceled' ||
            !eligibility.topic_enabled
          ) {
            const skipped =
              await tx`update message_recipients set status='suppressed' where message_id=${id} and status='queued' returning address`;
            for (const row of skipped)
              await outbox(tx, tenant, 'email.suppressed', {
                email_id: id,
                recipient: row.address,
                reason: 'Audience preference or campaign cancellation',
              });
          }
        }
        const newlySuppressed =
          await tx`update message_recipients r set status='suppressed' where r.message_id=${id} and r.status='queued' and exists(select 1 from suppressions s where s.org_id=r.org_id and s.address=r.address) returning address`;
        for (const row of newlySuppressed)
          await outbox(tx, tenant, 'email.suppressed', { email_id: id, recipient: row.address });
        return (
          await tx`select address from message_recipients where message_id=${id} and status='queued'`
        ).map((v) => String(v.address));
      });
      if (!to.length) {
        await withTenant(sql, tenant, async (tx) => {
          const states = (
            await tx`select status from message_recipients where message_id=${id}`
          ).map((row) => String(row.status));
          const aggregate =
            ['complained', 'bounced', 'delivery_delayed', 'sent', 'failed', 'delivered'].find(
              (status) => states.includes(status),
            ) ?? 'suppressed';
          await tx`update messages set status=${aggregate},delivery_finished_at=now(),claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim}`;
        });
        return;
      }
      const [attempt] =
        await sql`insert into transport_attempts(org_id,environment_id,message_id,provider,ordinal,status,recipients,retry_cycle) select ${tenant.orgId},${tenant.environmentId},${id},${transport.name},${++ordinal},'started',${sql.json(to)},${message.redrives} from messages where id=${id} and claim_id=${claim} and lease_until>now() returning id`;
      if (!attempt) return;
      unresolvedAttempt = true;
      try {
        const result = await transport.send({
          raw,
          from: String(message.envelope_from),
          to,
          requireTls: Boolean(domain.enforce_tls),
        });
        const outcomes = [
          ...result.accepted,
          ...result.rejected,
          ...(result.retryableRejected ?? []),
        ];
        if (
          new Set(outcomes).size !== to.length ||
          outcomes.length !== to.length ||
          outcomes.some((recipient) => !to.includes(recipient))
        )
          throw new TransportError('Incomplete or overlapping recipient acceptance', 'ambiguous');
        providerAttempts.inc({
          provider: transport.name,
          outcome: result.accepted.length ? 'accepted' : 'rejected',
        });
        const pending = await withTenant(sql, tenant, async (tx) => {
          await tx`select id from messages where id=${id} for update`;
          await tx`update transport_attempts set status=${result.accepted.length ? 'accepted' : result.retryableRejected?.length ? 'transient_failure' : 'permanent_failure'},provider_ids=${tx.json(result.ids)},diagnostics=${tx.json(toJson(result.diagnostics ?? {}))},finished_at=now() where id=${attempt.id} and status='started'`;
          for (const recipient of result.accepted) {
            await tx`update message_recipients set status='sent' where message_id=${id} and address=${recipient} and status='queued'`;
            await outbox(tx, tenant, 'email.sent', {
              email_id: id,
              recipient,
              provider: transport.name,
            });
          }
          for (const recipient of result.rejected) {
            await tx`update message_recipients set status='failed' where message_id=${id} and address=${recipient} and status='queued'`;
            await outbox(tx, tenant, 'email.failed', {
              email_id: id,
              recipient,
              error: 'Provider rejected recipient',
            });
          }
          const remaining =
            await tx`select address from message_recipients where message_id=${id} and status='queued'`;
          if (!remaining.length) {
            await tx`update messages set status=${result.accepted.length ? 'sent' : 'failed'},updated_at=now() where id=${id} and status in ('queued','scheduled')`;
            await tx`update messages set delivery_finished_at=now(),claim_id=null,lease_until=null where id=${id} and claim_id=${claim}`;
          }
          if (remaining.length && retry < 3) await postpone(tx, 2 ** retry);
          return remaining.length > 0;
        });
        unresolvedAttempt = false;
        if (!pending || retry < 3) return;
        // Four definitive refusals allow only still-queued recipients to use
        // the next eligible transport. Accepted recipients are never replayed.
      } catch (error) {
        const failure =
          error instanceof TransportError
            ? error
            : new TransportError('Unknown transport outcome', 'ambiguous');
        providerAttempts.inc({ provider: transport.name, outcome: failure.kind });
        await withTenant(sql, tenant, async (tx) => {
          await tx`select id from messages where id=${id} for update`;
          await tx`update transport_attempts set status=${failure.kind === 'ambiguous' ? 'ambiguous' : failure.kind === 'transient' ? 'transient_failure' : 'permanent_failure'},diagnostics=${tx.json(toJson(failure.diagnostics))},error=${failure.message.slice(0, 500)},finished_at=now() where id=${attempt.id} and status='started'`;
          if (failure.kind === 'ambiguous')
            await finishFailure(
              tx,
              'Provider outcome is ambiguous; review the attempt before retrying',
            );
          else if (failure.kind === 'permanent')
            await finishFailure(
              tx,
              'Provider definitively rejected this message; automatic failover is prohibited',
            );
          else if (retry < 3)
            await postpone(tx, Math.max(2 ** retry, failure.diagnostics.retry_after_seconds ?? 0));
        });
        unresolvedAttempt = false;
        if (failure.kind !== 'transient' || retry < 3) return;
      }
    }
    await fail('All eligible transports exhausted');
  } catch {
    // A failed persistence operation after network I/O retains its lease.
    // Recovery quarantines the started attempt instead of guessing acceptance.
    if (!unresolvedAttempt) await fail('Delivery preparation failed');
  } finally {
    clearInterval(heartbeat);
  }
}

export async function recoverDeliveries(sql: Sql) {
  // An abandoned request might have been accepted. Never silently resend an uncertain attempt.
  await sql.begin(async (tx) => {
    const stale =
      await tx`select * from messages where claim_id is not null and lease_until<now() for update skip locked limit 100`;
    for (const message of stale) {
      const [uncertain] =
        await tx`select id from transport_attempts where message_id=${message.id} and status in ('started','ambiguous') limit 1`;
      if (uncertain) {
        await tx`update transport_attempts set status='ambiguous',error='Worker lease expired during provider request',finished_at=now() where message_id=${message.id} and status='started'`;
        await tx`update messages set status=case when status in ('queued','scheduled') then 'failed' else status end,delivery_finished_at=now(),claim_id=null,lease_until=null,error='Provider outcome is ambiguous after worker interruption',updated_at=now() where id=${message.id}`;
        await tx`update message_recipients set status='failed' where message_id=${message.id} and status='queued'`;
        await tx`insert into event_outbox(org_id,environment_id,type,data) values(${message.org_id},${message.environment_id},'email.failed',${tx.json(toJson({ email_id: message.id, ambiguous: true }))})`;
      } else await tx`update messages set claim_id=null,lease_until=null where id=${message.id}`;
    }
  });
}
