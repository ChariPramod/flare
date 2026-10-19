import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { signDashboardForwarding } from '../../packages/shared/src/dashboard-forwarding.js';

// The SDK necessarily sees its native credentials. Never retain them in browser artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off', timezoneId: 'Pacific/Chatham' });
const apiOrigin = 'http://127.0.0.1:4000';
const subscriberId = 'acceptance-inbox-reader';
const body = 'Acceptance inbox notification delivered by Novu';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for disposable Inbox SDK acceptance`);
  return value;
}
function fixture(phase: 'timezone' | 'binding-loss' | 'revoke' | 'cleanup', values: string[]) {
  const directory = required('E2E_ACCEPTANCE_DIRECTORY');
  const project = required('E2E_ACCEPTANCE_PROJECT');
  if (
    !basename(directory).startsWith('flare-acceptance-') ||
    !/^flare-acceptance-\d+-\d+$/.test(project)
  )
    throw new Error('Inbox SDK inspection requires the disposable Compose project');
  try {
    return execFileSync(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '--project-directory',
        directory,
        '--env-file',
        join(directory, '.env'),
        '-f',
        join(directory, 'docker-compose.yml'),
        '-f',
        join(directory, 'docker-compose.acceptance.yml'),
        'exec',
        '-T',
        'flare-api',
        'node',
        'scripts/acceptance/inbox-sdk-state.mjs',
        phase,
        ...values,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 30000 },
    ).trim();
  } catch {
    throw new Error(`Disposable Inbox SDK ${phase} operation failed`);
  }
}
async function json(path: string, headers: Record<string, string>, data?: unknown) {
  const response = await fetch(`${apiOrigin}/v1${path}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Inbox SDK fixture request failed with ${response.status}`);
  return response.json();
}

type Schedule = {
  isEnabled?: boolean;
  weeklySchedule?: Record<string, { isEnabled: boolean; hours?: { start: string; end: string }[] }>;
};
type Notification = { id: string; body: string; isRead: boolean };
type Result<T> = Promise<{ data?: T; error?: unknown }>;
type Sdk = {
  on(
    name: string,
    listener: (event: { error?: unknown; result?: Notification }) => void,
  ): () => void;
  socket: { connect(): Promise<{ error?: unknown }>; disconnect(): Promise<{ error?: unknown }> };
  notifications: {
    list(
      options?: Record<string, unknown>,
    ): Result<{ notifications: Notification[]; hasMore: boolean }>;
    count(options?: Record<string, unknown>): Result<{ counts: { count: number }[] }>;
    read(options: { notificationId: string }): Result<Notification>;
    unread(options: { notificationId: string }): Result<Notification>;
  };
  preferences: {
    list(): Result<unknown[]>;
    schedule: { get(): Result<Schedule>; update(value: Schedule): Result<Schedule> };
  };
};
type BrowserSdk = {
  AcceptanceNovuSdk: { Novu: new (options: Record<string, unknown>) => Sdk };
  acceptanceInbox: {
    sdk: Sdk;
    options: Record<string, unknown>;
    connections: number;
    failures: number;
    failureReasons: string[];
    received: string[];
  };
};

test('pinned browser SDK uses signed Inbox HTTP and live authorized sockets with recovery', async ({
  page,
  baseURL,
}) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires the disposable API and pinned native Novu');
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
  const secret = required('E2E_DASHBOARD_PROXY_SECRET');
  expect(baseURL).toBe('http://127.0.0.1:3000');
  const webRequire = createRequire(resolve('apps/web/package.json'));
  const sdkRequire = createRequire(webRequire.resolve('@novu/react'));
  const sdkRoot = resolve(dirname(sdkRequire.resolve('@novu/js')), '../..');
  expect(JSON.parse(readFileSync(join(sdkRoot, 'package.json'), 'utf8')).version).toBe('3.19.0');
  // Bundle the installed public ESM entry, as Next does. The package's separate UMD
  // artifact contains unresolved PACKAGE_NAME globals and is not the app's entry point.
  const { build } = createRequire(webRequire.resolve('tsx'))('esbuild');
  const bundle = await build({
    entryPoints: [join(sdkRoot, 'dist/esm/index.mjs')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'AcceptanceNovuSdk',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });

  const login = await json(
    '/auth/login',
    {},
    {
      email: required('E2E_EMAIL'),
      password: required('E2E_PASSWORD'),
    },
  );
  const org = login.organizations[0];
  const environment = org.environments.find(
    (entry: { name: string }) => entry.name === 'Development',
  );
  const sessionId = JSON.parse(Buffer.from(login.token.split('.')[1], 'base64url').toString()).jti;
  const tenant = [org.id, environment.id];
  const headers: Record<string, string> = {
    Authorization: `Bearer ${login.token}`,
    'x-org-id': org.id,
    'x-environment-id': environment.id,
  };
  const hashes = new Set<string>();
  let controlSessionId: string | undefined;
  const operations: { method: string; path: string; status: number }[] = [];
  let bootstrap: { timezone?: string; subscriberKeys: string[]; keys: string[] } | undefined;
  let scheduleHours: unknown;
  let bridgeFailed = false;
  let closedSockets = 0;
  const closeSockets: (() => Promise<void>)[] = [];
  const handshakes: { keys: string[]; validToken: boolean }[] = [];
  const address = `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g)!.join(':')}`;
  try {
    const before = JSON.parse(fixture('timezone', tenant));
    expect(before.timezone).not.toBe('Pacific/Chatham');
    const access = await json(`/subscribers/${subscriberId}/inbox-token`, headers);
    expect(access.socketOptions?.socketType).toBe('self-hosted');
    await page.routeWebSocket('ws://127.0.0.1:4000/socket.io/**', (socket) => {
      const query = new URL(socket.url()).searchParams;
      handshakes.push({
        keys: [...query.keys()].sort(),
        validToken: /^[\w-]+\.[\w-]+\.[\w-]+$/.test(query.get('token') ?? ''),
      });
      const server = socket.connectToServer();
      server.onClose(async () => {
        closedSockets++;
        await socket.close({ code: 1000 });
      });
      socket.onClose(async () => {
        await server.close({ code: 1000 });
      });
      closeSockets.push(async () => {
        await Promise.all([
          socket.close({ code: 1001, reason: 'Disposable transport interruption' }),
          server.close({ code: 1001, reason: 'Disposable transport interruption' }),
        ]);
      });
    });
    await page.route(`${baseURL}/sdk-inbox/v1/inbox/**`, async (route) => {
      const request = route.request();
      try {
        const url = new URL(request.url());
        const nativePath = url.pathname.slice('/sdk-inbox/v1/inbox/'.length);
        const target = `/v1/dashboard/inbox/${nativePath}${url.search}`;
        const encoded = request.postDataBuffer() ?? undefined;
        const incoming = request.headers();
        // The bridge changes transport authority only. SDK bytes and query strings stay intact.
        const forwarded = {
          ...headers,
          'Content-Type': incoming['content-type']!,
          ...(incoming.authorization
            ? { 'x-flare-inbox-authorization': incoming.authorization }
            : {}),
        };
        if (nativePath === 'session') {
          const payload = request.postDataJSON();
          bootstrap = {
            timezone: payload.subscriber.timezone,
            subscriberKeys: Object.keys(payload.subscriber).sort(),
            keys: Object.keys(payload).sort(),
          };
        }
        if (nativePath === 'preferences' && request.method() === 'PATCH')
          scheduleHours ??= request.postDataJSON()?.schedule?.weeklySchedule?.monday?.hours;
        const response = await fetch(`${apiOrigin}${target}`, {
          method: request.method(),
          headers: {
            ...forwarded,
            ...signDashboardForwarding(
              secret,
              { method: request.method(), target, body: encoded, headers: forwarded },
              address,
            ),
          },
          body: encoded,
          redirect: 'error',
          signal: AbortSignal.timeout(20000),
        });
        const encodedResponse = Buffer.from(await response.arrayBuffer());
        operations.push({
          method: request.method(),
          path: `${nativePath}${url.search}`,
          status: response.status,
        });
        if (nativePath === 'session' && response.ok) {
          const payload = JSON.parse(encodedResponse.toString());
          hashes.add(
            createHash('sha256')
              .update((payload.data ?? payload).token)
              .digest('hex'),
          );
        }
        await route.fulfill({
          status: response.status,
          contentType: 'application/json',
          body: encodedResponse,
        });
      } catch {
        bridgeFailed = true;
        await route.abort('failed');
      }
    });
    // Obtain the real loopback document origin before replacing its contents.
    // A fulfilled synthetic navigation has no network address-space evidence:
    // Chromium blocks its real sockets with Local Network Access checks.
    await page.goto(`${baseURL}/login`);
    await page.setContent('<!doctype html><title>Inbox SDK acceptance</title>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const outcome = await page.evaluate(
      async (options) => {
        const browser = window as unknown as BrowserSdk;
        const config = {
          applicationIdentifier: options.applicationIdentifier,
          subscriberHash: options.subscriberHash,
          subscriber: options.subscriberId,
          backendUrl: `${location.origin}/sdk-inbox`,
          socketUrl: options.socketUrl,
          socketOptions: options.socketOptions,
          useCache: false,
        };
        const sdk = new browser.AcceptanceNovuSdk.Novu(config);
        const state = {
          sdk,
          options: config,
          connections: 0,
          failures: 0,
          failureReasons: [] as string[],
          received: [] as string[],
        };
        browser.acceptanceInbox = state;
        sdk.on('socket.connect.resolved', (event) => {
          if (event.error) {
            state.failures++;
            const message =
              typeof event.error === 'object' && event.error && 'message' in event.error
                ? String(event.error.message)
                : '';
            state.failureReasons.push(
              ['Inbox socket access unavailable', 'websocket error', 'timeout'].includes(message)
                ? message
                : 'unknown socket failure',
            );
          } else state.connections++;
        });
        sdk.on('notifications.notification_received', (event) => {
          if (typeof event.result?.body === 'string') state.received.push(event.result.body);
        });
        async function value<T>(result: Result<T>, label: string): Promise<T> {
          try {
            const response = await result;
            if (response.error || response.data === undefined) throw new Error();
            return response.data;
          } catch {
            throw new Error(`Browser SDK ${label} failed`);
          }
        }
        function restoredState(condition: boolean, label: string) {
          if (!condition) throw new Error(`Browser SDK ${label} restoration did not persist`);
        }
        const first = await value(sdk.notifications.list(), 'default list');
        const displayed = await value(
          sdk.notifications.list({ archived: false, snoozed: false, data: {} }),
          'UI list',
        );
        const notification = first.notifications.find((item) => item.body === options.body);
        if (!notification) throw new Error('Browser SDK did not receive the existing notification');
        const originalSchedule = await value(sdk.preferences.schedule.get(), 'schedule read');
        const restoreSchedule = {
          isEnabled: originalSchedule.isEnabled ?? false,
          weeklySchedule: originalSchedule.weeklySchedule ?? {},
        };
        const counts = await value(
          sdk.notifications.count({
            filters: [
              {
                read: false,
                archived: false,
                snoozed: false,
                severity: ['high', 'medium', 'low', 'none'],
              },
              { archived: false, snoozed: false },
            ],
          }),
          'filtered counts',
        );
        const preferences = await value(sdk.preferences.list(), 'preferences');
        try {
          const read = await value(
            sdk.notifications.read({ notificationId: notification.id }),
            'read',
          );
          const persisted = await value(sdk.notifications.list(), 'persisted read');
          if (
            !read.isRead ||
            !persisted.notifications.find((item) => item.id === notification.id)?.isRead
          )
            throw new Error('Browser SDK read did not persist');
          await value(
            sdk.preferences.schedule.update({
              isEnabled: false,
              weeklySchedule: {
                monday: { isEnabled: true, hours: [{ start: '09:00 AM', end: '05:00 PM' }] },
              },
            }),
            'UI schedule update',
          );
          const schedule = await value(sdk.preferences.schedule.get(), 'persisted UI schedule');
          return {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            listCount: first.notifications.length,
            uiContainsNotification: displayed.notifications.some(
              (item) => item.id === notification.id,
            ),
            hasMore: first.hasMore,
            counts: counts.counts.map((entry) => entry.count),
            preferencesCount: preferences.length,
            hours: schedule.weeklySchedule?.monday?.hours,
          };
        } finally {
          try {
            await value(sdk.preferences.schedule.update(restoreSchedule), 'schedule restoration');
            const restored = await value(sdk.preferences.schedule.get(), 'restored schedule');
            restoredState(
              (restored.isEnabled ?? false) === restoreSchedule.isEnabled &&
                JSON.stringify(restored.weeklySchedule ?? {}) ===
                  JSON.stringify(restoreSchedule.weeklySchedule),
              'schedule',
            );
          } finally {
            await value(
              sdk.notifications[notification.isRead ? 'read' : 'unread']({
                notificationId: notification.id,
              }),
              'read restoration',
            );
            const restored = await value(sdk.notifications.list(), 'restored read state');
            restoredState(
              restored.notifications.find((item) => item.id === notification.id)?.isRead ===
                notification.isRead,
              'read state',
            );
          }
        }
      },
      {
        applicationIdentifier: access.applicationIdentifier,
        subscriberHash: access.subscriberHash,
        socketOptions: access.socketOptions,
        socketUrl: apiOrigin,
        subscriberId,
        body,
      },
    );

    expect(bridgeFailed).toBe(false);
    expect(bootstrap).toEqual({
      timezone: outcome.timezone,
      subscriberKeys: ['subscriberId', 'timezone'],
      keys: ['applicationIdentifier', 'subscriber', 'subscriberHash'],
    });
    expect(outcome.timezone).toBe('Pacific/Chatham');
    expect(outcome.listCount).toBeGreaterThan(0);
    expect(outcome.uiContainsNotification).toBe(true);
    expect(typeof outcome.hasMore).toBe('boolean');
    expect(outcome.counts).toHaveLength(2);
    expect(outcome.counts.every((count) => Number.isInteger(count) && count >= 0)).toBe(true);
    expect(outcome.preferencesCount).toBeGreaterThan(0);
    expect(scheduleHours).toEqual([{ start: '09:00 AM', end: '05:00 PM' }]);
    expect(outcome.hours).toEqual(scheduleHours);
    expect(operations.every((operation) => operation.status >= 200 && operation.status < 300)).toBe(
      true,
    );
    expect(operations.some((operation) => operation.path === 'notifications?limit=10')).toBe(true);
    expect(
      operations.some((operation) => operation.path.startsWith('notifications/count?filters=')),
    ).toBe(true);
    expect(operations.some((operation) => operation.path === 'preferences/global')).toBe(true);
    expect(JSON.parse(fixture('timezone', tenant))).toEqual(before);

    // These are real native worker events, not mocked socket messages. The Node
    // bridge above signs HTTP only; Chromium opens the persistent API socket itself.
    const workflowId = `acceptance-inbox-socket-${randomBytes(8).toString('hex')}`;
    const liveBody = `Live gateway event ${workflowId}`;
    await json('/workflows', headers, {
      workflowId,
      name: 'Disposable live Inbox socket',
      steps: [
        {
          stepId: 'inbox',
          name: 'Inbox delivery',
          type: 'in_app',
          controlValues: { body: liveBody },
        },
      ],
    });
    const received = () =>
      page.evaluate(
        (value) =>
          (window as unknown as BrowserSdk).acceptanceInbox.received.filter(
            (entry) => entry === value,
          ).length,
        liveBody,
      );
    async function deliver(using = headers) {
      const run = await json('/events/trigger', using, { name: workflowId, to: subscriberId });
      await expect
        .poll(async () => (await json(`/activity/${run.ids[0]}`, using)).status)
        .toBe('accepted');
    }
    await page.waitForFunction(() => {
      const s = (window as unknown as BrowserSdk).acceptanceInbox;
      return s.connections > 0 || s.failures > 0;
    });
    const connected = await page.evaluate(() => {
      const { connections, failures, failureReasons } = (window as unknown as BrowserSdk)
        .acceptanceInbox;
      return { connections, failures, failureReasons };
    });
    expect({ ...connected, handshakes }).toEqual({
      connections: 1,
      failures: 0,
      failureReasons: [],
      handshakes: [{ keys: ['EIO', 'token', 'transport'], validToken: true }],
    });
    await deliver();
    await expect.poll(received).toBe(1);

    // Interrupt the actual browser transport. The pinned SDK's bounded automatic
    // reconnect must obtain current authority again before native events resume.
    await closeSockets[0]!();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as BrowserSdk).acceptanceInbox.connections),
      )
      .toBe(2);
    await deliver();
    await expect.poll(received).toBe(2);

    const beforeLoss = closedSockets;
    fixture('binding-loss', [...tenant, sessionId, ...hashes]);
    await expect.poll(() => closedSockets, { timeout: 10000 }).toBeGreaterThan(beforeLoss);
    await page.evaluate(async () => {
      const { sdk } = (window as unknown as BrowserSdk).acceptanceInbox;
      await sdk.socket.disconnect();
      await sdk.socket.connect();
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as BrowserSdk).acceptanceInbox.failures))
      .toBe(1);
    expect(await received()).toBe(2);

    // A new SDK instance repeats signed HTTP bootstrap. Reconnecting only the old
    // native token cannot recreate a lost Flare authority binding.
    const bootstraps = operations.filter((operation) => operation.path === 'session').length;
    await page.evaluate(async () => {
      const browser = window as unknown as BrowserSdk;
      const state = browser.acceptanceInbox;
      await state.sdk.socket.disconnect();
      state.sdk = new browser.AcceptanceNovuSdk.Novu(state.options);
      state.sdk.on('socket.connect.resolved', (event) => {
        if (event.error) state.failures++;
        else state.connections++;
      });
      state.sdk.on('notifications.notification_received', (event) => {
        if (typeof event.result?.body === 'string') state.received.push(event.result.body);
      });
      const feed = await state.sdk.notifications.list();
      if (feed.error || !feed.data) throw new Error('Fresh signed Inbox bootstrap failed');
    });
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as BrowserSdk).acceptanceInbox.connections),
      )
      .toBe(3);
    expect(operations.filter((operation) => operation.path === 'session').length).toBe(
      bootstraps + 1,
    );
    await deliver();
    await expect.poll(received).toBe(3);

    const control = await json(
      '/auth/login',
      {},
      { email: required('E2E_EMAIL'), password: required('E2E_PASSWORD') },
    );
    controlSessionId = JSON.parse(
      Buffer.from(control.token.split('.')[1], 'base64url').toString(),
    ).jti;
    const controlHeaders = { ...headers, Authorization: `Bearer ${control.token}` };
    const beforeRevocation = closedSockets;
    fixture('revoke', [...tenant, sessionId]);
    await expect.poll(() => closedSockets, { timeout: 10000 }).toBeGreaterThan(beforeRevocation);
    await deliver(controlHeaders);
    expect(await received()).toBe(3);
    await page.evaluate(async () => {
      const { sdk } = (window as unknown as BrowserSdk).acceptanceInbox;
      const result = await sdk.notifications.list();
      if (!result.error) throw new Error('Revoked Flare session retained native feed access');
      await sdk.socket.disconnect();
    });
    expect(bridgeFailed).toBe(false);
  } finally {
    if (controlSessionId) fixture('cleanup', [...tenant, controlSessionId]);
    fixture('cleanup', [...tenant, sessionId, ...hashes]);
  }
});
