import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Server, type Socket as ServerSocket } from 'socket.io';
import { io, type Socket } from 'socket.io-client';

vi.mock('./context.js', () => ({ sql: vi.fn(), redis: {} }));
vi.mock('./auth.js', () => ({ Access: () => () => undefined }));
vi.mock('./workflows.js', () => ({ subscriberInboxAccess: vi.fn() }));
import { createDashboardInboxWebSocket } from './dashboard-inbox-ws.js';

const webOrigin = 'https://dashboard.example.test';
const token = 'fixture.native.token';
const sessionId = '17c2b932-f943-4b4e-87c4-704478e51681';
const binding = () => ({
  version: 1 as const,
  sessionId,
  actorId: 'b7b7a431-5b07-44e7-929a-936a9d8150ce',
  orgId: '125b0185-55db-4ba0-9e65-84bd52e830da',
  environmentId: '9bc83ef7-7165-4fac-9901-cdf2ef72ff79',
  subscriberRecordId: '6090d4b8-1727-4f78-809c-b39e9ee95f0e',
  subscriberId: 'viewer',
  applicationIdentifier: 'application',
  expiresAt: Date.now() + 60000,
});
type Options = Parameters<typeof createDashboardInboxWebSocket>[1];
let upstreamHttp: HttpServer, server: HttpServer, native: Server;
let gateway: ReturnType<typeof createDashboardInboxWebSocket> | undefined;
let origin: string, nativeOrigin: string;
let authorize: Options['authorize'];
let nativeSockets: ServerSocket[], clients: Socket[];
async function listen(server: HttpServer) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected local test port');
  return `http://127.0.0.1:${address.port}`;
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Expected bounded socket state transition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
function event(socket: Socket, name: string) {
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, received);
      reject(new Error(`Missing ${name} event`));
    }, 1500);
    function received(value: unknown) {
      clearTimeout(timer);
      resolve(value);
    }
    socket.once(name, received);
  });
}
beforeEach(async () => {
  nativeSockets = [];
  clients = [];
  authorize = vi.fn(async () => binding());
  upstreamHttp = createServer();
  native = new Server(upstreamHttp, { transports: ['websocket'], serveClient: false });
  native.on('connection', (socket) => {
    nativeSockets.push(socket);
  });
  nativeOrigin = await listen(upstreamHttp);
  server = createServer();
  origin = await listen(server);
});
afterEach(async () => {
  for (const client of clients) client.disconnect();
  await gateway?.close();
  gateway = undefined;
  await native.close();
  if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
});
function start(limits: Options['limits'] = {}) {
  gateway = createDashboardInboxWebSocket(server, {
    webOrigin,
    nativeOrigin,
    authorize,
    limits: { revalidateMs: 50, authorizationMs: 100, ...limits },
  });
}
function client(options: Parameters<typeof io>[1] = {}) {
  const socket = io(origin, {
    transports: ['websocket'],
    query: { token },
    auth: { flareSessionId: sessionId },
    extraHeaders: { Origin: webOrigin },
    forceNew: true,
    reconnection: false,
    autoConnect: false,
    ...options,
  });
  clients.push(socket);
  return socket;
}
async function connected(options: Parameters<typeof io>[1] = {}) {
  const socket = client(options);
  const ready = event(socket, 'connect');
  socket.connect();
  await ready;
  await until(() => nativeSockets.some((value) => value.connected));
  return socket;
}

it('rechecks binding authority before each allowed native event and never forwards browser app events', async () => {
  start();
  const socket = await connected();
  expect(nativeSockets[0]!.handshake.query.token).toBe(token);
  const received = event(socket, 'notification_received');
  nativeSockets[0]!.emit('notification_received', {
    message: { content: 'approved notification' },
  });
  expect(await received).toEqual({ message: { content: 'approved notification' } });
  expect(authorize).toHaveBeenCalledWith(sessionId, token, expect.any(AbortSignal));
  expect(vi.mocked(authorize).mock.calls.length).toBeGreaterThanOrEqual(2);
  const appEvents = vi.fn();
  nativeSockets[0]!.onAny(appEvents);
  const closed = event(socket, 'disconnect');
  socket.emit('join_admin', { room: 'other' });
  await closed;
  expect(appEvents).not.toHaveBeenCalled();
});
it.each(['0/admin,{}', Buffer.from([0, 1, 2])])(
  'closes hostile namespace or binary client packets without forwarding them',
  async (packet) => {
    start();
    const socket = await connected();
    const received = vi.fn();
    nativeSockets[0]!.onAny(received);
    const closed = event(socket, 'disconnect');
    socket.io.engine.write(packet);
    await closed;
    expect(received).not.toHaveBeenCalled();
  },
);
it('preserves native event ordering while a bounded authorization check is pending', async () => {
  start();
  const socket = await connected();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.mocked(authorize).mockImplementationOnce(async () => {
    await pending;
    return binding();
  });
  const values: number[] = [];
  socket.on('unseen_count_changed', ({ unseenCount }: { unseenCount: number }) =>
    values.push(unseenCount),
  );
  for (const unseenCount of [1, 2, 3])
    nativeSockets[0]!.emit('unseen_count_changed', { unseenCount });
  await until(() => vi.mocked(authorize).mock.calls.length >= 2);
  expect(values).toEqual([]);
  release();
  await until(() => values.length === 3);
  expect(values).toEqual([1, 2, 3]);
});
it('closes a stalled browser transport at the bounded drain deadline', async () => {
  start({ writeDrainMs: 25, revalidateMs: 500 });
  const socket = await connected();
  const downstream = [...gateway!.io.sockets.sockets.values()][0]!;
  downstream.conn.transport.writable = false;
  const received = vi.fn();
  socket.on('notification_received', received);
  const closed = event(socket, 'disconnect');
  nativeSockets[0]!.emit('notification_received', { message: { content: 'bounded queue' } });
  await closed;
  expect(received).not.toHaveBeenCalled();
});
it.each([undefined, 'https://other.example.test', 'null'])(
  'rejects non-exact browser Origin %s before authority lookup or native connection',
  async (Origin) => {
    start();
    const socket = client({ extraHeaders: Origin ? { Origin } : {} });
    const failure = event(socket, 'connect_error');
    socket.connect();
    await failure;
    expect(authorize).not.toHaveBeenCalled();
    expect(nativeSockets).toHaveLength(0);
  },
);
it.each([
  { flareSessionId: sessionId, subscriberId: 'other' },
  { flareSessionId: 'not-a-session' },
])('rejects substituted socket authentication %j', async (auth) => {
  start();
  const socket = client({ auth });
  const failure = event(socket, 'connect_error');
  socket.connect();
  await failure;
  expect(authorize).not.toHaveBeenCalled();
  expect(nativeSockets).toHaveLength(0);
});
it('suppresses a queued event when the session is revoked or Redis binding becomes unavailable', async () => {
  start();
  const socket = await connected();
  const delivered = vi.fn();
  socket.on('notification_received', delivered);
  vi.mocked(authorize).mockRejectedValue(new Error('private dependency address'));
  const closed = event(socket, 'disconnect');
  nativeSockets[0]!.emit('notification_received', { message: { content: 'must not escape' } });
  expect(await closed).toBe('io server disconnect');
  expect(delivered).not.toHaveBeenCalled();
});
it('revalidates an idle connection and cancels a stalled authorization at its deadline', async () => {
  start({ revalidateMs: 10, authorizationMs: 30 });
  const socket = await connected();
  let lookupSignal: AbortSignal | undefined;
  vi.mocked(authorize).mockImplementation(async (_session, _token, signal) => {
    lookupSignal = signal;
    return new Promise(() => undefined);
  });
  const closed = event(socket, 'disconnect');
  await closed;
  expect(lookupSignal?.aborted).toBe(true);
});
it('includes both authorization windows when revocation follows an in-flight authority read', async () => {
  // Scale 2s + 5s + 2s to 20ms + 50ms + 20ms. Real socket I/O runs
  // normally; only gateway deadlines/idle scheduling use the controlled clock.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  let finishRead!: (value: ReturnType<typeof binding>) => void;
  let revoked = false;
  let nextSignal: AbortSignal | undefined;
  let lookups = 0;
  vi.mocked(authorize).mockImplementation(async (_session, _token, signal) => {
    lookups++;
    if (lookups === 1) return binding();
    if (lookups === 2) {
      expect(revoked).toBe(false);
      // The live-session read succeeded, but the remaining subscriber lookup
      // has not finished. A subsequent revocation cannot change this snapshot.
      return new Promise((resolve) => {
        finishRead = resolve;
      });
    }
    expect(revoked).toBe(true);
    nextSignal = signal;
    return new Promise(() => undefined);
  });
  try {
    start({ authorizationMs: 20, revalidateMs: 50 });
    const nativeReady = once(native, 'connection');
    const socket = client();
    const ready = event(socket, 'connect');
    socket.connect();
    await Promise.all([ready, nativeReady]);
    const closed = event(socket, 'disconnect');

    await vi.advanceTimersByTimeAsync(50);
    expect(lookups).toBe(2);
    revoked = true;
    await vi.advanceTimersByTimeAsync(19);
    expect(gateway!.io.sockets.sockets.size).toBe(1);
    finishRead(binding());
    await vi.advanceTimersByTimeAsync(0);

    // The next idle interval starts after the slow check completes, not after
    // its earlier authority read. A claimed 50+20ms cutoff would be too short.
    await vi.advanceTimersByTimeAsync(49);
    expect(lookups).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(lookups).toBe(3);
    await vi.advanceTimersByTimeAsync(19);
    expect(gateway!.io.sockets.sockets.size).toBe(1);
    expect(nextSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(nextSignal?.aborted).toBe(true);
    expect(gateway!.io.sockets.sockets.size).toBe(0);
    expect(await closed).toBe('io server disconnect');
  } finally {
    for (const socket of clients) socket.disconnect();
    await gateway?.close();
    vi.useRealTimers();
  }
});
it('does not connect native resources after an unauthenticated lookup times out', async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(authorize).mockImplementation(async (_session, _token, value) => {
    signal = value;
    return new Promise(() => undefined);
  });
  start({ authorizationMs: 25 });
  const socket = client();
  const failure = event(socket, 'connect_error');
  socket.connect();
  await failure;
  expect(signal?.aborted).toBe(true);
  expect(nativeSockets).toHaveLength(0);
});
it('retains an admission bound for canceled dependency work that has not settled', async () => {
  const settle: ((value: ReturnType<typeof binding>) => void)[] = [];
  vi.mocked(authorize).mockImplementation(
    async () =>
      new Promise((resolve) => {
        settle.push(resolve);
      }),
  );
  start({ connections: 1, pending: 1, authorizationMs: 15 });
  for (let i = 0; i < 3; i++) {
    const socket = client();
    const failure = event(socket, 'connect_error');
    socket.connect();
    await failure;
    socket.disconnect();
    await until(() => gateway!.io.engine.clientsCount === 0);
  }
  expect(authorize).toHaveBeenCalledTimes(2);
  expect(nativeSockets).toHaveLength(0);
  settle[0]!(binding());
  const next = client();
  const failure = event(next, 'connect_error');
  next.connect();
  await failure;
  expect(authorize).toHaveBeenCalledTimes(3);
  for (const resolve of settle) resolve(binding());
});
it('reconnects through a fresh authorization after native transport loss', async () => {
  start();
  const socket = await connected({
    reconnection: true,
    reconnectionAttempts: 2,
    reconnectionDelay: 10,
    reconnectionDelayMax: 20,
    randomizationFactor: 0,
  });
  const reconnected = event(socket, 'connect');
  nativeSockets[0]!.conn.close(true);
  await reconnected;
  await until(() => nativeSockets.length === 2);
  const received = event(socket, 'unread_count_changed');
  nativeSockets[1]!.emit('unread_count_changed', { counts: { total: 2 } });
  expect(await received).toEqual({ counts: { total: 2 } });
  expect(vi.mocked(authorize).mock.calls.length).toBeGreaterThanOrEqual(3);
});
it('bounds simultaneous session connections without evicting an already authorized peer', async () => {
  start({ perSession: 1 });
  const first = await connected();
  const second = client();
  const failure = event(second, 'connect_error');
  second.connect();
  await failure;
  expect(first.connected).toBe(true);
  expect(nativeSockets).toHaveLength(1);
});
it('bounds pending unauthenticated transports before allocating native resources', async () => {
  vi.mocked(authorize).mockImplementation(async () => new Promise(() => undefined));
  start({ pending: 1, authorizationMs: 1000 });
  const first = client();
  first.connect();
  await until(() => vi.mocked(authorize).mock.calls.length === 1);
  const second = client();
  const failure = event(second, 'connect_error');
  second.connect();
  await failure;
  expect(authorize).toHaveBeenCalledTimes(1);
  expect(nativeSockets).toHaveLength(0);
});
it('rejects caller-controlled query credentials and native application remapping', async () => {
  start();
  const unknown = client({ query: { token, subscriberId: 'other' } });
  const failure = event(unknown, 'connect_error');
  unknown.connect();
  await failure;
  expect(authorize).not.toHaveBeenCalled();
  const socket = await connected();
  vi.mocked(authorize).mockResolvedValue({ ...binding(), applicationIdentifier: 'changed' });
  const received = vi.fn();
  socket.on('notification_received', received);
  const closed = event(socket, 'disconnect');
  nativeSockets[0]!.emit('notification_received', { message: { content: 'must not escape' } });
  await closed;
  expect(received).not.toHaveBeenCalled();
});
it('rejects unknown native events and bounds queued payload bytes while authority is checked', async () => {
  start({ queuedBytes: 100, eventBytes: 1024, queuedEvents: 2 });
  const socket = await connected();
  const secretEvent = vi.fn();
  socket.on('administrator_event', secretEvent);
  const closed = event(socket, 'disconnect');
  nativeSockets[0]!.emit('administrator_event', { secret: 'never sent' });
  await closed;
  expect(secretEvent).not.toHaveBeenCalled();
  const next = await connected();
  vi.mocked(authorize).mockImplementation(async () => new Promise(() => undefined));
  const bounded = event(next, 'disconnect');
  for (let i = 0; i < 3; i++)
    nativeSockets[1]!.emit('notification_received', { message: { content: 'x'.repeat(40) } });
  await bounded;
});
it('closes at authority expiry and leaves HTTP lifecycle to Nest during shutdown', async () => {
  vi.mocked(authorize).mockImplementation(async () => ({
    ...binding(),
    expiresAt: Date.now() + 35,
  }));
  start({ revalidateMs: 500 });
  const socket = await connected();
  const closed = event(socket, 'disconnect');
  await closed;
  await gateway!.close();
  expect(server.listening).toBe(true);
});
