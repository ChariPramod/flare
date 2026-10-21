import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

function rulesPanel(page: Page) {
  return page.locator('.table-panel').filter({
    has: page.getByRole('table', { name: 'Forwarding rules', exact: true }),
  });
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('table page size restores after loading and browser history preserves independent pages', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/forwarding-rules', async (route) => {
    await ready;
    await route.continue();
  });
  await page.goto('/inbound?page=2&forwarding_page=3&forwarding_page_size=10');
  const panel = rulesPanel(page);
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByLabel('Rows per page')).toHaveValue('10');
  await expect(panel.getByLabel('Rows per page')).toBeDisabled();
  expect(new URL(page.url()).searchParams.get('forwarding_page')).toBe('3');
  release();
  await expect(panel.locator('tbody tr')).toHaveCount(10);
  await expect(panel.getByText('21–30 of 31 loaded results', { exact: true })).toBeVisible();
  await expect(
    panel.getByRole('cell', { name: 'forward-21@example.test', exact: true }),
  ).toBeVisible();

  await panel.getByLabel('Rows per page').selectOption('50');
  await expect(panel.locator('tbody tr')).toHaveCount(31);
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(new URL(page.url()).searchParams.get('forwarding_page_size')).toBe('50');
  expect(new URL(page.url()).searchParams.has('forwarding_page')).toBe(false);
  await page.goBack();
  await expect(panel.getByLabel('Rows per page')).toHaveValue('10');
  await expect(panel.getByText('21–30 of 31 loaded results', { exact: true })).toBeVisible();
  await page.goForward();
  await expect(panel.getByLabel('Rows per page')).toHaveValue('50');
  await expect(panel.locator('tbody tr')).toHaveCount(31);
  await page.reload();
  await expect(panel.getByLabel('Rows per page')).toHaveValue('50');
  await expect(panel.locator('tbody tr')).toHaveCount(31);
  await expect(
    page.getByRole('table', { name: 'Received email', exact: true }).locator('tbody tr'),
  ).toHaveCount(11);
});

test('search distinguishes unmatched queries and clearing restores rows and keyboard focus', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  await page.goto('/inbound?forwarding_page=2&forwarding_page_size=10');
  const panel = rulesPanel(page);
  const search = panel.getByRole('textbox', { name: 'Search forwarding rules…', exact: true });
  await expect(panel.locator('tbody tr')).toHaveCount(10);
  await search.fill('no-such-recipient');
  await expect(panel.getByRole('heading', { name: 'No matching results' })).toBeVisible();
  await expect(panel.getByRole('status')).toHaveText('0 matches from 31 loaded results');
  await expect(panel.getByRole('heading', { name: 'Nothing here yet' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Clear search and show all', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('');
  await expect(panel.locator('tbody tr')).toHaveCount(10);
  await expect(panel.getByText('1–10 of 31 loaded results', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.has('forwarding_q')).toBe(false);
  expect(new URL(page.url()).searchParams.get('forwarding_page_size')).toBe('10');

  await search.fill('forward-31');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel.getByRole('status')).toHaveText('1 match from 31 loaded results');
  await panel.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(panel.locator('tbody tr')).toHaveCount(10);
});

test('empty tables explain the empty state and invalid restored sizes fall back safely', async ({
  page,
}) => {
  await login(page);
  await page.goto('/inbound?forwarding_page=999&forwarding_page_size=-1');
  const panel = rulesPanel(page);
  await expect(panel.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await expect(panel.getByText('Items will appear here once they have been added.')).toBeVisible();
  await expect(panel.getByLabel('Rows per page')).toHaveValue('25');
  await expect(panel.getByText('0–0 of 0 loaded results', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  expect(new URL(page.url()).searchParams.has('forwarding_page')).toBe(false);
});

test('shrinking data clamps a restored page without losing its chosen size', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  let limit = 31;
  await page.route('**/api/forwarding-rules', async (route) => {
    const response = await route.fetch();
    const rows = await response.json();
    await route.fulfill({ response, json: rows.slice(0, limit) });
  });
  await page.goto('/inbound?forwarding_page=4&forwarding_page_size=10');
  const panel = rulesPanel(page);
  await expect(panel.getByText('31–31 of 31 loaded results', { exact: true })).toBeVisible();
  limit = 12;
  await page.reload();
  await expect(panel.locator('tbody tr')).toHaveCount(2);
  await expect(panel.getByText('11–12 of 12 loaded results', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Rows per page')).toHaveValue('10');
  expect(new URL(page.url()).searchParams.get('forwarding_page')).toBe('2');
});

test('remote tables keep local search separate and page controls fit a phone', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/inbound?page=2&forwarding_page_size=10');
  const messages = page
    .locator('.table-panel')
    .filter({ has: page.getByRole('table', { name: 'Received email', exact: true }) });
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  await expect(messages.getByLabel('Rows per page')).toHaveCount(0);
  const initialUrl = page.url();
  await messages
    .getByRole('textbox', { name: 'Search this page…', exact: true })
    .fill('Received 061');
  await expect(messages.getByRole('status')).toHaveText(
    '1 match from 11 loaded results on this page',
  );
  await messages.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  expect(page.url()).toBe(initialUrl);
  await expect(rulesPanel(page).getByLabel('Rows per page')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
