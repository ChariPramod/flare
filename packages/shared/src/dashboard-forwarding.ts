import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export type DashboardForwardingHeaders = Readonly<
  Record<string, string | readonly string[] | undefined>
>;
export type DashboardForwardingRequest = {
  method: string;
  /** Exact origin-form path and query of the final upstream request. */
  target: string;
  body?: string | Uint8Array;
  headers: DashboardForwardingHeaders;
};
export const dashboardForwardingHeaders = {
  version: 'x-flare-proxy-version',
  timestamp: 'x-flare-proxy-timestamp',
  nonce: 'x-flare-proxy-nonce',
  clientIp: 'x-flare-proxy-client-ip',
  signature: 'x-flare-proxy-signature',
} as const;
export const dashboardForwardingSkewSeconds = 60;
const proofNames = Object.values(dashboardForwardingHeaders);
const boundHeaders = [
  'authorization',
  'x-org-id',
  'x-environment-id',
  'idempotency-key',
  'content-type',
  'traceparent',
  'x-flare-inbox-authorization',
] as const;
const maximumHeaderBytes: Record<(typeof boundHeaders)[number], number> = {
  authorization: 8192,
  'x-org-id': 128,
  'x-environment-id': 128,
  'idempotency-key': 256,
  'content-type': 256,
  traceparent: 128,
  'x-flare-inbox-authorization': 8192,
};
const protectedNames = new Set<string>([...proofNames, ...boundHeaders]);
const reserved = (name: string) =>
  name.startsWith('x-flare-proxy-') || name === 'x-flare-inbox-authorization';
const invalid = () => new Error('Invalid dashboard forwarding proof');

function key(secret: string) {
  if (!/^fdp_[A-Za-z0-9+/]{43}=$/.test(secret))
    throw new Error('Dashboard proxy secret must use fdp_ and encode 32 random bytes');
  const bytes = Buffer.from(secret.slice(4), 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== secret.slice(4))
    throw new Error('Invalid dashboard proxy secret encoding');
  return bytes;
}
export function validateDashboardProxySecret(secret: string): void {
  key(secret);
}

export function hasDashboardForwardingHeaders(headers: DashboardForwardingHeaders): boolean {
  return Object.keys(headers).some((name) => reserved(name.toLowerCase()));
}

function headersForSigning(headers: DashboardForwardingHeaders, rawHeaders?: readonly string[]) {
  if (rawHeaders) {
    if (rawHeaders.length % 2) throw invalid();
    const seen = new Set<string>();
    for (let index = 0; index < rawHeaders.length; index += 2) {
      const name = rawHeaders[index]!.toLowerCase();
      if (!protectedNames.has(name) && !reserved(name)) continue;
      if (seen.has(name)) throw invalid();
      seen.add(name);
    }
  }
  const normalized: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (!protectedNames.has(name) && !reserved(name)) continue;
    if (reserved(name) && !protectedNames.has(name)) throw invalid();
    if (value === undefined) continue;
    if (
      typeof value !== 'string' ||
      Object.hasOwn(normalized, name) ||
      /[^\x20-\x7e]/.test(value) ||
      value.trim() !== value
    )
      throw invalid();
    const limit = maximumHeaderBytes[name as keyof typeof maximumHeaderBytes] ?? 128;
    if (Buffer.byteLength(value) > limit) throw invalid();
    normalized[name] = value;
  }
  return normalized;
}

function validateRequest(request: DashboardForwardingRequest, clientIp: string) {
  if (!/^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(request.method)) throw invalid();
  if (
    !request.target.startsWith('/') ||
    request.target.startsWith('//') ||
    /[#\\]/.test(request.target) ||
    [...request.target].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || code === 127;
    }) ||
    /%(?![0-9a-f]{2})/i.test(request.target) ||
    Buffer.byteLength(request.target) > 8192
  )
    throw invalid();
  const parsed = new URL(request.target, 'https://dashboard-forwarding.invalid');
  if (`${parsed.pathname}${parsed.search}` !== request.target) throw invalid();
  if (clientIp.length > 45 || /[\s,%]/.test(clientIp) || !isIP(clientIp)) throw invalid();
  const bytes =
    typeof request.body === 'string'
      ? Buffer.from(request.body, 'utf8')
      : Buffer.from(request.body ?? []);
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) && bytes.length) throw invalid();
  return bytes;
}

function canonical(
  request: DashboardForwardingRequest,
  headers: Record<string, string>,
  clientIp: string,
  timestamp: number,
  nonce: string,
) {
  const bytes = validateRequest(request, clientIp);
  return JSON.stringify([
    'flare-dashboard-forwarding',
    1,
    request.method,
    request.target,
    bytes.length,
    createHash('sha256').update(bytes).digest('hex'),
    ...boundHeaders.map((name) => headers[name] ?? ''),
    clientIp,
    timestamp,
    nonce,
  ]);
}

/** Produces proof headers only; callers merge these after building final upstream headers. */
export function signDashboardForwarding(
  secret: string,
  request: DashboardForwardingRequest,
  clientIp: string,
  options: { now?: number; nonce?: string } = {},
): Record<string, string> {
  const secretKey = key(secret);
  if (Object.keys(request.headers).some((name) => name.toLowerCase().startsWith('x-flare-proxy-')))
    throw invalid();
  const headers = headersForSigning(request.headers);
  const timestamp = Math.floor((options.now ?? Date.now()) / 1000);
  const nonce = options.nonce ?? randomBytes(16).toString('hex');
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !/^[a-f0-9]{32}$/.test(nonce))
    throw invalid();
  const signature = createHmac('sha256', secretKey)
    .update(canonical(request, headers, clientIp, timestamp, nonce))
    .digest('base64url');
  return {
    [dashboardForwardingHeaders.version]: '1',
    [dashboardForwardingHeaders.timestamp]: String(timestamp),
    [dashboardForwardingHeaders.nonce]: nonce,
    [dashboardForwardingHeaders.clientIp]: clientIp,
    [dashboardForwardingHeaders.signature]: signature,
  };
}

/** Verifies integrity only. The API must reserve the nonce before trusting clientIp. */
export function verifyDashboardForwarding(
  secret: string,
  request: DashboardForwardingRequest,
  options: { now?: number; rawHeaders?: readonly string[] } = {},
) {
  const secretKey = key(secret);
  const headers = headersForSigning(request.headers, options.rawHeaders);
  const timestampText = headers[dashboardForwardingHeaders.timestamp] ?? '';
  const nonce = headers[dashboardForwardingHeaders.nonce] ?? '';
  const clientIp = headers[dashboardForwardingHeaders.clientIp] ?? '';
  const signature = headers[dashboardForwardingHeaders.signature] ?? '';
  if (
    headers[dashboardForwardingHeaders.version] !== '1' ||
    !/^(0|[1-9][0-9]{0,12})$/.test(timestampText) ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  )
    throw invalid();
  const timestamp = Number(timestampText);
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(now) || Math.abs(now - timestamp) > dashboardForwardingSkewSeconds)
    throw invalid();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.toString('base64url') !== signature) throw invalid();
  const expected = createHmac('sha256', secretKey)
    .update(canonical(request, headers, clientIp, timestamp, nonce))
    .digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
  return {
    clientIp,
    nonce,
    timestamp,
    // Include future clock skew and the inclusive validity boundary.
    replayTtlSeconds: timestamp + dashboardForwardingSkewSeconds - now + 1,
  };
}
