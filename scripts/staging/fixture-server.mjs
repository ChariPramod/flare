// Synthetic upstreams for ingress transport checks, not substitutes for real API authorization tests.
// Never load deployment settings or real credentials.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const origin = 'https://dashboard.staging.example.com';
const transferAuthorization = 'Bearer fixture-transfer-only';
const download = Buffer.alloc(6 * 1024 * 1024 + 37);
for (let i = 0; i < download.length; i++) download[i] = i % 251;
const corsHeaders = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Retry-After',
  Vary: 'Origin',
};

for (const [port, service] of [
  [3000, 'web'],
  [4000, 'api'],
  [3002, 'ws'],
]) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://fixture');
    if (url.searchParams.get('fixture_failure') === '1') {
      req.socket.destroy(); // Exercise Caddy runtime error logging with synthetic credentials.
      return;
    }
    if (service === 'api' && req.method === 'OPTIONS') {
      if (req.headers.origin !== origin) {
        res.writeHead(403).end();
        return;
      }
      res
        .writeHead(204, {
          ...corsHeaders,
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
          'Access-Control-Allow-Headers':
            'authorization, content-type, idempotency-key, x-org-id, x-environment-id',
        })
        .end();
      return;
    }
    const transfer =
      service === 'api' &&
      ((req.method === 'POST' && url.pathname === '/v1/emails') ||
        url.pathname === '/v1/inbound/fixture/raw');
    if (transfer) {
      if (req.headers.origin !== origin) {
        res.writeHead(403).end();
        return;
      }
      if (req.headers.authorization !== transferAuthorization) {
        res.writeHead(401, corsHeaders).end();
        return;
      }
      if (req.method === 'GET') {
        res.writeHead(200, {
          ...corsHeaders,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(download.length),
          'Content-Disposition': 'attachment; filename="received-message.eml"',
          'Cache-Control': 'private, no-store',
        });
        for (let offset = 0; offset < download.length; offset += 65536)
          res.write(download.subarray(offset, offset + 65536));
        res.end();
        return;
      }
    }
    let bytes = 0;
    const digest = createHash('sha256');
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 40 * 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        digest.update(chunk);
      }
      res.writeHead(200, { ...(transfer ? corsHeaders : {}), 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          service,
          path: req.url,
          client: req.headers['x-flare-client-ip'],
          forwarded: req.headers['x-forwarded-for'],
          origin: req.headers.origin,
          authorization: req.headers.authorization,
          idempotency: req.headers['idempotency-key'],
          contentType: req.headers['content-type'],
          organization: req.headers['x-org-id'],
          environment: req.headers['x-environment-id'],
          bytes,
          sha256: digest.digest('hex'),
        }),
      );
    } catch {
      res.destroy();
    }
  });
  server.on('upgrade', (req, socket) => {
    const url = new URL(req.url, 'http://fixture');
    const key = req.headers['sec-websocket-key'];
    if (
      !url.pathname.startsWith('/socket.io/') ||
      req.headers.origin !== origin ||
      url.searchParams.get('token') !== 'fixture-native-token' ||
      typeof key !== 'string'
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    const accept = createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nX-Fixture-Upstream: ${service}\r\n\r\n`,
    );
    socket.on('error', () => socket.destroy());
    socket.setTimeout(5000, () => socket.destroy());
  });
  server.listen(port, '0.0.0.0');
}
