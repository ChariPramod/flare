import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
export const webhookSecret = () => `whsec_${randomBytes(32).toString('base64')}`;
function key(secret: string) {
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new Error('Invalid webhook secret');
  const bytes = Buffer.from(secret.slice(6), 'base64');
  if (bytes.length < 24) throw new Error('Webhook secret is too short');
  return bytes;
}
export function signWebhook(secret: string, id: string, timestamp: number, body: string) {
  return `v1,${createHmac('sha256', key(secret)).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}
export function verifyWebhook(
  secret: string,
  body: string,
  headers: Record<string, string | undefined>,
  now = Date.now(),
) {
  const id = headers['svix-id'] ?? headers['webhook-id'],
    raw = headers['svix-timestamp'] ?? headers['webhook-timestamp'],
    signatures = headers['svix-signature'] ?? headers['webhook-signature'];
  if (!id || !raw || !/^\d+$/.test(raw) || !signatures)
    throw new Error('Missing webhook signature headers');
  const timestamp = Number(raw);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(now / 1000) - timestamp) > 300)
    throw new Error('Webhook timestamp outside the five-minute window');
  const expected = Buffer.from(signWebhook(secret, id, timestamp, body).slice(3), 'base64');
  const matches = signatures.split(' ').some((signature) => {
    const [version, value] = signature.split(',');
    if (version !== 'v1' || !value) return false;
    const actual = Buffer.from(value, 'base64');
    return actual.length === expected.length && timingSafeEqual(expected, actual);
  });
  if (!matches) throw new Error('Invalid webhook signature');
  return JSON.parse(body) as unknown;
}
export const webhookRetrySeconds = [0, 5, 300, 1800, 7200, 18000, 36000, 36000] as const;
export function eventMatches(filters: readonly string[], type: string) {
  return filters.some(
    (filter) =>
      filter === '*' ||
      filter === type ||
      (filter.endsWith('.*') && type.startsWith(filter.slice(0, -1))),
  );
}
