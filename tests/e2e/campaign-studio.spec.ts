import { expect, test, type Page } from '@playwright/test';
const headers = { Origin: 'http://localhost:4310' };
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
async function editor(page: Page) {
  await page.goto('/broadcasts');
  await page.getByRole('button', { name: 'Create campaign', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Create campaign', exact: true });
  await form.getByLabel('Campaign name', { exact: true }).fill('Studio update');
  await form.getByLabel('From address', { exact: true }).fill('news@example.test');
  await form.getByLabel('Email subject', { exact: true }).fill('Hi {{first_name}}');
  return form;
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('starter replacement is deliberate and personalization inserts into the selected field without losing text', async ({
  page,
}) => {
  await login(page);
  await page.route('**/api/contact-properties', (route) =>
    route.fulfill({ json: [{ name: 'company' }] }),
  );
  const form = await editor(page);
  await form.getByLabel('Email HTML', { exact: true }).fill('<p>Keep my work</p>');
  await form.getByLabel('Email starter', { exact: true }).selectOption('event');
  await form.getByRole('button', { name: 'Use starter', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Replace email content?', exact: true });
  await confirm.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(form.getByLabel('Email HTML', { exact: true })).toHaveValue('<p>Keep my work</p>');
  await form.getByRole('button', { name: 'Use starter', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(form.getByLabel('Email HTML', { exact: true })).toHaveValue(/Let us get together/);
  await expect(form).toContainText('Insert at your last cursor position in the HTML.');
  await expect(form.getByLabel('From address', { exact: true })).toHaveValue('news@example.test');
  const subject = form.getByLabel('Email subject', { exact: true });
  await subject.fill('Hello team');
  for (let index = 0; index < 8; index++) await subject.press('ArrowLeft');
  expect(await subject.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(2);
  await form.getByLabel('Personalization field', { exact: true }).selectOption('company');
  await form.getByRole('button', { name: 'Insert field', exact: true }).click();
  await expect(subject).toHaveValue('He{{company}}llo team');
  await expect(subject).toBeFocused();
  expect(await (await page.request.get('/api/broadcasts')).json()).toHaveLength(0);
});

test('real contact preview escapes values, shows missing fields and offers mobile and plain text without sending', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const created = await page.request.post('/api/contacts', {
    headers,
    data: {
      email: 'preview@example.test',
      first_name: '<Alex & team>',
      properties: { company: 'Pareto' },
    },
  });
  expect(created.ok()).toBe(true);
  const form = await editor(page);
  await form
    .getByLabel('Email HTML', { exact: true })
    .fill(
      '<h1>{{first_name}}</h1><p>{{company}} {{missing}}</p><img src="https://untrusted.example/pixel"><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>',
    );
  await form
    .getByLabel('Plain-text alternative', { exact: true })
    .fill('Hi {{first_name}} at {{company}}');
  await form.getByLabel('Search preview contacts', { exact: true }).fill('preview@');
  await form.getByRole('button', { name: 'Find contacts', exact: true }).click();
  await form.getByRole('button', { name: /preview@example.test/ }).click();
  let outgoing = 0;
  let remote = 0;
  page.on('request', (request) => {
    if (/\/api\/(emails|broadcasts.*schedule)/.test(request.url())) outgoing++;
    if (request.url().includes('untrusted.example')) remote++;
  });
  await form.getByRole('button', { name: 'Preview email', exact: true }).click();
  const preview = form.getByRole('region', { name: 'Email preview', exact: true });
  await expect(preview).toContainText('1 field has no value');
  await expect(preview).toContainText('missing');
  const frame = page.frameLocator('iframe[title="Campaign email preview"]');
  await expect(frame.getByRole('heading', { name: '<Alex & team>', exact: true })).toBeVisible();
  expect(await frame.locator('script,img,a[href],form').count()).toBe(0);
  await preview.getByRole('button', { name: 'Mobile', exact: true }).click();
  const width = await page
    .locator('iframe[title="Campaign email preview"]')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(360);
  await preview.getByRole('button', { name: 'Plain text', exact: true }).click();
  await expect(preview.locator('pre')).toHaveText('Hi <Alex & team> at Pareto');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const save = form.getByRole('button', { name: 'Save campaign draft', exact: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(save).toBeVisible();
    expect(await save.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  }
  expect(outgoing).toBe(0);
  expect(remote).toBe(0);
  expect(await (await page.request.get('/api/broadcasts')).json()).toHaveLength(0);
});

test('preview failure retains edits, contact choice and a safe retry path', async ({ page }) => {
  await login(page);
  const form = await editor(page);
  await page.route('**/api/template-preview', (route) =>
    route.fulfill({ status: 503, json: { message: 'Preview temporarily unavailable' } }),
  );
  await form.getByRole('button', { name: 'Preview email', exact: true }).click();
  await expect(form.getByRole('alert')).toHaveText('Preview temporarily unavailable');
  await expect(form.getByLabel('Email subject', { exact: true })).toHaveValue('Hi {{first_name}}');
  await page.unroute('**/api/template-preview');
  await form.getByRole('button', { name: 'Preview email', exact: true }).click();
  await expect(form.getByRole('region', { name: 'Email preview', exact: true })).toContainText(
    'Hi Alex',
  );
  await form.getByLabel('Email subject', { exact: true }).fill('Newer subject');
  await expect(form.getByRole('region', { name: 'Email preview', exact: true })).toHaveCount(0);
});

test('duplicating a scheduled campaign only saves a new idempotent draft and leaves the original intact', async ({
  page,
}) => {
  await login(page);
  await page.request.post('/api/contacts', { headers, data: { email: 'recipient@example.test' } });
  const form = await editor(page);
  await form.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Studio update', exact: true })).toBeVisible();
  const originalId = new URL(page.url()).pathname.split('/').at(-1)!;
  const original = await (await page.request.get(`/api/broadcasts/${originalId}`)).json();
  await page.request.post(`/api/broadcasts/${originalId}/schedule`, {
    headers,
    data: { scheduled_at: new Date(Date.now() + 3600000).toISOString() },
  });
  await page.reload();
  await page.getByRole('button', { name: 'Duplicate as draft', exact: true }).click();
  let copy = page.getByRole('dialog', { name: 'Duplicate campaign', exact: true });
  await expect(copy.getByLabel('Campaign name', { exact: true })).toHaveValue(
    'Studio update — copy',
  );
  expect(await (await page.request.get('/api/broadcasts')).json()).toHaveLength(1);
  const keys: string[] = [];
  await page.route('**/api/broadcasts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']!);
    if (keys.length === 1) {
      await route.fetch();
      return route.abort('failed');
    }
    return route.continue();
  });
  await copy.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(copy.getByRole('alert')).toBeVisible();
  await copy.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate as draft', exact: true }).click();
  copy = page.getByRole('dialog', { name: 'Duplicate campaign', exact: true });
  await copy.getByRole('button', { name: 'Save campaign draft', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Studio update — copy', exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const all = await (await page.request.get('/api/broadcasts')).json();
  expect(all).toHaveLength(2);
  const duplicate = all.find((item: { id: string }) => item.id !== originalId);
  expect(duplicate).toMatchObject({
    status: 'draft',
    scheduled_at: null,
    template_id: original.template_id,
    template_version: original.template_version,
  });
  expect((await (await page.request.get(`/api/broadcasts/${originalId}`)).json()).status).toBe(
    'scheduled',
  );
});

test('preview search ignores late results and Enter never submits the campaign', async ({
  page,
}) => {
  await login(page);
  await page.request.post('/api/contacts', {
    headers,
    data: { email: 'older@example.test', first_name: 'Older' },
  });
  await page.request.post('/api/contacts', {
    headers,
    data: { email: 'newer@example.test', first_name: 'Newer' },
  });
  const form = await editor(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const pending = new Promise<void>((resolve) => {
    started = resolve;
  });
  await page.route('**/api/contacts?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('q') !== 'older') return route.continue();
    const response = await route.fetch();
    started();
    await gate;
    await route.fulfill({ response });
  });
  const search = form.getByLabel('Search preview contacts', { exact: true });
  await search.fill('older');
  await search.press('Enter');
  await pending;
  await search.fill('newer');
  await search.press('Enter');
  await expect(form.getByRole('button', { name: /newer@example.test/ })).toBeVisible();
  const finished = page.waitForResponse(
    (response) => new URL(response.url()).searchParams.get('q') === 'older',
  );
  release();
  await finished;
  await expect(form.getByRole('button', { name: /older@example.test/ })).toHaveCount(0);
  await expect(form.getByRole('button', { name: /newer@example.test/ })).toBeVisible();
  expect(await (await page.request.get('/api/broadcasts')).json()).toHaveLength(0);
});
