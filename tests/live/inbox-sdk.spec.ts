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
function fixture(phase: 'timezone' | 'cleanup', values: string[]) {
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

test('pinned browser SDK uses the signed Inbox gateway without mutating subscriber timezone', async ({
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
  const operations: { method: string; path: string; status: number }[] = [];
  let bootstrap: { timezone?: string; subscriberKeys: string[]; keys: string[] } | undefined;
  let scheduleHours: unknown;
  let bridgeFailed = false;
  const address = `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g)!.join(':')}`;
  try {
    const before = JSON.parse(fixture('timezone', tenant));
    expect(before.timezone).not.toBe('Pacific/Chatham');
    const access = await json(`/subscribers/${subscriberId}/inbox-token`, headers);
    await page.route(`${baseURL}/acceptance-inbox-sdk`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Inbox SDK acceptance</title>',
      }),
    );
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
    await page.goto(`${baseURL}/acceptance-inbox-sdk`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const outcome = await page.evaluate(
      async (options) => {
        const browser = window as unknown as {
          AcceptanceNovuSdk: { Novu: new (options: Record<string, unknown>) => Sdk };
        };
        const sdk = new browser.AcceptanceNovuSdk.Novu({
          applicationIdentifier: options.applicationIdentifier,
          subscriberHash: options.subscriberHash,
          subscriber: options.subscriberId,
          backendUrl: `${location.origin}/sdk-inbox`,
          socketUrl: location.origin,
          useCache: false,
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
  } finally {
    fixture('cleanup', [...tenant, sessionId, ...hashes]);
  }
});
