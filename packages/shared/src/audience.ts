import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
export const propertyValue = z.union([
  z.string().max(4000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);
export const propertyName = z
  .string()
  .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
  .refine(
    (v) => !['constructor', 'prototype', '__proto__', 'FLARE_UNSUBSCRIBE_URL'].includes(v),
    'Reserved property name',
  );
export const contactSchema = z
  .object({
    email: z.string().email().toLowerCase(),
    first_name: z.string().max(120).default(''),
    last_name: z.string().max(120).default(''),
    properties: z.record(propertyName, propertyValue).default({}),
    unsubscribed: z.boolean().optional(),
  })
  .strict();
export const propertySchema = z
  .object({
    name: propertyName,
    type: z.enum(['string', 'number', 'boolean', 'date']),
    fallback: propertyValue.optional(),
  })
  .strict();
export const segmentSchema = z
  .object({
    mode: z.enum(['all', 'any']).default('all'),
    rules: z
      .array(
        z
          .object({
            field: z
              .string()
              .regex(
                /^(email|first_name|last_name|unsubscribed|properties\.[a-zA-Z][a-zA-Z0-9_]{0,63})$/,
              ),
            op: z.enum(['eq', 'neq', 'contains', 'gt', 'lt', 'exists']),
            value: propertyValue.optional(),
          })
          .strict()
          .refine((v) => v.op === 'exists' || v.value !== undefined, 'Comparison value is required')
          .refine(
            (v) => !['gt', 'lt'].includes(v.op) || typeof v.value === 'number',
            'Numeric comparisons require a number',
          )
          .refine(
            (v) => v.op !== 'contains' || typeof v.value === 'string',
            'Contains requires text',
          ),
      )
      .max(20),
  })
  .strict();
export type Segment = z.infer<typeof segmentSchema>;
export const templateSchema = z
  .object({
    subject: z
      .string()
      .min(1)
      .max(998)
      .refine((v) => !/[\r\n\0]/.test(v), 'Invalid subject'),
    html: z.string().min(1).max(500000),
    text: z.string().max(500000).optional(),
    variables: z.record(propertyName, propertyValue).default({}),
  })
  .strict();
export function propertyValid(type: string, value: unknown) {
  if (value === null || value === undefined) return true;
  if (type === 'date')
    return (
      typeof value === 'string' &&
      (z.string().date().safeParse(value).success ||
        z.string().datetime({ offset: true }).safeParse(value).success)
    );
  return typeof value === type && (type !== 'number' || Number.isFinite(value));
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
// Deliberately data-only interpolation: no eval, helpers, expressions, partials or arbitrary raw HTML.
export function renderText(source: string, values: Record<string, unknown>, html = false) {
  const rendered = source.replace(
    /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g,
    (_match, raw: string | undefined, escaped: string | undefined) => {
      const name = (raw ?? escaped)!.trim();
      if (
        !/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)*$/.test(name) ||
        name.split('.').some((p) => ['constructor', 'prototype', '__proto__'].includes(p))
      )
        throw new Error('Invalid template variable');
      if (raw && name !== 'FLARE_UNSUBSCRIBE_URL')
        throw new Error('Only FLARE_UNSUBSCRIBE_URL supports triple braces');
      let value: unknown = values;
      for (const part of name.split('.'))
        value =
          value && typeof value === 'object' && Object.hasOwn(value, part)
            ? (value as Record<string, unknown>)[part]
            : undefined;
      if (
        value !== null &&
        value !== undefined &&
        !['string', 'number', 'boolean'].includes(typeof value)
      )
        throw new Error(`Template variable ${name} must be scalar`);
      const text = String(value ?? '');
      if (raw && text && !/^https?:\/\//.test(text))
        throw new Error('Unsubscribe URL must use HTTP(S)');
      return html ? escapeHtml(text) : text;
    },
  );
  if (rendered.length > 2000000) throw new Error('Rendered template exceeds size limit');
  return rendered;
}
export function validateTemplate(source: z.infer<typeof templateSchema>) {
  for (const text of [source.subject, source.html, source.text ?? '']) {
    renderText(text, {});
    const rest = text.replace(/\{\{\{\s*[^{}]+?\s*\}\}\}|\{\{\s*[^{}]+?\s*\}\}/g, '');
    if (/[{}]{2}/.test(rest)) throw new Error('Unsupported template syntax');
  }
  return source;
}
const preferenceIdentity = z
  .object({
    orgId: z.string().uuid(),
    environmentId: z.string().uuid(),
    contactId: z.string().uuid(),
    exp: z.number().int(),
  })
  .strict();
export function preferenceToken(data: z.infer<typeof preferenceIdentity>, key: string) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(`flare-preferences-v1.${body}`).digest('base64url')}`;
}
export function verifyPreferenceToken(token: string, key: string, now = Date.now()) {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra || token.length > 1500) throw new Error('Invalid preference link');
  const expected = createHmac('sha256', key).update(`flare-preferences-v1.${body}`).digest(),
    actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error('Invalid preference link');
  const data = preferenceIdentity.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
  if (data.exp * 1000 < now) throw new Error('Preference link expired');
  return data;
}
export function parseCsv(source: string) {
  if (Buffer.byteLength(source) > 2 * 1024 * 1024) throw new Error('CSV exceeds 2 MiB');
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"' && !field && !closed) quoted = true;
    else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && source[i + 1] === '\n') i++;
        if (row.some((v) => v !== '')) rows.push(row);
        row = [];
      }
    } else {
      if (closed || c === '"') throw new Error('Malformed quoted CSV field');
      field += c;
    }
    if (field.length > 4000 || row.length > 100 || rows.length > 5000)
      throw new Error('CSV limit exceeded (5000 contacts, 100 columns, 4000 characters per cell)');
  }
  if (quoted) throw new Error('Unterminated CSV quote');
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  const headers = rows.shift()?.map((v, i) => (i === 0 ? v.replace(/^\uFEFF/, '') : v)) ?? [];
  if (
    !headers.length ||
    new Set(headers).size !== headers.length ||
    rows.some((r) => r.length !== headers.length)
  )
    throw new Error('CSV headers or row widths are invalid');
  if (rows.length > 5000) throw new Error('At most 5000 contacts per import');
  return { headers, rows };
}
