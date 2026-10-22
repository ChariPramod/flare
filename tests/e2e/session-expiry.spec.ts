import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh overview' })).toBeEnabled();
}

const expired = { status: 401, json: { message: 'Sign in to continue' } };

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('a rejected workspace query confirms expiry and returns to sign-in without a loop', async ({
  page,
}) => {
  await login(page);
  let confirmations = 0;
  await page.route('**/api/session', (route) => {
    confirmations++;
    return route.fulfill(expired);
  });
  await page.route('**/api/domains', (route) => route.fulfill(expired));
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByRole('status')).toContainText('Your session has ended');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  expect(confirmations).toBe(1);
  await page.unroute('**/api/session');
  await page.unroute('**/api/domains');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
});

test('an independent service rejection preserves a valid session and remains recoverable', async ({
  page,
}) => {
  await login(page);
  let confirmations = 0;
  await page.route('**/api/session', (route) => {
    confirmations++;
    return route.continue();
  });
  await page.route('**/api/domains', (route) => route.fulfill(expired));
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page.getByRole('region', { name: 'Sender readiness' })).toContainText('unavailable');
  await expect.poll(() => confirmations).toBeGreaterThan(0);
  await expect(page).toHaveURL(/\/overview$/);
  await page.unroute('**/api/domains');
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page.getByRole('region', { name: 'Sender readiness' })).not.toContainText(
    'unavailable',
  );
});

test('a direct workspace-switch mutation also confirms an expired session', async ({ page }) => {
  await login(page);
  await page.route('**/api/session', (route) => route.fulfill(expired));
  await page.route('**/api/session/switch', (route) => route.fulfill(expired));
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByRole('status')).toContainText('Your session has ended');
});

test('a rejected inbound download grant confirms expiry without starting a download', async ({
  page,
  request,
}) => {
  const fixture = await (
    await request.post('http://127.0.0.1:4311/fixtures/large-transfers')
  ).json();
  await page.route('**/api/browser-transfer-config', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await login(page);
  await page.goto(`/inbound/${fixture.id}`);
  await expect(
    page.getByRole('heading', { name: 'Large incoming message', exact: true }),
  ).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: 'Large incoming body' })).toBeVisible();
  const operations: string[] = [];
  let confirmations = 0;
  let downloads = 0;
  page.on('download', () => {
    downloads++;
  });
  await page.route('**/api/browser-transfers', (route) => {
    operations.push(route.request().postDataJSON().operation);
    return route.fulfill(expired);
  });
  await page.route('**/api/session', (route) => {
    confirmations++;
    return route.fulfill(expired);
  });
  await page.getByRole('button', { name: 'Download original MIME', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByRole('status')).toContainText('Your session has ended');
  expect(operations).toEqual(['inbound.raw']);
  expect(confirmations).toBe(1);
  expect(downloads).toBe(0);
});

test('a failed login shows its own error without an expiry notice or session probe', async ({
  page,
}) => {
  let probes = 0;
  await page.route('**/api/session', (route) => {
    probes++;
    return route.fulfill(expired);
  });
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page
      .getByRole('main')
      .getByRole('alert')
      .filter({ hasText: /^Invalid credentials$/ }),
  ).toBeVisible();
  await expect(page.getByText('Your session has ended', { exact: false })).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
  expect(probes).toBe(0);
});
