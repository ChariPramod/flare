import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import { publicAddress } from '@flare/mail';
const trustedOrigin = (url: URL) =>
  (process.env.WEBHOOK_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .includes(url.origin);
export function webhookUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new Error('Webhook URL must use HTTP(S), without credentials or a fragment');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname) && !publicAddress(hostname) && !trustedOrigin(url))
    throw new Error('Private webhook destinations are forbidden');
  return url;
}
export type WebhookHttpResult = { status: number; excerpt: string };
export async function postWebhook(
  raw: string,
  body: string,
  headers: Record<string, string>,
): Promise<WebhookHttpResult> {
  const url = webhookUrl(raw),
    host = url.hostname.replace(/^\[|\]$/g, '');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    isIP(host)
      ? Promise.resolve([{ address: host, family: isIP(host) }])
      : lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Webhook DNS lookup timed out')), 5000);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (
    !addresses.length ||
    (!trustedOrigin(url) && addresses.some((value) => !publicAddress(value.address)))
  )
    throw new Error('Private webhook destinations are forbidden');
  const pinned: LookupFunction = (_name, options, callback) =>
    options.all
      ? callback(null, addresses)
      : callback(null, addresses[0]!.address, addresses[0]!.family);
  const dispatcher = new Agent({ connect: { lookup: pinned, timeout: 5000 } });
  try {
    const result = await request(url, {
      method: 'POST',
      body,
      headers: { ...headers, 'Content-Type': 'application/json', 'User-Agent': 'Flare-Webhooks/1' },
      dispatcher,
      signal: AbortSignal.timeout(15000),
      headersTimeout: 10000,
      bodyTimeout: 5000,
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const part of result.body) {
      const chunk = Buffer.from(part),
        available = 4096 - bytes;
      if (available > 0) chunks.push(chunk.subarray(0, available));
      bytes += chunk.length;
      if (bytes >= 4096) {
        result.body.destroy();
        break;
      }
    }
    return { status: result.statusCode, excerpt: Buffer.concat(chunks).toString('utf8') };
  } finally {
    await dispatcher.close();
  }
}
