import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Native credentials must never be retained in traces or DOM/image artifacts.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
const diagnostics = new WeakMap<
  Page,
  {
    operations: { operation: string; method: string; status: number }[];
    pageErrors: number;
    failedRequests: number;
  }
>();
test.beforeEach(async ({ page }) => {
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
  const metadata = {
    operations: [] as { operation: string; method: string; status: number }[],
    pageErrors: 0,
    failedRequests: 0,
  };
  diagnostics.set(page, metadata);
  page.on('pageerror', () => metadata.pageErrors++);
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.startsWith('/novu/v1/inbox/')) metadata.failedRequests++;
  });
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    const operation =
      path === '/novu/v1/inbox/session'
        ? 'session'
        : path === '/novu/v1/inbox/notifications'
          ? 'list'
          : path.endsWith('/count')
            ? 'count'
            : path.endsWith('/seen')
              ? 'seen'
              : path.endsWith('/read')
                ? 'read'
                : path.endsWith('/unread')
                  ? 'unread'
                  : undefined;
    if (path.startsWith('/novu/v1/inbox/') && operation && metadata.operations.length < 100)
      metadata.operations.push({
        operation,
        method: response.request().method(),
        status: response.status(),
      });
  });
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const path = info.outputPath('inbox-operation-metadata.json');
    await writeFile(path, JSON.stringify(diagnostics.get(page)), { mode: 0o600 });
    await info.attach('inbox-operation-metadata', {
      path,
      contentType: 'application/json',
    });
  }
});

test('live subscriber Inbox renders native delivery and persists read state', async ({ page }) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires the disposable native Inbox fixture');
  const subscriberId = 'acceptance-inbox-reader';
  const body = 'Acceptance inbox notification delivered by Novu';
  await page.goto('/login');
  await page.getByLabel('Work email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const initialized = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/novu/v1/inbox/session' &&
      response.request().method() === 'POST',
  );
  await page.goto(`/subscribers/${subscriberId}`);
  const response = await initialized;
  expect(response.status(), 'Authenticated Inbox session').toBe(201);
  const envelope = await response.json();
  const session = envelope.data ?? envelope;
  expect(typeof session.token).toBe('string');
  const origin = new URL(page.url()).origin;
  const headers = { Authorization: `Bearer ${session.token}`, Origin: origin };
  const feed = async () => {
    const result = await page.request.get('/novu/v1/inbox/notifications?limit=100', { headers });
    expect(result.status()).toBe(200);
    const payload = await result.json();
    return (payload.data?.data ?? payload.data) as Array<{
      id: string;
      body: string;
      isRead: boolean;
    }>;
  };
  const notification = (await feed()).find((item) => item.body === body)!;
  expect(notification).toBeDefined();
  expect(notification.isRead).toBe(false);
  await page
    .locator('.inbox-panel')
    .getByRole('button', { name: 'Open notifications', exact: true })
    .click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  // The SDK/recovery acceptance tests can add newer notifications for this
  // subscriber. Reach the original delivery through the Inbox's scroll list.
  await page.getByText(body, { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText(body, { exact: true })).toBeInViewport();
  const [marked] = await Promise.all([
    page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === `/novu/v1/inbox/notifications/${notification.id}/read` &&
        result.request().method() === 'PATCH',
    ),
    page.getByText(body, { exact: true }).click(),
  ]);
  expect(marked.status()).toBe(200);
  await expect
    .poll(async () => (await feed()).find((item) => item.id === notification.id)?.isRead)
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In-app Inbox' })).toBeVisible();
  expect((await feed()).find((item) => item.id === notification.id)?.isRead).toBe(true);

  const accessResult = await page.request.get(`/api/subscribers/${subscriberId}/inbox-token`);
  expect(accessResult.status()).toBe(200);
  const access = await accessResult.json();
  const tampered = await page.request.post('/novu/v1/inbox/session', {
    headers: { Origin: origin },
    data: {
      applicationIdentifier: access.applicationIdentifier,
      subscriberHash: '0'.repeat(64),
      subscriber: { subscriberId },
    },
  });
  expect(tampered.status()).toBe(403);
  const wrongOrigin = await page.request.patch(
    `/novu/v1/inbox/notifications/${notification.id}/unread`,
    {
      headers: { ...headers, Origin: 'https://untrusted.invalid' },
    },
  );
  expect(wrongOrigin.status()).toBe(403);
  expect((await feed()).find((item) => item.id === notification.id)?.isRead).toBe(true);
});
