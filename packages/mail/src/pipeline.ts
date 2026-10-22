import { correlation } from '@flare/shared';
import { randomUUID } from 'node:crypto';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { canSend, decrypt, fingerprint } from '@flare/shared';
import type { Principal, Tenant } from '@flare/shared';
import { z } from 'zod';
import { emailSchema, MailError, address, recipients, schedule } from './validation.js';
import type { EmailInput } from './validation.js';
import { putManagedObject } from './object-uploads.js';
import { resolveEmailTemplate } from './templates.js';
import { buildMime } from './mime.js';
import type { ObjectStore } from './storage.js';
import type { TransportAdapter } from './transports.js';
import {
  lockSendingPolicy,
  sendingAdmission,
  reserveSendingQuota,
  releaseUnusedQuota,
  SendingPolicyError,
} from './sending-policy.js';
import { resolveMailRoute } from './routes.js';
import { sendingReadiness } from './readiness-gate.js';

export interface PipelineOptions {
  sql: Sql;
  store: ObjectStore;
  encryptionKey: string;
  trackingKey: string;
  transports: TransportAdapter[];
}
export async function outbox(tx: Transaction, tenant: Tenant, type: string, data: unknown) {
  await tx`insert into event_outbox(org_id,environment_id,type,data) values(${tenant.orgId},${tenant.environmentId},${type},${tx.json(toJson(data))})`;
}
export async function requiredTls(transports: TransportAdapter[]) {
  const checks = await Promise.all(
    transports.map(async (t) => {
      try {
        return await t.supportsRequiredTls();
      } catch {
        return false;
      }
    }),
  );
  return checks.some(Boolean);
}
export async function submitEmails(
  options: PipelineOptions,
  p: Principal,
  requests: unknown[],
  settings: {
    key?: string;
    mode?: 'strict' | 'permissive';
    batch?: boolean;
    transaction?: Transaction;
    campaign?: {
      broadcastId?: string;
      automationRunId?: string;
      contactId: string;
      topicId: string | null;
    };
    forwardedId?: string;
    smtpHeaders?: { to: string[]; cc: string[] };
  } = {},
) {
  if (requests.length < 1 || requests.length > 100)
    throw new MailError(422, 'Supply between 1 and 100 emails');
  if (p.role === 'viewer') throw new MailError(403, 'Sending is not permitted');
  if (settings.key !== undefined && !z.string().min(1).max(256).safeParse(settings.key).success)
    throw new MailError(422, 'Idempotency keys must be 1–256 characters');
  const parsed = requests.map((value) => emailSchema.safeParse(value));
  const invalid = parsed.findIndex((v) => !v.success);
  if (invalid !== -1 && settings.mode !== 'permissive')
    throw new MailError(422, `Email ${invalid}: ${parsed[invalid]!.error!.message}`);
  // Hash validated input before interpreting relative dates or downloading URLs.
  const hash = fingerprint({
    emails: parsed.map((v, i) => (v.success ? v.data : requests[i])),
    mode: settings.mode ?? 'strict',
  });
  const operation = settings.batch ? 'mail.batch' : 'mail.send';
  const run = async (tx: Transaction) => {
    // Match operator/campaign/dispatch lock order, including idempotent admissions.
    await lockSendingPolicy(tx, p.orgId);
    if (settings.key) {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${p.orgId}/${p.environmentId}/${operation}/${settings.key}`},0))`;
      await tx`delete from idempotency where operation=${operation} and key=${settings.key} and expires_at<=now()`;
      const [existing] =
        await tx`select body_hash,response from idempotency where operation=${operation} and key=${settings.key}`;
      if (existing) {
        if (existing.body_hash !== hash)
          throw new MailError(409, 'Idempotency key was used with a different request');
        // A domain-scoped key cannot obtain another domain's cached response.
        if (p.domainId)
          for (const value of parsed)
            if (value.success) {
              const [domain] =
                await tx`select id from domains where name=${address(value.data.from).split('@')[1]!}`;
              if (!domain || domain.id !== p.domainId)
                throw new MailError(403, 'API key is scoped to another domain');
            }
        return existing.response as {
          data: { id: string }[];
          errors: { index: number; message: string }[];
        };
      }
    }
    const data: { id: string }[] = [];
    const errors: { index: number; message: string }[] = [];
    const now = new Date();
    // PostgreSQL savepoints keep permissive failures from poisoning the surrounding transaction.
    for (const [index, value] of parsed.entries()) {
      if (!value.success) {
        errors.push({ index, message: value.error.message });
        continue;
      }
      const accept = async (db: Transaction) => {
        const input = await resolveEmailTemplate(db, value.data);
        const { domain, sandbox, admission, route } = await authorizeMailSender(
          db,
          p,
          input,
          options.transports,
          Boolean(settings.campaign?.broadcastId),
        );
        const at = schedule(input.scheduled_at, now);
        const id = randomUUID();
        const envelope = recipients(input);
        const suppressed =
          await db`select address from suppressions where address in ${db(envelope.map((v) => v.address))}`;
        const blocked = new Set(suppressed.map((v) => String(v.address)));
        const status = envelope.every((v) => blocked.has(v.address))
          ? 'suppressed'
          : input.scheduled_at
            ? 'scheduled'
            : 'queued';
        let mimeKey: string | null = null;
        const metadata: Record<string, unknown>[] = [];
        if (status !== 'suppressed') {
          const mimeInput = settings.forwardedId
            ? {
                ...input,
                headers: { ...input.headers, 'X-Flare-Forwarded': settings.forwardedId },
              }
            : input;
          const built = await buildMime(
            settings.smtpHeaders
              ? { ...mimeInput, to: settings.smtpHeaders.to, cc: settings.smtpHeaders.cc }
              : mimeInput,
            id,
            {
              name: String(domain.name),
              dkim_selector: String(domain.dkim_selector),
              privateKey: decrypt(
                String(domain.dkim_private_cipher),
                options.encryptionKey,
                `${p.orgId}/${p.environmentId}`,
              ),
              open_tracking: Boolean(domain.open_tracking),
              click_tracking: Boolean(domain.click_tracking),
              trackingUrl: `https://${domain.tracking_subdomain}.${domain.name}`,
            },
            options.trackingKey,
          );
          const prefix = `${p.orgId}/${p.environmentId}/${id}`;
          for (const [fileIndex, file] of built.files.entries()) {
            const objectKey = `${prefix}/attachments/${fileIndex}`;
            await putManagedObject(
              options.sql,
              db,
              options.store,
              p,
              objectKey,
              file.content,
              file.contentType ?? 'application/octet-stream',
            );
            metadata.push({
              filename: file.filename,
              content_type: file.contentType,
              size: file.content.length,
              key: objectKey,
            });
          }
          mimeKey = `${prefix}/message.eml`;
          await putManagedObject(
            options.sql,
            db,
            options.store,
            p,
            mimeKey,
            built.raw,
            'message/rfc822',
          );
        }
        const stored = { ...input, attachments: metadata };
        await db`insert into messages(id,org_id,environment_id,domain_id,request,mime_key,envelope_from,status,scheduled_at,request_id,traceparent) values(${id},${p.orgId},${p.environmentId},${domain.id},${db.json(toJson(stored))},${mimeKey},${address(input.from)},${status},${at},${correlation()?.requestId ?? null},${correlation()?.traceparent ?? null})`;
        if (settings.campaign)
          await db`update messages set broadcast_id=${settings.campaign.broadcastId ?? null},automation_run_id=${settings.campaign.automationRunId ?? null},contact_id=${settings.campaign.contactId},audience_topic_id=${settings.campaign.topicId} where id=${id}`;
        for (const recipient of envelope) {
          const recipientStatus = blocked.has(recipient.address) ? 'suppressed' : 'queued';
          await db`insert into message_recipients(org_id,environment_id,message_id,address,kind,status) values(${p.orgId},${p.environmentId},${id},${recipient.address},${recipient.kind},${recipientStatus})`;
          if (recipientStatus === 'suppressed')
            await outbox(db, p, 'email.suppressed', {
              email_id: id,
              recipient: recipient.address,
            });
        }
        await db`update messages set sandbox=${sandbox},traffic_class=${admission?.trafficClass ?? (settings.campaign?.broadcastId ? 'marketing' : (input.traffic_class ?? null))},policy_revision=${admission?.policy.revision ?? null},submitting_key_id=${!sandbox && p.kind === 'api_key' ? p.actorId : null},route_snapshot=${route ? db.json(toJson(route)) : null},route_id=${route?.id ?? null},route_revision=${route?.revision ?? null} where id=${id}`;
        if (admission && status === 'queued')
          await reserveSendingQuota(
            db,
            p,
            id,
            envelope
              .filter((recipient) => !blocked.has(recipient.address))
              .map((recipient) => recipient.address),
            Number(admission.policy.daily_limit),
          );
        await outbox(db, p, status === 'scheduled' ? 'email.scheduled' : 'email.queued', {
          email_id: id,
          status,
          scheduled_at: at.toISOString(),
        });
        return { id };
      };
      if (settings.mode === 'permissive') {
        try {
          data.push((await tx.savepoint(accept)) as { id: string });
        } catch (error) {
          // Infrastructure failures abort the whole batch, preserving retry semantics.
          if (!(error instanceof MailError)) throw error;
          errors.push({ index, message: error.message });
        }
      } else data.push(await accept(tx));
    }
    const response = { data, errors };
    if (settings.key)
      await tx`insert into idempotency(org_id,environment_id,operation,key,body_hash,response) values(${p.orgId},${p.environmentId},${operation},${settings.key},${hash},${tx.json(toJson(response))})`;
    return response;
  };
  return await (settings.transaction ? run(settings.transaction) : withTenant(options.sql, p, run));
}

/** Shared admission checks for delivery and read-only campaign preflight. */
export async function authorizeMailSender(
  db: Transaction,
  p: Principal,
  input: Pick<EmailInput, 'from' | 'traffic_class'>,
  transports: TransportAdapter[],
  marketingSource = false,
) {
  const domain = await sender(db, p, input, transports);
  const sandbox =
    transports.length > 0 && transports.every((transport) => transport.sandbox === true);
  const admission = sandbox
    ? null
    : await sendingAdmission(db, p, input.traffic_class, marketingSource);
  const route = admission
    ? await resolveMailRoute(
        db,
        {
          trust_tier: admission.policy.trust_tier,
          route_bindings: admission.policy.route_bindings,
        },
        admission.trafficClass,
        admission.critical,
        transports,
      )
    : null;
  if (route) {
    let ready = false;
    let tlsReady = !domain.enforce_tls;
    for (const instance of route.instances) {
      const transport = transports.find((candidate) => candidate.instance?.id === instance.id)!;
      if (domain.enforce_tls && !(await requiredTls([transport]))) continue;
      tlsReady = true;
      if ((await sendingReadiness(db, p, domain, transport)).ready) ready = true;
    }
    if (!ready)
      throw new SendingPolicyError(
        403,
        tlsReady ? 'sender_not_ready' : 'required_tls_unavailable',
        tlsReady
          ? 'No approved route has fresh sender authentication evidence'
          : 'No approved route can currently honor this domain’s delivery requirements',
      );
  }
  return { domain, sandbox, admission, route };
}

async function sender(
  tx: Transaction,
  p: Principal,
  input: Pick<EmailInput, 'from'>,
  transports: TransportAdapter[],
) {
  const name = address(input.from).split('@')[1]!;
  const [environment] =
    await tx`select name from environments where id=${p.environmentId} and org_id=${p.orgId}`;
  if (!environment) throw new MailError(403, 'Sending environment is unavailable');
  const [domain] = await tx`select * from domains where name=${name} for share`;
  if (!domain) throw new MailError(403, `Sender domain ${name} is not verified for sending`);
  if (!canSend(p, String(domain.id)))
    throw new MailError(403, 'API key is scoped to another domain');
  // Existing sender eligibility can recover after DNS drift or configuration
  // repair. Durable campaigns must pause instead of discarding their audience.
  if (domain.status !== 'verified' || !domain.sending)
    throw new SendingPolicyError(
      403,
      'domain_unverified',
      `Sender domain ${name} is not verified for sending`,
    );
  if (!transports.length)
    throw new MailError(
      422,
      'No configured transport can honor this domain’s delivery requirements',
    );
  if (domain.enforce_tls && !(await requiredTls(transports)))
    throw new SendingPolicyError(
      403,
      'required_tls_unavailable',
      'No configured transport can currently honor this domain’s delivery requirements',
    );
  return domain;
}
export async function changeSchedule(sql: Sql, p: Principal, id: string, value: string | null) {
  return withTenant(sql, p, async (tx) => {
    await lockSendingPolicy(tx, p.orgId);
    const [message] = await tx`select * from messages where id=${id} for update`;
    if (!message || !canSend(p, String(message.domain_id)))
      throw new MailError(404, 'Email not found');
    if (
      !['queued', 'scheduled', 'held'].includes(String(message.status)) ||
      message.delivery_started_at
    )
      throw new MailError(409, 'Delivery has started or the email is terminal');
    const at = value === null ? null : schedule(value);
    await tx`update messages set status=${at ? 'scheduled' : 'canceled'},scheduled_at=coalesce(${at},scheduled_at),claim_id=null,lease_until=null,hold_reason=null,next_attempt_at=coalesce(${at},now()),updated_at=now() where id=${id}`;
    if (!at)
      await tx`update message_recipients set status='canceled' where message_id=${id} and status='queued'`;
    if (at)
      await tx`update sending_quota set state='released' where org_id=${p.orgId} and message_id=${id} and state='reserved'`;
    else await releaseUnusedQuota(tx, p, id);
    await outbox(tx, p, at ? 'email.scheduled' : 'email.canceled', {
      email_id: id,
      scheduled_at: at?.toISOString(),
    });
    return { id, status: at ? 'scheduled' : 'canceled' };
  });
}
