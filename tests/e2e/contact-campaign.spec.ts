import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';

const headers = { Origin: 'http://localhost:4310' };
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
async function openImport(page: Page) {
  await page.goto('/audience/contacts');
  await page.getByRole('button', { name: 'Import contacts', exact: true }).click();
  return page.getByRole('dialog', { name: 'Import contacts', exact: true });
}
async function upload(page: Page, name: string, text: string, mimeType = 'text/plain') {
  await page
    .getByLabel('Contact file', { exact: true })
    .setInputFiles({ name, mimeType, buffer: Buffer.from(text) });
  await expect(page.getByRole('button', { name: 'Review import', exact: true })).toBeEnabled();
}
async function createContact(page: Page, email: string, extra: Record<string, unknown> = {}) {
  const response = await page.request.post('/api/contacts', { headers, data: { email, ...extra } });
  expect(response.ok()).toBe(true);
}
async function writeCampaign(page: Page, name = 'Product news') {
  await page.getByLabel('Campaign name', { exact: true }).fill(name);
  await page.getByLabel('From address', { exact: true }).fill('news@example.test');
  await page.getByLabel('Email subject', { exact: true }).fill('Hello {{first_name}}');
  await page
    .getByLabel('Email HTML', { exact: true })
    .fill(
      '<h1>Hello {{first_name}}</h1><p>A useful update.</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
    );
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('reviews multi-format imports, preserves opt-outs and creates a campaign for exactly the imported list', async ({
  page,
}) => {
  await login(page);
  await createContact(page, 'opted-out@example.test', {
    unsubscribed: true,
    first_name: 'Existing',
  });
  await createContact(page, 'outside-list@example.test');
  const dialog = await openImport(page);
  await upload(
    page,
    'invalid.json',
    JSON.stringify([{ email: 'not-an-address', first_name: 'Invalid' }]),
    'application/json',
  );
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Correct the file');
  await expect(dialog.getByRole('button', { name: 'Import contacts', exact: true })).toBeDisabled();
  expect((await (await page.request.get('/api/contacts')).json()).data).toHaveLength(2);
  await upload(
    page,
    'Product subscribers.tsv',
    'Email\tFirst Name\tUnsubscribed\nopted-out@example.test\tExisting\tfalse\nnew@example.test\tNew\tfalse\nNEW@example.test\tNewest\tfalse',
  );
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Import review' })).toContainText(
    'duplicate rows',
  );
  await dialog.getByRole('button', { name: 'Import contacts', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Contacts are ready' })).toBeVisible();
  await expect(dialog).toContainText('2 contacts saved');
  const listId = new URL(
    (await dialog
      .getByRole('link', { name: 'Create campaign', exact: true })
      .getAttribute('href')) ?? '',
    'http://localhost:4310',
  ).searchParams.get('list_id');
  expect(listId).toBeTruthy();
  const imported = await (await page.request.get(`/api/contacts?list_id=${listId}`)).json();
  expect(imported.data).toHaveLength(2);
  expect(
    imported.data.find((contact: { email: string }) => contact.email === 'opted-out@example.test')
      .unsubscribed,
  ).toBe(true);
  await dialog.getByRole('link', { name: 'Create campaign', exact: true }).click();
  const composer = page.getByRole('dialog', { name: 'Create campaign', exact: true });
  await expect(composer.getByLabel('Target contact list')).toHaveValue(listId!);
  await writeCampaign(page);
  await composer.getByRole('button', { name: 'Preview email', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Campaign email preview"]')
      .getByRole('heading', { name: 'Hello Alex' }),
  ).toBeVisible();
  await composer.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product news', exact: true })).toBeVisible();
  const review = page.getByRole('region', { name: 'Campaign audience' });
  await expect(review).toContainText('1 unsubscribed');
  await expect(review).toContainText('new@example.test');
  await expect(review).not.toContainText('outside-list@example.test');
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('draft');
  await page.getByRole('button', { name: 'Review and send now', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1 contact is currently eligible');
  // Opening review is not sending; the explicit confirmation remains necessary.
  await page.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('draft');
  await page.getByLabel('Delivery timing').selectOption('later');
  const future = new Date(Date.now() + 7200000);
  await page
    .getByLabel('Send date and time')
    .fill(
      new Date(future.getTime() - future.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    );
  await page.getByRole('button', { name: 'Review schedule', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('scheduled');
});

test('import failure retains file, mapping and list choices for retry at a mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const dialog = await openImport(page);
  await upload(page, 'People.csv', 'Address,Given\nperson@example.test,Person', 'text/csv');
  await dialog.getByLabel('Map Address', { exact: true }).selectOption('email');
  await dialog.getByLabel('Map Given', { exact: true }).selectOption('first_name');
  await dialog.getByLabel('List name', { exact: true }).fill('Launch group');
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  let fail = true;
  await page.route('**/api/contacts/import', (route) =>
    fail
      ? route.fulfill({ status: 503, json: { message: 'Import temporarily unavailable' } })
      : route.continue(),
  );
  await dialog.getByRole('button', { name: 'Import contacts', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Import temporarily unavailable');
  await expect(dialog.getByLabel('Map Address')).toHaveValue('email');
  await expect(dialog.getByLabel('List name')).toHaveValue('Launch group');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Import contacts', exact: true }).click();
  await expect(dialog.getByLabel('List name')).toHaveValue('Launch group');
  fail = false;
  await dialog.getByRole('button', { name: 'Import contacts', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Contacts are ready' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});

test('campaign retry after a lost response reuses its intent across closing and reopening the editor', async ({
  page,
}) => {
  await login(page);
  await createContact(page, 'reader@example.test');
  await page.goto('/broadcasts');
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await writeCampaign(page, 'One campaign only');
  let lost = true;
  const keys: (string | undefined)[] = [];
  await page.route('**/api/broadcasts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    if (!lost) return route.continue();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ status: 503, json: { message: 'The response was interrupted' } });
  });
  await page.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'response was interrupted',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  await expect(page.getByLabel('Campaign name', { exact: true })).toHaveValue('One campaign only');
  lost = false;
  await page.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'One campaign only', exact: true })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(await (await page.request.get('/api/broadcasts')).json()).toHaveLength(1);
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByRole('button', { name: 'Write email', exact: true }).click();
  await page.getByLabel('Email subject', { exact: true }).fill('New subject preserved');
  await page.getByRole('button', { name: 'Use saved template', exact: true }).click();
  await page.getByRole('button', { name: 'Write email', exact: true }).click();
  await expect(page.getByLabel('Email subject', { exact: true })).toHaveValue(
    'New subject preserved',
  );
  await page.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await page.getByRole('button', { name: 'Write email', exact: true }).click();
  await expect(page.getByLabel('Email subject', { exact: true })).toHaveValue(
    'New subject preserved',
  );
});

test('Excel import previews the chosen worksheet and imports only that sheet', async ({ page }) => {
  const { Workbook } = createRequire(`${process.cwd()}/packages/platform/package.json`)(
    'exceljs',
  ) as {
    Workbook: new () => {
      addWorksheet: (name: string) => { addRows: (rows: string[][]) => void };
      xlsx: { writeBuffer: () => Promise<ArrayBuffer> };
    };
  };
  const book = new Workbook();
  book.addWorksheet('Notes').addRows([['Note'], ['Use the Customers worksheet']]);
  book.addWorksheet('Customers').addRows([
    ['Email', 'First Name'],
    ['excel@example.test', 'Excel'],
  ]);
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  await login(page);
  const dialog = await openImport(page);
  await page.getByLabel('Contact file', { exact: true }).setInputFiles({
    name: 'Customers.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  });
  await expect(dialog.getByLabel('Worksheet', { exact: true })).toHaveValue('Notes');
  await dialog.getByLabel('Worksheet', { exact: true }).selectOption('Customers');
  await expect(dialog.getByLabel('Map Email', { exact: true })).toHaveValue('email');
  await expect(dialog).toContainText('excel@example.test');
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Import contacts', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Contacts are ready' })).toBeVisible();
  const data = (await (await page.request.get('/api/contacts')).json()).data;
  expect(data.map((contact: { email: string }) => contact.email)).toEqual(['excel@example.test']);
});
