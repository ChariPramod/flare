import { z } from 'zod';
import parseMailboxes from 'nodemailer/lib/addressparser/index.js';
import { parseDate } from 'chrono-node';
import { propertyName, propertyValue } from '@flare/shared';

export class MailError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const line = z
  .string()
  .max(998)
  .refine((v) => !/[\r\n\0]/.test(v), 'Header contains a control character');
export function address(value: string): string {
  const match = /^(?:[^<>]*<([^<>\s]+@[^<>\s]+)>|([^<>\s]+@[^<>\s]+))$/.exec(value.trim());
  const parsed = z
    .string()
    .email()
    .safeParse(match?.[1] ?? match?.[2]);
  if (!parsed.success || value.length > 998 || /[\r\n\0]/.test(value))
    throw new MailError(422, 'Invalid email address');
  // Authorization and MIME must interpret the same single mailbox. A regex
  // alone accepts "other@domain, Name <approved@domain>" as the approved sender,
  // while Nodemailer emits two From addresses. Groups are not single mailboxes.
  const mailboxes = parseMailboxes(value);
  const mailbox = mailboxes[0];
  if (
    mailboxes.length !== 1 ||
    !mailbox ||
    !('address' in mailbox) ||
    mailbox.address.toLowerCase() !== parsed.data.toLowerCase()
  )
    throw new MailError(422, 'Supply exactly one email address per mailbox');
  return parsed.data.toLowerCase();
}
const mailbox = line.refine((v) => {
  try {
    address(v);
    return true;
  } catch {
    return false;
  }
}, 'Invalid email address');
const addresses = z
  .union([mailbox, z.array(mailbox).min(1).max(50)])
  .transform((v) => (Array.isArray(v) ? v : [v]));
export const attachmentSchema = z
  .object({
    filename: z.string().min(1).max(255).pipe(line),
    content: z.string().optional(),
    path: z.string().url().optional(),
    content_type: line.optional(),
    content_id: line.optional(),
  })
  .strict()
  .refine(
    (v) => Number(v.content !== undefined) + Number(v.path !== undefined) === 1,
    'Supply content or path',
  );
export const emailSchema = z
  .object({
    from: mailbox,
    traffic_class: z.enum(['transactional', 'marketing']).optional(),
    to: addresses,
    cc: addresses.optional(),
    bcc: addresses.optional(),
    reply_to: addresses.optional(),
    subject: line.optional(),
    template: z
      .object({
        id: z.string().uuid(),
        version: z.number().int().positive().optional(),
        variables: z.record(propertyName, propertyValue).default({}),
      })
      .strict()
      .optional(),
    html: z.string().max(2_000_000).optional(),
    text: z.string().max(2_000_000).optional(),
    headers: z
      .record(line)
      .default({})
      .refine(
        (h) =>
          Object.keys(h).every(
            (k) =>
              /^[A-Za-z0-9-]+$/.test(k) &&
              !/^(from|to|cc|bcc|sender|return-path|received|dkim-signature|message-id|date|mime-version|content-.+|x-flare-.+)$/i.test(
                k,
              ),
          ),
        'Protected or invalid header',
      ),
    attachments: z.array(attachmentSchema).max(50).default([]),
    tags: z
      .array(
        z
          .object({ name: z.string().max(256).pipe(line), value: z.string().max(256).pipe(line) })
          .strict(),
      )
      .max(50)
      .default([]),
    scheduled_at: z.string().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (v) => v.html !== undefined || v.text !== undefined || v.template !== undefined,
    'Supply html, text or a template',
  )
  .refine(
    (v) => v.subject !== undefined || v.template !== undefined,
    'Supply a subject or template',
  )
  .refine(
    (v) => !v.template || (v.html === undefined && v.text === undefined),
    'Do not combine a template with HTML/text',
  )
  .refine(
    (v) => v.to.length + (v.cc?.length ?? 0) + (v.bcc?.length ?? 0) <= 50,
    'Maximum 50 envelope recipients',
  );
export type EmailInput = z.infer<typeof emailSchema>;
export function schedule(value: string | undefined, now = new Date()): Date {
  if (!value) return now;
  // Require an explicit offset for ISO timestamps; natural language is evaluated in UTC once.
  const date = /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? /([zZ]|[+-]\d{2}:\d{2})$/.test(value)
      ? new Date(value)
      : null
    : parseDate(value, { instant: now, timezone: 0 }, { forwardDate: true });
  if (
    !date ||
    !Number.isFinite(date.getTime()) ||
    date <= now ||
    date.getTime() > now.getTime() + 30 * 86400_000
  )
    throw new MailError(
      422,
      'Schedule must be in the next 30 days; ISO timestamps need a timezone',
    );
  return date;
}
export function recipients(input: EmailInput) {
  const seen = new Set<string>();
  return (['to', 'cc', 'bcc'] as const).flatMap((kind) =>
    (input[kind] ?? []).flatMap((v) => {
      const email = address(v);
      if (seen.has(email)) return [];
      seen.add(email);
      return [{ address: email, kind }];
    }),
  );
}
export type MailState =
  | 'queued'
  | 'held'
  | 'scheduled'
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'failed'
  | 'suppressed'
  | 'canceled';
const transitions: Record<MailState, readonly MailState[]> = {
  queued: ['held', 'sent', 'failed', 'suppressed', 'canceled', 'scheduled'],
  scheduled: ['held', 'queued', 'sent', 'failed', 'suppressed', 'canceled'],
  held: ['queued', 'scheduled', 'sent', 'failed', 'suppressed', 'canceled'],
  sent: ['delivered', 'delivery_delayed', 'bounced', 'complained', 'failed'],
  delivery_delayed: ['delivered', 'bounced', 'complained', 'failed'],
  delivered: ['bounced', 'complained'],
  bounced: ['complained'],
  complained: [],
  failed: [],
  suppressed: [],
  canceled: [],
};
export function canTransition(from: MailState, to: MailState) {
  return transitions[from]?.includes(to) ?? false;
}
export const mailLimits = () => ({
  attachments: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024)
    .parse(process.env.MAIL_ATTACHMENT_MAX_BYTES),
  mime: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024)
    .parse(process.env.MAIL_MIME_MAX_BYTES),
});
