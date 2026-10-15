import { providerAttempts } from '@flare/shared';
import { randomUUID } from 'node:crypto';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { mailLimits } from './validation.js';
import { outbox } from './pipeline.js';
import type { PipelineOptions } from './pipeline.js';
import { TransportError } from './transports.js';
import { prepareDispatchPolicy } from './dispatch-policy.js';
import { lockSendingPolicy, releaseUnusedQuota, SendingPolicyError } from './sending-policy.js';
import { routeForDelivery } from './routes.js';
import { sendingReadiness } from './readiness-gate.js';

export async function deliverEmail(options: PipelineOptions, id: string) {
  const claim = randomUUID();
  const { sql } = options;
  const [message] =
    await sql`update messages set claim_id=${claim},lease_until=now()+interval '2 minutes',updated_at=now() where id=${id} and delivery_finished_at is null and status not in ('canceled','suppressed','failed') and scheduled_at<=now() and next_attempt_at<=now() and claim_id is null returning *`;
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
    await lockSendingPolicy(tx, tenant.orgId);
    const rows =
      await tx`update messages set status=case when status in ('queued','scheduled','held') then 'failed' else status end,delivery_finished_at=now(),error=${error},claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim} returning id`;
    if (rows.length) {
      await tx`update message_recipients set status='failed' where message_id=${id} and status='queued'`;
      await releaseUnusedQuota(tx, tenant, id);
      await outbox(tx, tenant, 'email.failed', { email_id: id, error });
    }
  };
  const fail = (error: string) => withTenant(sql, tenant, (tx) => finishFailure(tx, error));
  const postpone = async (tx: Transaction, seconds: number) => {
    await tx`update messages set next_attempt_at=now()+${seconds}*interval '1 second',claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim}`;
  };
  const hold = async (tx: Transaction, reason: string, seconds = 60) => {
    const rows =
      await tx`update messages set status='held',hold_reason=${reason},next_attempt_at=now()+${seconds}*interval '1 second',claim_id=null,lease_until=null,updated_at=now() where id=${id} and claim_id=${claim} returning id`;
    if (rows.length && message.hold_reason !== reason)
      await outbox(tx, tenant, 'email.held', { email_id: id, reason });
  };
  let unresolvedAttempt = false;
  try {
    const sandboxAuthorized =
      options.transports.length > 0 &&
      options.transports.every((transport) => transport.sandbox === true);
    if (message.sandbox && !sandboxAuthorized) {
      await withTenant(sql, tenant, (tx) => hold(tx, 'sandbox_transport_required'));
      return;
    }
    const transports = message.sandbox
      ? options.transports
      : await routeForDelivery(sql, message.route_snapshot, options.transports);
    const raw = await options.store.get(String(message.mime_key), mailLimits().mime);
    let ordinal = Number(
      (await sql`select count(*)::int as n from transport_attempts where message_id=${id}`)[0]!.n,
    );
    let deferredReason: string | undefined;
    for (const transport of transports) {
      const instanceId = transport.instance?.id ?? transport.name;
      const previous =
        await sql`select status,diagnostics from transport_attempts where message_id=${id} and instance_id=${instanceId} and retry_cycle=${message.redrives} order by ordinal`;
      if (
        previous.some(
          (attempt) =>
            ['started', 'ambiguous'].includes(String(attempt.status)) ||
            (attempt.status === 'permanent_failure' && !attempt.diagnostics?.recipient_scoped),
        )
      ) {
        await fail('Previous transport outcome prohibits automatic retry');
        return;
      }
      const lastProgress = previous.map((attempt) => attempt.status).lastIndexOf('accepted');
      const retry = previous
        .slice(lastProgress + 1)
        .filter((attempt) => attempt.status === 'transient_failure').length;
      if (retry >= 4) continue;
      if (leaseLost) return;
      const [domain] =
        await sql`select * from domains where id=${message.domain_id} and org_id=${tenant.orgId} and environment_id=${tenant.environmentId}`;
      if (!domain || domain.status !== 'verified' || !domain.sending) {
        await withTenant(sql, tenant, (tx) => hold(tx, 'domain_unverified'));
        return;
      }
      if (domain.enforce_tls) {
        try {
          if (!(await transport.supportsRequiredTls())) {
            deferredReason = 'required_tls_unavailable';
            continue;
          }
        } catch {
          deferredReason = 'required_tls_unavailable';
          continue;
        }
      }
      if (!message.sandbox && !(await sendingReadiness(sql, tenant, domain, transport)).ready) {
        deferredReason = 'sender_not_ready';
        continue;
      }
      let to = await withTenant(sql, tenant, async (tx) => {
        await lockSendingPolicy(tx, tenant.orgId);
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
        await releaseUnusedQuota(tx, tenant, id);
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
      const attempt = await withTenant(sql, tenant, async (tx) => {
        await lockSendingPolicy(tx, tenant.orgId);
        const [current] =
          await tx`select * from messages where id=${id} and claim_id=${claim} and lease_until>now() and status not in ('canceled','failed','suppressed') for update`;
        if (!current) return null;
        const [currentDomain] =
          await tx`select * from domains where id=${current.domain_id} for share`;
        if (!currentDomain || currentDomain.status !== 'verified' || !currentDomain.sending) {
          await hold(tx, 'domain_unverified');
          return null;
        }
        if (!current.sandbox) {
          await tx`select pg_advisory_xact_lock_shared(hashtextextended('mail-route-registry',0))`;
          await routeForDelivery(tx, current.route_snapshot, options.transports);
          const readiness = await sendingReadiness(tx, tenant, currentDomain, transport);
          if (!readiness.ready) {
            await hold(tx, readiness.blockers[0] ?? 'sender_not_ready');
            return null;
          }
        }
        if (currentDomain.enforce_tls && !(await transport.supportsRequiredTls())) {
          await hold(tx, 'required_tls_unavailable');
          return null;
        }
        // Audience changes use the same contact lock as preference updates. The
        // attempt commit is the boundary after which a send cannot be recalled.
        if (current.contact_id) {
          const [contact] =
            await tx`select unsubscribed,deleted_at from contacts where id=${current.contact_id} for share`;
          const [topic] =
            await tx`select coalesce(p.enabled,t.default_opt_in,true) as enabled from audience_topics t left join contact_topic_preferences p on p.topic_id=t.id and p.contact_id=${current.contact_id} where t.id=${current.audience_topic_id}`;
          const [broadcast] = current.broadcast_id
            ? await tx`select status from broadcasts where id=${current.broadcast_id} for share`
            : [];
          const [automation] = current.automation_run_id
            ? await tx`select status from automation_runs where id=${current.automation_run_id} for share`
            : [];
          if (
            !contact ||
            contact.unsubscribed ||
            contact.deleted_at ||
            topic?.enabled === false ||
            broadcast?.status === 'canceled' ||
            automation?.status === 'canceled'
          ) {
            const suppressed =
              await tx`update message_recipients set status='suppressed' where message_id=${id} and status='queued' returning address`;
            for (const row of suppressed)
              await outbox(tx, tenant, 'email.suppressed', {
                email_id: id,
                recipient: row.address,
                reason: 'Audience preference or campaign cancellation',
              });
          }
        }
        const policy = await prepareDispatchPolicy(
          tx,
          tenant,
          {
            id,
            sandbox: Boolean(current.sandbox),
            traffic_class: current.traffic_class,
            submitting_key_id: current.submitting_key_id,
            route_snapshot: current.route_snapshot,
          },
          to,
          { sandboxAuthorized },
        );
        if (policy.holdReason) {
          await hold(tx, policy.holdReason, policy.retryAfter);
          return null;
        }
        to = policy.recipients;
        if (!to.length) {
          await postpone(tx, 1);
          return null;
        }
        const [created] =
          await tx`insert into transport_attempts(org_id,environment_id,message_id,provider,instance_id,ordinal,status,recipients,retry_cycle) values(${tenant.orgId},${tenant.environmentId},${id},${transport.name},${instanceId},${++ordinal},'started',${tx.json(to)},${message.redrives}) returning id`;
        await tx`update messages set delivery_started_at=coalesce(delivery_started_at,now()),status=case when status='held' then 'queued' else status end,hold_reason=null where id=${id}`;
        return { id: String(created!.id), requireTls: Boolean(currentDomain.enforce_tls) };
      });
      if (!attempt) return;
      unresolvedAttempt = true;
      try {
        const result = await transport.send({
          raw,
          from: String(message.envelope_from),
          to,
          requireTls: attempt.requireTls,
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
          await tx`update transport_attempts set status=${result.accepted.length ? 'accepted' : result.retryableRejected?.length ? 'transient_failure' : 'permanent_failure'},provider_ids=${tx.json(result.ids)},diagnostics=${tx.json(toJson({ ...result.diagnostics, recipient_scoped: true }))},finished_at=now() where id=${attempt.id} and status='started'`;
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
            const states = (
              await tx`select status from message_recipients where message_id=${id}`
            ).map((row) => String(row.status));
            const aggregate =
              ['complained', 'bounced', 'delivery_delayed', 'sent', 'delivered', 'failed'].find(
                (state) => states.includes(state),
              ) ?? 'suppressed';
            await tx`update messages set status=${aggregate},updated_at=now() where id=${id}`;
            await tx`update messages set delivery_finished_at=now(),claim_id=null,lease_until=null where id=${id} and claim_id=${claim}`;
          }
          if (remaining.length)
            await postpone(
              tx,
              result.accepted.length || !result.retryableRejected?.length ? 1 : 2 ** retry,
            );
          return remaining.length > 0;
        });
        unresolvedAttempt = false;
        if (!pending || result.accepted.length || !result.retryableRejected?.length || retry < 3)
          return;
        // Four definitive refusals allow only still-queued recipients to use
        // the next eligible transport. Accepted recipients are never replayed.
      } catch (error) {
        const failure =
          error instanceof TransportError
            ? error
            : new TransportError('Unknown transport outcome', 'ambiguous');
        providerAttempts.inc({ provider: transport.name, outcome: failure.kind });
        await withTenant(sql, tenant, async (tx) => {
          await lockSendingPolicy(tx, tenant.orgId);
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
    if (deferredReason) await withTenant(sql, tenant, (tx) => hold(tx, deferredReason!));
    else if (
      !message.sandbox &&
      transports.length &&
      !(
        await Promise.all(
          transports.map(async (transport) => {
            const [domain] = await sql`select * from domains where id=${message.domain_id}`;
            return domain && (await sendingReadiness(sql, tenant, domain, transport)).ready;
          }),
        )
      ).some(Boolean)
    )
      await withTenant(sql, tenant, (tx) => hold(tx, 'sender_not_ready'));
    else await fail('All eligible transports exhausted');
  } catch (error) {
    // A failed persistence operation after network I/O retains its lease.
    // Recovery quarantines the started attempt instead of guessing acceptance.
    if (!unresolvedAttempt) {
      if (error instanceof SendingPolicyError)
        await withTenant(sql, tenant, (tx) => hold(tx, error.code, error.retryAfter));
      else await fail('Delivery preparation failed');
    }
  } finally {
    clearInterval(heartbeat);
  }
}

export async function recoverDeliveries(sql: Sql) {
  // An abandoned request might have been accepted. Never silently resend an uncertain attempt.
  const stale =
    await sql`select id,org_id,environment_id from messages where claim_id is not null and lease_until<now() order by lease_until limit 100`;
  for (const candidate of stale) {
    const tenant = {
      orgId: String(candidate.org_id),
      environmentId: String(candidate.environment_id),
    };
    await withTenant(sql, tenant, async (tx) => {
      await lockSendingPolicy(tx, tenant.orgId);
      const [message] =
        await tx`select * from messages where id=${candidate.id} and claim_id is not null and lease_until<now() for update skip locked`;
      if (!message) return;
      const [uncertain] =
        await tx`select id from transport_attempts where message_id=${message.id} and status in ('started','ambiguous') limit 1`;
      if (uncertain) {
        await tx`update transport_attempts set status='ambiguous',error='Worker lease expired during provider request',finished_at=now() where message_id=${message.id} and status='started'`;
        await tx`update messages set status=case when status in ('queued','scheduled','held') then 'failed' else status end,delivery_finished_at=now(),claim_id=null,lease_until=null,error='Provider outcome is ambiguous after worker interruption',updated_at=now() where id=${message.id}`;
        await tx`update message_recipients set status='failed' where message_id=${message.id} and status='queued'`;
        await releaseUnusedQuota(tx, tenant, String(message.id));
        await tx`insert into event_outbox(org_id,environment_id,type,data) values(${message.org_id},${message.environment_id},'email.failed',${tx.json(toJson({ email_id: message.id, ambiguous: true }))})`;
      } else await tx`update messages set claim_id=null,lease_until=null where id=${message.id}`;
    });
  }
}
