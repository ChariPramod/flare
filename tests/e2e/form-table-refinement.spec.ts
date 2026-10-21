import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('login links validation errors to inputs and retries unavailable SSO configuration', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/api/auth/config', (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { message: 'Sign-in configuration unavailable' } }
        : { json: { oidc_url: '/sso-provider' } },
    ),
  );
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Retry sign-in options' })).toBeVisible();
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const password = page.getByLabel('Password', { exact: true });
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAccessibleDescription('Enter your password.');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Enter your password.');
  await expect(password).toBeFocused();
  unavailable = false;
  await page.getByRole('button', { name: 'Retry sign-in options' }).click();
  await expect(page.getByRole('link', { name: 'Continue with SSO' })).toHaveAttribute(
    'href',
    '/sso-provider',
  );
  await expect(page.getByRole('button', { name: 'Retry sign-in options' })).toHaveCount(0);
});

test('invitations explain missing tokens and distinguish session outages from signed-out users', async ({
  page,
}) => {
  await page.goto('/invite');
  await expect(page.getByRole('heading', { name: 'Invitation link missing' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation' })).toHaveCount(0);
  let unavailable = true;
  await page.route('**/api/session', (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { message: 'Account service unavailable' } }
        : { status: 401, json: { message: 'Sign in to continue' } },
    ),
  );
  await page.goto('/invite?token=reviewed-invitation');
  await expect(page.getByRole('button', { name: 'Retry account check' })).toBeVisible();
  await expect(page.getByLabel('Create password', { exact: true })).toHaveCount(0);
  unavailable = false;
  await page.getByRole('button', { name: 'Retry account check' }).click();
  await expect(page.getByLabel('Create password', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeEnabled();
});

test('preference retries keep selected choices, lock pending changes and clear stale errors', async ({
  page,
}) => {
  await login(page);
  expect(
    (
      await page.request.post('/api/contacts', {
        headers: { Origin: 'http://localhost:4310' },
        data: { email: 'preferences@example.test', first_name: 'Alex' },
      })
    ).ok(),
  ).toBe(true);
  await page.context().clearCookies();
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/preferences/browser-fixture-link', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Preference save temporarily unavailable' },
      });
    await pending;
    return route.continue();
  });
  await page.goto('/preferences/browser-fixture-link');
  const unsubscribe = page.getByRole('checkbox', { name: /Unsubscribe from all broadcasts/ });
  await unsubscribe.check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Preference save temporarily unavailable',
  );
  await expect(unsubscribe).toBeChecked();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(unsubscribe).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saving preferences…' })).toBeDisabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
  release();
  await expect(page.getByRole('main').getByRole('status')).toHaveText(
    'Your preferences have been saved.',
  );
  await expect(unsubscribe).toBeEnabled();
  await expect(unsubscribe).toBeChecked();
  await page.reload();
  await expect(unsubscribe).toBeChecked();
});

test('table failures have a retry state and background failures retain previously loaded rows', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  let unavailable = true;
  await page.route('**/api/forwarding-rules', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { message: 'Forwarding rules unavailable' } })
      : route.continue(),
  );
  await page.goto('/inbound');
  const panel = page
    .locator('.table-panel')
    .filter({ has: page.getByRole('table', { name: 'Forwarding rules', exact: true }) });
  await expect(panel.getByRole('alert')).toContainText('Forwarding rules unavailable');
  await expect(panel.getByRole('heading', { name: 'Nothing here yet' })).toHaveCount(0);
  unavailable = false;
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(panel.locator('tbody tr')).toHaveCount(25);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  unavailable = true;
  await panel.getByRole('button', { name: 'Refresh Forwarding rules', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('showing previously loaded results');
  await expect(panel.locator('tbody tr')).toHaveCount(25);
});

test('request logs use the server filter without a second misleading local search', async ({
  page,
}) => {
  await login(page);
  await page.goto('/logs');
  const table = page.getByRole('table', { name: 'Request logs', exact: true });
  await expect(table).toBeVisible();
  const panel = page.locator('.table-panel').filter({ has: table });
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search request ID or path' }).fill('/emails');
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === '/api/logs' && url.searchParams.get('q') === '/emails';
  });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await filtered;
  expect(new URL(page.url()).searchParams.get('q')).toBe('/emails');
});

test('one contact search reaches beyond the first server page and explains unmatched queries', async ({
  page,
}) => {
  await login(page);
  const create = async (email: string) => {
    expect(
      (
        await page.request.post('/api/contacts', {
          headers: { Origin: 'http://localhost:4310' },
          data: { email, first_name: email.split('@')[0] },
        })
      ).ok(),
    ).toBe(true);
  };
  const target = 'older-contact@example.test';
  await create(target);
  for (let index = 0; index < 26; index++) await create(`recent-${index}@example.test`);
  await page.goto('/audience/contacts');
  const table = page.getByRole('table', { name: 'Contacts', exact: true });
  const search = page.getByRole('textbox', { name: 'Search contacts', exact: true });
  await expect(search).toHaveCount(1);
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(table.getByRole('link', { name: target, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.getByRole('link', { name: target, exact: true })).toBeVisible();
  const filtered = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === '/api/contacts' &&
      url.searchParams.get('q') === target &&
      url.searchParams.get('page') === '1'
    );
  });
  await search.fill(target);
  await filtered;
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.getByRole('link', { name: target, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await search.fill('no-such-contact');
  await expect(
    page.getByRole('heading', { name: 'No matching results', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing here yet', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear search and show all', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(table.locator('tbody tr')).toHaveCount(25);
});

test('a short-screen dialog keeps its header reachable and cannot dismiss a pending create', async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 390, height: 430 });
  await page.goto('/workflows');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create workflow', exact: true });
  await page.getByLabel('Workflow name', { exact: true }).fill('Pending dialog safety');
  const submit = dialog.getByRole('button', { name: 'Create workflow', exact: true });
  await submit.scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
  await expect(submit).toBeInViewport();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/workflows', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await pending;
    return route.continue();
  });
  await submit.click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  release();
  await expect(
    page.getByRole('heading', { name: 'Pending dialog safety', exact: true }),
  ).toBeVisible();
});
