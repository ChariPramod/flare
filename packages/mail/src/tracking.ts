import { createHmac, timingSafeEqual } from 'node:crypto';
import { load } from 'cheerio';
import { z } from 'zod';
import { MailError } from './validation.js';

const tokenSchema = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(['open', 'click']),
    url: z.string().url().optional(),
    exp: z.number().int(),
  })
  .strict();
export type TrackingToken = z.infer<typeof tokenSchema>;
function mac(body: string, key: string) {
  return createHmac('sha256', key).update(`flare-tracking-v1.${body}`).digest();
}
export function signTracking(data: TrackingToken, key: string) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${body}.${mac(body, key).toString('base64url')}`;
}
export function verifyTracking(token: string, key: string, now = Date.now()): TrackingToken {
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra || token.length > 12000)
    throw new MailError(400, 'Invalid tracking token');
  const received = Buffer.from(sig, 'base64url');
  const expected = mac(body, key);
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new MailError(400, 'Invalid tracking signature');
  let parsed: TrackingToken;
  try {
    parsed = tokenSchema.parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
  } catch {
    throw new MailError(400, 'Invalid tracking token');
  }
  if (
    parsed.exp * 1000 < now ||
    (parsed.kind === 'click' && (!parsed.url || !/^https?:$/.test(new URL(parsed.url).protocol)))
  )
    throw new MailError(400, 'Invalid or expired tracking token');
  return parsed;
}
export function trackHtml(
  html: string,
  options: {
    id: string;
    open: boolean;
    click: boolean;
    baseUrl: string;
    key: string;
    now?: number;
  },
) {
  if (!options.open && !options.click) return html;
  const $ = load(html, { xml: false }, false);
  const exp = Math.floor((options.now ?? Date.now()) / 1000) + 90 * 86400;
  const link = (kind: 'open' | 'click', url?: string) =>
    `${options.baseUrl.replace(/\/$/, '')}/t/${signTracking({ id: options.id, kind, exp, ...(url ? { url } : {}) }, options.key)}`;
  if (options.click)
    $('a[href]').each((_i, element) => {
      const href = $(element).attr('href');
      if (href && href.length <= 2048 && /^https?:\/\//i.test(href))
        $(element).attr('href', link('click', href));
    });
  if (options.open)
    $.root().append(
      `<img src="${link('open')}" width="1" height="1" alt="" style="display:none" />`,
    );
  return $.html();
}
