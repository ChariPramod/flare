'use client';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type ReadOperation =
  'email.detail' | 'email.source' | 'inbound.body' | 'inbound.raw' | 'inbound.attachment';
type TransferRequest =
  | { operation: 'email.send'; body_sha256: string; body_bytes: number; idempotency_key: string }
  | { operation: ReadOperation; message_id: string; attachment_id?: string };
type TransferGrant = { url: string; method: string; token: string; expires_at: string };
let transferMode: boolean | undefined;

export async function responseJson<T>(response: Response): Promise<T> {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (response.ok && ![204, 205].includes(response.status))
      throw new ApiError('Flare returned an incomplete response. Retry the request.', 503);
    data = {};
  }
  if (!response.ok) {
    const failure =
      data !== null && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    throw new ApiError(
      typeof failure.message === 'string'
        ? failure.message
        : JSON.stringify(failure.message ?? failure.errors ?? 'Request failed'),
      response.status,
    );
  }
  return data as T;
}

async function enabled(signal?: AbortSignal) {
  if (transferMode !== undefined) return transferMode;
  const response = await fetch('/api/browser-transfer-config', {
    method: 'GET',
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
  const config = await responseJson<{ enabled?: unknown }>(response);
  if (typeof config.enabled !== 'boolean')
    throw new ApiError('Browser transfer configuration is unavailable. Retry the request.', 503);
  transferMode = config.enabled;
  return transferMode;
}

function operation(
  path: string,
  method: string,
):
  | { operation: ReadOperation | 'email.send'; message_id?: string; attachment_id?: string }
  | undefined {
  if (path === 'emails' && method === 'POST') return { operation: 'email.send' };
  if (method !== 'GET') return;
  const parts = path.split('/');
  const id = parts[1];
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  if (parts[0] === 'emails' && parts.length === 2)
    return { operation: 'email.detail', message_id: id };
  if (parts[0] === 'emails' && parts.length === 3 && parts[2] === 'source')
    return { operation: 'email.source', message_id: id };
  if (parts[0] === 'inbound' && parts.length === 3 && ['body', 'raw'].includes(parts[2]!))
    return { operation: `inbound.${parts[2]}` as ReadOperation, message_id: id };
  if (
    parts[0] === 'inbound' &&
    parts.length === 4 &&
    parts[2] === 'attachments' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parts[3]!)
  )
    return { operation: 'inbound.attachment', message_id: id, attachment_id: parts[3] };
}

function grantUrl(value: string) {
  const url = new URL(value);
  const local = (hostname: string) => ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
  const localDevelopment =
    typeof location !== 'undefined' &&
    location.protocol === 'http:' &&
    local(location.hostname) &&
    local(url.hostname);
  if (
    url.username ||
    url.password ||
    url.hash ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && localDevelopment))
  )
    throw new Error('Invalid transfer destination');
  return url.href;
}

/** Returns null when this operation uses the normal same-origin proxy. Tokens live only in this call. */
export async function browserTransfer(
  path: string,
  method: string,
  serializedBody?: string,
  idempotencyKey?: string,
  signal?: AbortSignal,
): Promise<Response | null> {
  const selected = operation(path, method);
  if (!selected || !(await enabled(signal))) return null;
  let input: TransferRequest;
  if (selected.operation === 'email.send') {
    if (serializedBody === undefined || !idempotencyKey)
      throw new ApiError('An idempotency key and message are required.', 400);
    const bytes = new TextEncoder().encode(serializedBody);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    input = {
      operation: 'email.send',
      body_bytes: bytes.byteLength,
      body_sha256: Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
      idempotency_key: idempotencyKey,
    };
  } else
    input = {
      operation: selected.operation,
      message_id: selected.message_id!,
      ...(selected.attachment_id ? { attachment_id: selected.attachment_id } : {}),
    };
  const grant = await responseJson<TransferGrant>(
    await fetch('/api/browser-transfers', {
      method: 'POST',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
  let url: string;
  try {
    if (
      grant.method !== method ||
      typeof grant.token !== 'string' ||
      !grant.token ||
      grant.token.length > 16384 ||
      typeof grant.url !== 'string' ||
      !Number.isFinite(Date.parse(grant.expires_at))
    )
      throw new Error('Invalid transfer grant');
    url = grantUrl(grant.url);
  } catch {
    throw new ApiError('Browser transfer authorization is unavailable. Retry the request.', 503);
  }
  return fetch(url, {
    method,
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
    headers: {
      Authorization: `Bearer ${grant.token}`,
      ...(selected.operation === 'email.send'
        ? { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey! }
        : {}),
    },
    ...(serializedBody === undefined ? {} : { body: serializedBody }),
  });
}

export function downloadFilename(disposition: string | null, fallback: string) {
  let name = fallback;
  const encoded = disposition?.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition?.match(/(?:^|;)\s*filename="((?:[^"\\]|\\.)*)"/i)?.[1];
  const plain = disposition?.match(/(?:^|;)\s*filename=([^;]+)/i)?.[1];
  try {
    name = encoded
      ? decodeURIComponent(encoded.trim())
      : quoted
        ? quoted.replace(/\\(.)/g, '$1')
        : plain?.trim() || fallback;
  } catch {
    name = fallback;
  }
  name = [...name]
    .filter((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127)
    .join('')
    .replace(/[\\/]/g, '_')
    .trim()
    .slice(0, 255);
  return !name || name === '.' || name === '..' ? 'download' : name;
}
