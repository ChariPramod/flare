import type { Request, RequestHandler, Response } from 'express';
import {
  hasDashboardForwardingHeaders,
  validateDashboardProxySecret,
  verifyDashboardForwarding,
} from '@flare/shared/dashboard-forwarding';

type ReplayStore = {
  set(key: string, value: string, mode: 'EX', ttl: number, condition: 'NX'): Promise<unknown>;
};
type RawRequest = Request & { rawBody?: Buffer };
const verifiedAddresses = new WeakMap<object, string>();

/** Only the verification middleware can populate this address; it grants no API authority. */
export function verifiedDashboardClientAddress(request: object): string | undefined {
  return verifiedAddresses.get(request);
}

function bodyBytes(req: RawRequest): Buffer {
  const framing = new Set(['content-length', 'transfer-encoding', 'content-encoding']);
  const seen = new Set<string>();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index]!.toLowerCase();
    if (!framing.has(name)) continue;
    if (seen.has(name)) throw new Error('Duplicate body framing');
    seen.add(name);
  }
  // Body parsers inflate compressed bodies before retaining rawBody. This protocol binds
  // the original bytes, so it deliberately accepts only uncompressed requests.
  const encoding = req.headers['content-encoding'];
  if (encoding !== undefined && encoding !== 'identity') throw new Error('Unsupported encoding');
  const length = req.headers['content-length'];
  if (length !== undefined && (typeof length !== 'string' || !/^(0|[1-9][0-9]*)$/.test(length)))
    throw new Error('Invalid body length');
  const transfer = req.headers['transfer-encoding'];
  if (transfer !== undefined && transfer !== 'chunked') throw new Error('Unsupported transfer');
  if (transfer !== undefined && length !== undefined) throw new Error('Conflicting body framing');
  if (req.rawBody !== undefined && !Buffer.isBuffer(req.rawBody))
    throw new Error('Missing original body');
  if (req.rawBody === undefined && ((length !== undefined && length !== '0') || transfer))
    throw new Error('Unparsed body');
  const body = req.rawBody ?? Buffer.alloc(0);
  if (length !== undefined && BigInt(length) !== BigInt(body.length))
    throw new Error('Body length mismatch');
  return body;
}

function deny(res: Response, status: 401 | 503) {
  res.setHeader('x-flare-proxy-error', status === 503 ? 'unavailable' : 'invalid-proof');
  if (status === 503) res.setHeader('Retry-After', '1');
  res.status(status).json({
    statusCode: status,
    error: status === 503 ? 'Service Unavailable' : 'Unauthorized',
    message:
      status === 503 ? 'Dashboard forwarding unavailable' : 'Invalid dashboard forwarding proof',
  });
}

/** Install after rawBody capture and before routes, including public authentication routes. */
export function createDashboardForwardingMiddleware(options: {
  secret?: string;
  redis: ReplayStore;
  now?: () => number;
}): RequestHandler {
  // Optional deployment variables are commonly present but empty in self-hosted Compose.
  const secret = options.secret || undefined;
  if (secret !== undefined) validateDashboardProxySecret(secret);
  return async (req: RawRequest, res, next) => {
    verifiedAddresses.delete(req);
    if (!hasDashboardForwardingHeaders(req.headers)) {
      next();
      return;
    }
    if (!secret) {
      deny(res, 503);
      return;
    }
    let proof;
    try {
      proof = verifyDashboardForwarding(
        secret,
        {
          method: req.method,
          target: req.originalUrl,
          body: bodyBytes(req),
          headers: req.headers,
        },
        { now: options.now?.(), rawHeaders: req.rawHeaders },
      );
    } catch {
      deny(res, 401);
      return;
    }
    let claimed;
    try {
      claimed = await options.redis.set(
        `dashboard-proxy:nonce:v1:${proof.nonce}`,
        '1',
        'EX',
        proof.replayTtlSeconds,
        'NX',
      );
    } catch {
      deny(res, 503);
      return;
    }
    if (claimed !== 'OK') {
      deny(res, claimed === null ? 401 : 503);
      return;
    }
    verifiedAddresses.set(req, proof.clientIp);
    next();
  };
}
