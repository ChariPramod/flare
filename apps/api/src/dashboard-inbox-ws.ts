import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { io as connect } from 'socket.io-client';
import { z } from 'zod';
import { validateDashboardProxySecret } from '@flare/shared/dashboard-forwarding';
import { createDashboardInboxSocketAuthority, dashboardInboxAuthority } from './dashboard-inbox.js';

export const inboxSocketLimits = Object.freeze({
  revalidateMs: 5000,
  authorizationMs: 2000,
  writeDrainMs: 1000,
  nativeConnectMs: 5000,
  connections: 256,
  pending: 64,
  perSession: 8,
  incomingBytes: 16 * 1024,
  eventBytes: 2 * 1024 * 1024,
  queuedBytes: 4 * 1024 * 1024,
  queuedEvents: 32,
});
type Authority = ReturnType<typeof createDashboardInboxSocketAuthority>;
type Binding = Awaited<ReturnType<Authority>>;
type Limits = typeof inboxSocketLimits;
type Options = {
  webOrigin: string;
  nativeOrigin: string;
  authorize: Authority;
  limits?: Partial<Limits>;
};
const events = new Set(['notification_received', 'unseen_count_changed', 'unread_count_changed']);
const socketAuth = z.object({ flareSessionId: z.string().uuid() }).strict();
const nativeToken = z
  .string()
  .max(8192)
  .regex(/^[\w-]+\.[\w-]+\.[\w-]+$/);
const unavailable = () => new Error('Inbox socket access unavailable');

function exactOrigin(value: string, native = false) {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.username ||
    url.password ||
    !(native ? ['http:', 'https:', 'ws:', 'wss:'] : ['http:', 'https:']).includes(url.protocol) ||
    (!native &&
      url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('Invalid Inbox socket configuration');
  return value;
}
function handshake(req: IncomingMessage, webOrigin: string) {
  if (req.headers.origin !== webOrigin || req.method !== 'GET' || (req.url?.length ?? 0) > 9216)
    throw unavailable();
  const url = new URL(req.url!, 'http://inbox.invalid');
  if (
    url.pathname !== '/socket.io/' ||
    url.searchParams.get('EIO') !== '4' ||
    url.searchParams.get('transport') !== 'websocket'
  )
    throw unavailable();
  const names = new Set<string>();
  for (const name of url.searchParams.keys()) {
    if (!['EIO', 'transport', 'token'].includes(name) || names.has(name)) throw unavailable();
    names.add(name);
  }
  return nativeToken.parse(url.searchParams.get('token'));
}

/** Native credentials are never logged. Only bounded native events cross this subscriber connection. */
export function createDashboardInboxWebSocket(server: HttpServer, options: Options) {
  const webOrigin = exactOrigin(options.webOrigin);
  const nativeOrigin = exactOrigin(options.nativeOrigin, true);
  const limits = { ...inboxSocketLimits, ...options.limits };
  const sessions = new Map<string, number>();
  const pending = new Set<object>();
  const reservations = new WeakMap<IncomingMessage, () => void>();
  const reserved = new Set<() => void>();
  const cleanups = new Set<() => void>();
  const proofs = new WeakMap<Socket, { token: string; sessionId: string; binding: Binding }>();
  let closing = false;
  let authorizations = 0;
  const io = new Server(server, {
    path: '/socket.io/',
    serveClient: false,
    transports: ['websocket'],
    allowUpgrades: false,
    perMessageDeflate: false,
    maxHttpBufferSize: limits.incomingBytes,
    connectTimeout: limits.authorizationMs + 1000,
    pingInterval: 10000,
    pingTimeout: 5000,
    allowRequest(req, done) {
      try {
        handshake(req, webOrigin);
        if (
          closing ||
          io.engine.clientsCount + reserved.size >= limits.connections ||
          pending.size + reserved.size >= limits.pending
        )
          throw unavailable();
        const timer = setTimeout(release, limits.authorizationMs + 1000);
        function release() {
          clearTimeout(timer);
          reserved.delete(release);
          reservations.delete(req);
        }
        reservations.set(req, release);
        reserved.add(release);
        done(null, true);
      } catch {
        done('Inbox socket unavailable', false);
      }
    },
  });
  io.engine.on('connection', (connection) => {
    reservations.get(connection.request)?.();
    if (closing || pending.size >= limits.pending) {
      connection.close(true);
      return;
    }
    pending.add(connection);
    connection.once('close', () => pending.delete(connection));
    // The SDK sends one default-namespace CONNECT and Engine.IO pongs. It never
    // needs application emits, acknowledgements, binary payloads or other namespaces.
    let connected = false;
    connection.on('packet', (packet: { type: string; data?: unknown }) => {
      if (packet.type !== 'message') return;
      const value = packet.data;
      if (
        typeof value !== 'string' ||
        !(value === '1' || (!connected && (value === '0' || value.startsWith('0{'))))
      ) {
        connection.close(true);
        return;
      }
      if (value.startsWith('0')) connected = true;
    });
  });

  function checked(sessionId: string, token: string, lifetime: AbortSignal) {
    // Keep canceled-but-unsettled dependency work counted. A database outage
    // must not let repeated reconnects create an unbounded pending query queue.
    if (authorizations >= limits.connections + limits.pending) return Promise.reject(unavailable());
    const deadline = new AbortController();
    const signal = AbortSignal.any([lifetime, deadline.signal]);
    let rejectAborted: () => void;
    const aborted = new Promise<never>((_, reject) => {
      rejectAborted = () => reject(unavailable());
      signal.addEventListener('abort', rejectAborted, { once: true });
    });
    const timer = setTimeout(() => deadline.abort(), limits.authorizationMs);
    if (signal.aborted) rejectAborted!();
    authorizations++;
    const lookup = Promise.resolve().then(() => options.authorize(sessionId, token, signal));
    void lookup.then(
      () => {
        authorizations--;
      },
      () => {
        authorizations--;
      },
    );
    return Promise.race([lookup, aborted]).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener('abort', rejectAborted!);
    });
  }
  io.use((socket, next) => {
    const lifetime = new AbortController();
    socket.conn.once('close', () => lifetime.abort());
    void (async () => {
      const token = handshake(socket.request, webOrigin);
      const { flareSessionId: sessionId } = socketAuth.parse(socket.handshake.auth);
      const binding = await checked(sessionId, token, lifetime.signal);
      if (
        closing ||
        lifetime.signal.aborted ||
        binding.expiresAt <= Date.now() ||
        (sessions.get(sessionId) ?? 0) >= limits.perSession
      )
        throw unavailable();
      sessions.set(sessionId, (sessions.get(sessionId) ?? 0) + 1);
      pending.delete(socket.conn);
      socket.conn.once('close', () => {
        const count = (sessions.get(sessionId) ?? 1) - 1;
        if (count > 0) sessions.set(sessionId, count);
        else sessions.delete(sessionId);
      });
      proofs.set(socket, { token, sessionId, binding });
      next();
    })().catch(() => {
      next(unavailable());
      // Let the fixed CONNECT_ERROR reach the SDK before closing. A slow peer
      // cannot retain the unauthenticated transport indefinitely while it drains.
      const force = setTimeout(() => socket.conn.close(true), 1000);
      socket.conn.once('close', () => clearTimeout(force));
    });
  });
  io.on('connection', (socket) => {
    const proof = proofs.get(socket);
    if (!proof || closing) {
      socket.disconnect(true);
      return;
    }
    const lifetime = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let pendingCheck: Promise<Binding> | undefined;
    let draining = false;
    let queuedBytes = 0;
    let stopped = false;
    const queue: { event: string; payload: unknown; bytes: number }[] = [];
    const stop = (retry = false) => {
      if (stopped) return;
      stopped = true;
      lifetime.abort();
      clearTimeout(timer);
      clearTimeout(expiry);
      queue.length = 0;
      queuedBytes = 0;
      upstream?.removeAllListeners();
      upstream?.disconnect();
      cleanups.delete(stop);
      // Native transport failure permits the SDK's bounded reconnect. Revoked
      // authority uses a namespace disconnect, requiring a fresh HTTP bootstrap.
      if (retry) socket.conn.close(true);
      else socket.disconnect(true);
    };
    cleanups.add(stop);
    socket.once('disconnect', () => stop());
    socket.onAny(() => stop());
    const armExpiry = (binding: Binding) => {
      clearTimeout(expiry);
      expiry = setTimeout(() => stop(), Math.max(0, binding.expiresAt - Date.now()));
    };
    const validate = () => {
      pendingCheck ??= checked(proof.sessionId, proof.token, lifetime.signal)
        .then((binding) => {
          if (
            stopped ||
            binding.expiresAt <= Date.now() ||
            binding.subscriberRecordId !== proof.binding.subscriberRecordId ||
            binding.subscriberId !== proof.binding.subscriberId ||
            binding.applicationIdentifier !== proof.binding.applicationIdentifier ||
            binding.sessionId !== proof.binding.sessionId ||
            binding.orgId !== proof.binding.orgId ||
            binding.environmentId !== proof.binding.environmentId ||
            binding.actorId !== proof.binding.actorId
          )
            throw unavailable();
          armExpiry(binding);
          return binding;
        })
        .finally(() => {
          pendingCheck = undefined;
        });
      return pendingCheck;
    };
    const revalidate = () => {
      timer = setTimeout(() => {
        void validate()
          .then(() => {
            if (!stopped) revalidate();
          })
          .catch(() => stop());
      }, limits.revalidateMs);
    };
    const writable = () => {
      if (socket.conn.transport.writable) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const transport = socket.conn.transport;
        const timer = setTimeout(() => {
          stop(true);
        }, limits.writeDrainMs);
        const cleanup = () => {
          clearTimeout(timer);
          transport.off('ready', ready);
          lifetime.signal.removeEventListener('abort', aborted);
        };
        const ready = () => {
          if (!transport.writable) return;
          cleanup();
          resolve();
        };
        const aborted = () => {
          cleanup();
          reject(unavailable());
        };
        transport.on('ready', ready);
        lifetime.signal.addEventListener('abort', aborted, { once: true });
        if (lifetime.signal.aborted) aborted();
        else ready();
      });
    };
    const drain = async () => {
      if (draining || stopped) return;
      draining = true;
      try {
        while (queue.length && !stopped) {
          // Engine.IO becomes briefly non-writable for every ordinary frame.
          // Keep pending events in our bounded queue until it is ready, rather
          // than adding to its internal write buffer or disconnecting a fast peer.
          await writable();
          await validate();
          if (stopped) return;
          if (!socket.conn.transport.writable) continue;
          const item = queue.shift()!;
          queuedBytes -= item.bytes;
          socket.emit(item.event, item.payload);
        }
      } catch {
        stop();
      } finally {
        draining = false;
      }
    };
    armExpiry(proof.binding);
    revalidate();
    const upstream = connect(nativeOrigin, {
      path: '/socket.io/',
      transports: ['websocket'],
      query: { token: proof.token },
      reconnection: false,
      forceNew: true,
      autoConnect: false,
      timeout: limits.nativeConnectMs,
      transportOptions: { websocket: { perMessageDeflate: false, maxPayload: limits.eventBytes } },
    });
    upstream.on('connect_error', () => stop(true));
    upstream.on('disconnect', () => stop(true));
    upstream.onAny((event: string, ...args: unknown[]) => {
      if (stopped) return;
      if (
        !events.has(event) ||
        args.length !== 1 ||
        args[0] === null ||
        typeof args[0] !== 'object' ||
        Array.isArray(args[0])
      ) {
        stop();
        return;
      }
      let bytes: number;
      try {
        bytes = Buffer.byteLength(JSON.stringify(args[0]));
      } catch {
        stop();
        return;
      }
      if (
        bytes > limits.eventBytes ||
        queue.length >= limits.queuedEvents ||
        queuedBytes + bytes > limits.queuedBytes
      ) {
        stop(true);
        return;
      }
      queuedBytes += bytes;
      queue.push({ event, payload: args[0], bytes });
      void drain();
    });
    upstream.connect();
  });
  return {
    io,
    async close() {
      closing = true;
      for (const release of reserved) release();
      for (const cleanup of [...cleanups]) cleanup();
      io.disconnectSockets(true);
      // The owning Nest application retains HTTP server lifecycle responsibility.
      io.engine.close();
    },
  };
}

export function startDashboardInboxWebSocket(server: HttpServer) {
  if (process.env.FLARE_DASHBOARD_INBOX_WS !== 'true') return { close: async () => undefined };
  validateDashboardProxySecret(process.env.FLARE_DASHBOARD_PROXY_SECRET ?? '');
  return createDashboardInboxWebSocket(server, {
    webOrigin: process.env.WEB_ORIGIN ?? '',
    nativeOrigin: process.env.NOVU_WS_URL ?? 'http://novu-ws:3002',
    authorize: createDashboardInboxSocketAuthority(dashboardInboxAuthority),
  });
}
