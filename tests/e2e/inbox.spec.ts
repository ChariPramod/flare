import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
async function inboxFixture(page: Page, viewer = true) {
  const state = {
    viewer,
    revoked: false,
    binding: true,
    bootstraps: 0,
    reads: 0,
    mutations: 0,
    opened: 0,
    closed: 0,
    accessRevision: 0,
    preferenceWrites: 0,
    preferences: {} as Record<string, boolean>,
    failures: [] as string[],
    delayFeedOnce: undefined as Promise<void> | undefined,
    delayedFeeds: 0,
    delay: undefined as Promise<void> | undefined,
  };
  const sockets = new Set<WebSocketRoute>();
  page.on('pageerror', (error) => state.failures.push(error.message));
  const id = 'browser-inbox-reader';
  const notification = {
    id: 'notification-fixture',
    transactionId: 'transaction-fixture',
    subject: 'Read-only fixture notification',
    body: '<img src="https://untrusted.invalid/image">This stays text.',
    to: { subscriberId: id },
    isRead: false,
    isSeen: false,
    isArchived: false,
    isSnoozed: false,
    createdAt: '2026-10-18T10:00:00Z',
    channelType: 'in_app',
    severity: 'none',
    tags: [],
    data: {},
  };
  await page.route('**/api/session', async (route) => {
    if (state.revoked) return route.fulfill({ status: 401, json: { message: 'Unavailable' } });
    const response = await route.fetch();
    const body = await response.json();
    body.principal.role = state.viewer ? 'viewer' : 'owner';
    body.principal.sessionId = 'b26f1450-619c-44da-9b31-6328b271fd83';
    await route.fulfill({ response, json: body });
  });
  await page.route(`**/api/subscribers/${id}`, (route) =>
    route.fulfill({ json: { subscriber_id: id, profile: { email: 'reader@example.test' } } }),
  );
  await page.route(`**/api/subscribers/${id}/preferences`, (route) => {
    if (route.request().method() === 'PUT') {
      state.preferenceWrites++;
      state.preferences = route.request().postDataJSON().channels;
    }
    return route.fulfill({ json: { global: state.preferences, workflows: [] } });
  });
  await page.route(`**/api/subscribers/${id}/inbox-token`, (route) =>
    route.fulfill({
      json: {
        subscriberId: id,
        subscriberHash: `fixture-not-a-credential-${state.accessRevision}`,
        applicationIdentifier: `fixture-app-${state.accessRevision}`,
        backendUrl: 'http://localhost:4310/novu',
        socketUrl: 'http://localhost:4310',
        socketOptions: {
          socketType: 'self-hosted',
          transports: ['websocket'],
          auth: { flareSessionId: 'b26f1450-619c-44da-9b31-6328b271fd83' },
          reconnectionAttempts: 5,
          timeout: 5000,
        },
      },
    }),
  );
  await page.route('**/novu/v1/inbox/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/session')) {
      state.bootstraps++;
      if (state.delay) await state.delay;
      state.binding = true;
      return route.fulfill({
        status: 201,
        json: {
          data: {
            token: 'fixture.native.token',
            unreadCount: { total: 1, severity: { high: 0, medium: 0, low: 0, none: 1 } },
          },
        },
      });
    }
    if (!state.binding)
      return route.fulfill({ status: 401, json: { message: 'Private fixture detail is hidden' } });
    if (request.method() !== 'GET') {
      state.mutations++;
      return route.fulfill({ json: { data: notification } });
    }
    state.reads++;
    if (url.pathname.endsWith('/count')) {
      const filters = JSON.parse(url.searchParams.get('filters') ?? '[{}]');
      return route.fulfill({
        json: { data: filters.map((filter: Record<string, unknown>) => ({ count: 1, filter })) },
      });
    }
    if (url.pathname.endsWith('/notifications')) {
      if (state.delayFeedOnce) {
        const delay = state.delayFeedOnce;
        state.delayFeedOnce = undefined;
        state.delayedFeeds++;
        await delay;
        return route.fulfill({ status: 401, json: { message: 'Retired fixture response' } });
      }
      return route.fulfill({
        json: { data: [notification], hasMore: false, filter: { archived: false, snoozed: false } },
      });
    }
    return route.fulfill({ json: { data: [] } });
  });
  await page.routeWebSocket('**/socket.io/**', (socket) => {
    state.opened++;
    sockets.add(socket);
    socket.onClose(() => {
      sockets.delete(socket);
      state.closed++;
    });
    socket.onMessage((message) => {
      if (String(message).startsWith('40')) socket.send('40{"sid":"fixture-socket"}');
      if (message === '3') return;
    });
    socket.send(
      '0{"sid":"fixture-engine","upgrades":[],"pingInterval":60000,"pingTimeout":20000,"maxPayload":16384}',
    );
  });
  return { state, sockets, path: `/subscribers/${id}` };
}

test('viewer reads escaped notifications without marking them seen or read', async ({ page }) => {
  const fixture = await inboxFixture(page);
  await login(page);
  await page.goto(fixture.path);
  const inbox = page.getByRole('region', { name: 'In-app Inbox', exact: true });
  await expect(inbox.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  await expect(inbox.getByText('Read-only preview.', { exact: false })).toBeVisible();
  await expect(inbox.getByText('This stays text.', { exact: false })).toBeVisible();
  await expect(inbox.locator('img')).toHaveCount(0);
  await expect(inbox.getByRole('button', { name: /read|seen|archive|preferences/i })).toHaveCount(
    0,
  );
  await expect.poll(() => fixture.state.opened).toBe(1);
  expect(fixture.state.mutations).toBe(0);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect.poll(() => fixture.state.closed).toBe(1);
  expect(fixture.state.mutations).toBe(0);
});

test('lost binding removes stale content and explicit reconnect repeats bootstrap', async ({
  page,
}) => {
  const fixture = await inboxFixture(page);
  await login(page);
  await page.goto(fixture.path);
  await expect(page.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  await expect.poll(() => fixture.state.opened).toBe(1);
  fixture.state.binding = false;
  // The same visibility-resume path revalidates without advancing browser clocks.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(
    page.getByRole('region', { name: 'In-app Inbox', exact: true }).getByRole('alert'),
  ).toContainText('Reconnect to check your access');
  await expect(page.getByText('Read-only fixture notification', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Private fixture detail is hidden')).toHaveCount(0);
  await expect.poll(() => fixture.state.closed).toBe(1);
  await page.getByRole('button', { name: 'Reconnect Inbox', exact: true }).click();
  await expect(page.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  expect(fixture.state.bootstraps).toBe(2);
  await expect.poll(() => fixture.state.opened).toBe(2);
  expect(fixture.state.mutations).toBe(0);
});

test('session revalidation removes the Inbox and closes its socket after revocation', async ({
  page,
}) => {
  const fixture = await inboxFixture(page);
  await login(page);
  await page.goto(fixture.path);
  await expect(page.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  await expect.poll(() => fixture.state.opened).toBe(1);
  fixture.state.revoked = true;
  await expect(page).toHaveURL(/\/login$/, { timeout: 20000 });
  await expect.poll(() => fixture.state.closed).toBe(1);
  await expect(page.getByText('Read-only fixture notification', { exact: true })).toHaveCount(0);
});

test('late bootstrap cannot leave a socket connected after leaving the subscriber', async ({
  page,
}) => {
  const fixture = await inboxFixture(page);
  let release!: () => void;
  fixture.state.delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  await login(page);
  await page.goto(fixture.path);
  await expect.poll(() => fixture.state.bootstraps).toBe(1);
  // The SDK constructor can start before React commits its consumers. Wait for
  // the mounted reader so this exercises cleanup of a committed, pending SDK.
  await expect(page.getByLabel('Read-only notifications')).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  release();
  await expect.poll(() => fixture.state.reads).toBeGreaterThan(0);
  await expect.poll(() => fixture.sockets.size).toBe(0);
  expect(fixture.state.opened).toBe(fixture.state.closed);
});

test('writer keeps the native Inbox and reconnect closes the prior socket', async ({ page }) => {
  const fixture = await inboxFixture(page, false);
  await login(page);
  await page.goto(fixture.path);
  const inbox = page.getByRole('region', { name: 'In-app Inbox', exact: true });
  await expect(inbox.getByText('Opening or updating', { exact: false })).toBeVisible();
  await expect.poll(() => fixture.state.opened).toBe(1);
  await expect(inbox.getByLabel('Read-only notifications')).toHaveCount(0);
  await expect(
    inbox.getByRole('button', { name: 'Open notifications', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Reconnect Inbox', exact: true }).click();
  await expect.poll(() => fixture.state.bootstraps).toBe(2);
  await expect.poll(() => fixture.state.closed).toBe(1);
  await expect.poll(() => fixture.state.opened).toBe(2);
  expect(fixture.state.failures).toEqual([]);
});

test('refreshed access replaces the SDK and closes its old socket without leaving the page', async ({
  page,
}) => {
  const fixture = await inboxFixture(page, false);
  await login(page);
  await page.goto(fixture.path);
  await expect.poll(() => fixture.state.opened).toBe(1);
  fixture.state.accessRevision++;
  // A normal preferences update invalidates access in the same session/scope.
  // No reconnect/remount navigation is used to hide an in-place SDK leak.
  await page.getByRole('checkbox', { name: 'Global email', exact: true }).click();
  await expect.poll(() => fixture.state.preferenceWrites).toBe(1);
  await expect(page.getByRole('checkbox', { name: 'Global email', exact: true })).not.toBeChecked();
  await expect.poll(() => fixture.state.bootstraps).toBe(2);
  await expect.poll(() => fixture.state.closed).toBe(1);
  await expect.poll(() => fixture.state.opened).toBe(2);
  await expect(page.getByRole('button', { name: 'Open notifications', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect.poll(() => fixture.state.closed).toBe(2);
  expect(fixture.state.failures).toEqual([]);
});

test('a retired reader response cannot fail the newly connected Inbox', async ({ page }) => {
  const fixture = await inboxFixture(page);
  let release!: () => void;
  fixture.state.delayFeedOnce = new Promise<void>((resolve) => {
    release = resolve;
  });
  await login(page);
  await page.goto(fixture.path);
  await expect.poll(() => fixture.state.delayedFeeds).toBe(1);
  await expect.poll(() => fixture.state.opened).toBe(1);
  await page.getByRole('button', { name: 'Reconnect Inbox', exact: true }).click();
  const inbox = page.getByRole('region', { name: 'In-app Inbox', exact: true });
  await expect(inbox.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  await expect.poll(() => fixture.state.opened).toBe(2);
  const retiredResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith('/notifications') && response.status() === 401,
  );
  release();
  await (await retiredResponse).finished();
  // Let the queued SDK error and React render settle after the old response.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(inbox.getByText('Read-only fixture notification', { exact: true })).toBeVisible();
  await expect(inbox.getByRole('alert')).toHaveCount(0);
  expect(fixture.state.bootstraps).toBe(2);
  expect(fixture.sockets.size).toBe(1);
  expect(fixture.state.mutations).toBe(0);
});
