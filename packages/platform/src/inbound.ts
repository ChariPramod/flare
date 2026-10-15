import { randomUUID } from 'node:crypto';
import { simpleParser } from 'mailparser';
import { z } from 'zod';
import { withTenant, toJson } from '@flare/db';
import type { Sql, Transaction } from '@flare/db';
import { fingerprint, canSend } from '@flare/shared';
import type { Principal } from '@flare/shared';
import { MailError, address, outbox, submitEmails, evidenceFresh } from '@flare/mail';
import type { ObjectStore, PipelineOptions } from '@flare/mail';

export function inboundLimits() {
  const limit = (name: string, fallback: number) => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name}`);
    return value;
  };
  return {
    raw: limit('INBOUND_MIME_LIMIT', 25 * 1024 * 1024),
    attachments: limit('INBOUND_ATTACHMENT_LIMIT', 10 * 1024 * 1024),
    count: limit('INBOUND_ATTACHMENT_COUNT', 100),
    headers: limit('INBOUND_HEADER_LIMIT', 128 * 1024),
  };
}
export const forwardingRuleSchema = z
  .object({
    domain_id: z.string().uuid(),
    recipient: z.string().email().toLowerCase().nullable().default(null),
    sender: z.string().max(998),
    destinations: z.array(z.string().email().toLowerCase()).min(1).max(10),
    enabled: z.boolean().default(true),
  })
  .strict();
export async function validateForwardingRule(tx: Transaction, p: Principal, raw: unknown) {
  const parsed = forwardingRuleSchema.safeParse(raw);
  if (!parsed.success) throw new MailError(422, parsed.error.message);
  const rule = parsed.data;
  const [domain] = await tx`select name from domains where id=${rule.domain_id} and receiving=true`;
  if (!domain || (p.domainId && p.domainId !== rule.domain_id))
    throw new MailError(403, 'Receiving domain is unavailable');
  if (rule.recipient && rule.recipient.split('@')[1] !== domain.name)
    throw new MailError(422, 'Recipient must belong to the receiving domain');
  const [sender] =
    await tx`select id from domains where name=${address(rule.sender).split('@')[1]!} and sending=true and status='verified'`;
  if (!sender || !canSend(p, String(sender.id)))
    throw new MailError(403, 'Forwarding requires a verified sender within key scope');
  if (rule.destinations.some((v) => v.split('@')[1] === domain.name))
    throw new MailError(422, 'Forwarding to the receiving domain would create a loop');
  return rule;
}
export async function acceptInbound(sql: Sql, store: ObjectStore, domainId: string, raw: unknown) {
  const limits = inboundLimits();
  const input = z
    .object({
      id: z.union([z.string().min(1).max(200), z.number().int().nonnegative()]).transform(String),
      rcpt_to: z.string().email().toLowerCase(),
      mail_from: z.union([z.literal(''), z.string().email()]),
      message: z.string().max(Math.ceil(limits.raw / 3) * 4 + Math.ceil(limits.raw / 45) * 2),
      base64: z.literal(true),
      size: z.number().int().nonnegative().max(limits.raw),
    })
    .strict()
    .safeParse(raw);
  if (!input.success) throw new MailError(422, 'Invalid or oversized Postal RawMessage');
  const encoded = input.data.message.replace(/[\r\n]/g, '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
    throw new MailError(422, 'Invalid MIME base64');
  const mime = Buffer.from(encoded, 'base64');
  if (!mime.length || mime.length > limits.raw || mime.length !== input.data.size)
    throw new MailError(422, 'MIME size mismatch');
  const [domain] =
    await sql`select id,org_id,environment_id,name,status,receiving,records,checked_at from domains where id=${domainId}`;
  if (
    !domain ||
    domain.status !== 'verified' ||
    !domain.receiving ||
    !evidenceFresh(domain.checked_at) ||
    !Array.isArray(domain.records) ||
    !domain.records.some(
      (record: { purpose?: string; type?: string; name?: string; status?: string }) =>
        record.purpose === 'receiving' &&
        record.type === 'MX' &&
        record.name === domain.name &&
        record.status === 'verified',
    ) ||
    input.data.rcpt_to.split('@')[1] !== domain.name
  )
    throw new MailError(403, 'Verified receiving domain required');
  const tenant = { orgId: String(domain.org_id), environmentId: String(domain.environment_id) };
  const hash = fingerprint({ mime: encoded, from: input.data.mail_from, to: input.data.rcpt_to });
  let uploaded: string | undefined;
  try {
    return await withTenant(sql, tenant, async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${`${domainId}/inbound/${input.data.id}`},0))`;
      const [existing] =
        await tx`select id,content_hash,status from inbound_messages where domain_id=${domainId} and postal_id=${input.data.id}`;
      if (existing) {
        if (existing.content_hash !== hash)
          throw new MailError(409, 'Postal message ID conflicts with accepted content');
        return { id: String(existing.id), status: String(existing.status), duplicate: true };
      }
      const id = randomUUID();
      uploaded = `${tenant.orgId}/${tenant.environmentId}/inbound/${id}/raw.eml`;
      await store.put(uploaded, mime, 'message/rfc822');
      await tx`insert into inbound_messages(id,org_id,environment_id,domain_id,postal_id,content_hash,mail_from,rcpt_to,raw_key,size) values(${id},${tenant.orgId},${tenant.environmentId},${domainId},${input.data.id},${hash},${input.data.mail_from},${input.data.rcpt_to},${uploaded},${mime.length})`;
      return { id, status: 'pending', duplicate: false };
    });
  } catch (error) {
    if (uploaded) {
      // A lost commit response must not delete an object referenced by a committed receipt.
      const key = uploaded;
      await sql`select id from inbound_messages where raw_key=${key}`
        .then(async (rows) => {
          if (!rows.length) await store.remove(key);
        })
        .catch(() => undefined);
    }
    throw error;
  }
}
export async function parseInbound(sql: Sql, store: ObjectStore, id: string) {
  const [lookup] = await sql`select org_id,environment_id from inbound_messages where id=${id}`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) };
  const uploaded: string[] = [];
  try {
    return await withTenant(sql, tenant, async (tx) => {
      const [row] =
        await tx`select * from inbound_messages where id=${id} and status='pending' and next_attempt_at<=now() for update skip locked`;
      if (!row) return;
      const limits = inboundLimits(),
        mime = await store.get(String(row.raw_key), limits.raw);
      const separator =
        mime.indexOf('\r\n\r\n') >= 0 ? mime.indexOf('\r\n\r\n') : mime.indexOf('\n\n');
      if (separator < 0 || separator > limits.headers)
        throw new MailError(422, 'Missing or oversized MIME headers');
      // Input is byte-bounded; avoid generated HTML, text conversion and inline base64 expansion.
      const parsed = await simpleParser(mime, {
        skipHtmlToText: true,
        skipTextToHtml: true,
        skipImageLinks: true,
      });
      if (
        parsed.attachments.length > limits.count ||
        parsed.attachments.reduce((n, a) => n + a.content.length, 0) > limits.attachments
      )
        throw new MailError(422, 'Inbound attachments exceed configured limits');
      const prefix = `${tenant.orgId}/${tenant.environmentId}/inbound/${id}/${randomUUID()}`;
      for (const [index, file] of parsed.attachments.entries()) {
        const key = `${prefix}/${index}`;
        uploaded.push(key);
        await store.put(key, file.content, file.contentType);
        await tx`insert into inbound_attachments(org_id,environment_id,inbound_id,filename,content_type,size,content_id,object_key) values(${tenant.orgId},${tenant.environmentId},${id},${(file.filename ?? `attachment-${index + 1}`).replace(/[\r\n\0/\\]/g, '_').slice(0, 255)},${file.contentType},${file.content.length},${file.cid ?? null},${key})`;
      }
      const bodyKey = `${prefix}/body.json`;
      const body = {
        html: parsed.html || '',
        text: parsed.text ?? '',
        reply_to:
          parsed.from?.value
            .map((v) => v.address)
            .filter((v): v is string => Boolean(v && z.string().email().safeParse(v).success))
            .slice(0, 1) ?? [],
      };
      uploaded.push(bodyKey);
      await store.put(bodyKey, Buffer.from(JSON.stringify(body)), 'application/json');
      const headers = parsed.headerLines.filter((v) => v.key.toLowerCase() !== 'bcc');
      const subject = (parsed.subject ?? '').replace(/[\r\n\0]/g, ' ').slice(0, 998);
      await tx`update inbound_messages set status='parsed',subject=${subject},headers=${tx.json(toJson(headers))},body_key=${bodyKey},attempts=attempts+1,error=null,parsed_at=now() where id=${id}`;
      await tx`insert into inbound_attempts(org_id,environment_id,inbound_id,ordinal,status) values(${tenant.orgId},${tenant.environmentId},${id},${Number(row.attempts) + 1},'parsed')`;
      await outbox(tx, tenant, 'email.received', {
        inbound_id: id,
        domain_id: row.domain_id,
        from: row.mail_from,
        to: row.rcpt_to,
        subject,
        size: row.size,
        attachment_count: parsed.attachments.length,
      });
      const auto = String(parsed.headers.get('auto-submitted') ?? 'no').toLowerCase();
      const loop = !row.mail_from || parsed.headers.has('x-flare-forwarded') || auto !== 'no';
      const rules =
        await tx`select * from forwarding_rules where domain_id=${row.domain_id} and enabled=true and (recipient is null or recipient=${row.rcpt_to})`;
      for (const rule of rules)
        await tx`insert into inbound_forwards(org_id,environment_id,inbound_id,rule_id,rule,status,error) values(${tenant.orgId},${tenant.environmentId},${id},${rule.id},${tx.json(toJson({ sender: rule.sender, destinations: rule.destinations }))},${loop ? 'skipped' : 'pending'},${loop ? 'Automatic, bounce or previously forwarded message' : null}) on conflict(inbound_id,rule_id) do nothing`;
    });
  } catch (error) {
    await Promise.allSettled(
      uploaded.map(async (key) => {
        const rows =
          await sql`select id from inbound_messages where body_key=${key} union all select id from inbound_attachments where object_key=${key}`;
        if (!rows.length) await store.remove(key);
      }),
    );
    await withTenant(sql, tenant, async (tx) => {
      const [row] =
        await tx`select attempts from inbound_messages where id=${id} and status='pending' for update`;
      if (!row) return;
      const attempts = Number(row.attempts) + 1,
        permanent = error instanceof MailError && error.status < 500;
      const message = permanent ? error.message : 'Inbound parsing or storage failed';
      await tx`insert into inbound_attempts(org_id,environment_id,inbound_id,ordinal,status,error) values(${tenant.orgId},${tenant.environmentId},${id},${attempts},'failed',${message})`;
      await tx`update inbound_messages set attempts=${attempts},status=${permanent || attempts >= 5 ? 'failed' : 'pending'},error=${message},next_attempt_at=now()+${Math.min(3600, 5 * 2 ** attempts)}*interval '1 second' where id=${id}`;
    });
    throw error;
  }
}
export async function forwardInbound(options: PipelineOptions, id: string) {
  const [lookup] =
    await options.sql`select org_id,environment_id from inbound_forwards where id=${id}`;
  if (!lookup) return;
  const tenant = { orgId: String(lookup.org_id), environmentId: String(lookup.environment_id) };
  try {
    await withTenant(options.sql, tenant, async (tx) => {
      const [job] =
        await tx`select * from inbound_forwards where id=${id} and status='pending' and next_attempt_at<=now() for update skip locked`;
      if (!job) return;
      const [rule] = await tx`select enabled from forwarding_rules where id=${job.rule_id}`;
      if (!rule?.enabled) {
        await tx`update inbound_forwards set status='skipped',error='Forwarding rule disabled' where id=${id}`;
        return;
      }
      const [message] = await tx`select * from inbound_messages where id=${job.inbound_id}`;
      const limits = inboundLimits();
      const body = JSON.parse(
        (await options.store.get(String(message!.body_key), limits.raw * 6)).toString(),
      ) as { html: string; text: string; reply_to: string[] };
      const files =
        await tx`select * from inbound_attachments where inbound_id=${job.inbound_id} order by id`;
      const attachments = [];
      for (const file of files)
        attachments.push({
          filename: String(file.filename),
          content_type: String(file.content_type),
          ...(file.content_id ? { content_id: String(file.content_id) } : {}),
          content: (await options.store.get(String(file.object_key), limits.attachments)).toString(
            'base64',
          ),
        });
      const result = await submitEmails(
        options,
        {
          ...tenant,
          actorId: id,
          role: 'developer',
          kind: 'session',
          permission: 'full_access',
          production: false,
        },
        [
          {
            from: job.rule.sender,
            to: job.rule.destinations,
            subject: message!.subject,
            html: body.html,
            text: body.text,
            ...(body.reply_to.length ? { reply_to: body.reply_to } : {}),
            attachments,
            headers: { 'Auto-Submitted': 'auto-generated' },
          },
        ],
        { transaction: tx, forwardedId: id },
      );
      await tx`update inbound_forwards set status='submitted',message_id=${result.data[0]!.id},attempts=attempts+1,error=null where id=${id}`;
    });
  } catch (error) {
    await withTenant(options.sql, tenant, async (tx) => {
      const permanent = error instanceof MailError && error.status < 500;
      await tx`update inbound_forwards set attempts=attempts+1,status=case when ${permanent} or attempts>=4 then 'failed' else 'pending' end,error=${permanent ? error.message.slice(0, 500) : 'Forwarding submission failed'},next_attempt_at=now()+interval '1 minute' where id=${id} and status='pending'`;
    });
    throw error;
  }
}
