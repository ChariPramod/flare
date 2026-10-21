import { createHash } from 'node:crypto';
import { test, expect, type Download, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.route('**/api/browser-transfer-config', (route) =>
    route.fulfill({ json: { enabled: true } }),
  );
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}
async function compose(page: Page, subject: string) {
  const headers = { Origin: 'http://localhost:4310' };
  const created = await page.request.post('/api/domains', {
    headers,
    data: { name: 'transfers.example.test', region: 'us-east-1' },
  });
  const { id } = await created.json();
  expect((await page.request.post(`/api/domains/${id}/verify`, { headers })).ok()).toBe(true);
  await page.goto('/emails');
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('sender@transfers.example.test');
  await expect(page.getByRole('textbox', { name: 'To', exact: true })).toHaveAccessibleDescription(
    'Separate multiple recipients with commas.',
  );
  await page.getByRole('textbox', { name: 'To', exact: true }).fill('reader@example.test');
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.getByLabel('Message body').fill('Large transfer — retained draft 🙂');
  return page.getByRole('dialog');
}
async function downloadedBytes(download: Download) {
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('large email bypasses the small proxy, keeps the draft after expiry and retries the same logical submission', async ({
  page,
  request,
}) => {
  await login(page);
  const dialog = await compose(page, 'Large direct attachment');
  const bytes = Buffer.alloc(4 * 1024 * 1024, 0x61);
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'large.bin', mimeType: 'application/octet-stream', buffer: bytes });
  await request.post('http://127.0.0.1:4311/fixtures/transfer-behavior', {
    data: { expire_next: true },
  });
  const proxySubmissions: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/emails' && request.method() === 'POST')
      proxySubmissions.push(request.url());
  });
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Browser transfer expired');
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue(
    'Large direct attachment',
  );
  await expect(dialog.getByRole('button', { name: 'Remove large.bin' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Large direct attachment', exact: true }),
  ).toBeVisible();
  expect(proxySubmissions).toEqual([]);
  const events = await (await request.get('http://127.0.0.1:4311/fixtures/transfer-events')).json();
  const grants = events.filter(
    (event: { kind: string; operation: string }) =>
      event.kind === 'grant' && event.operation === 'email.send',
  );
  expect(grants).toHaveLength(2);
  expect(grants[0]).toEqual(grants[1]);
  expect(grants[0].body_bytes).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(Object.keys(grants[0]).sort()).toEqual([
    'body_bytes',
    'body_sha256',
    'idempotency_key',
    'kind',
    'operation',
  ]);
  const emails = await (await page.request.get('/api/emails')).json();
  expect(emails).toHaveLength(1);
  const source = page.waitForResponse(
    (response) =>
      new URL(response.url()).origin === 'http://127.0.0.1:4311' &&
      new URL(response.url()).pathname.endsWith('/source'),
  );
  await page.getByRole('button', { name: 'Raw MIME', exact: true }).click();
  expect((await source).ok()).toBe(true);
  const raw = page.locator('pre').filter({ hasText: 'Browser fixture MIME' });
  await expect(raw).toBeVisible();
  expect(
    await raw.evaluate((node) => new TextEncoder().encode(node.textContent ?? '').byteLength),
  ).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(
    (await page.context().cookies()).some((cookie) => cookie.value.includes('fixture-transfer-')),
  ).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(
    'fixture-transfer-',
  );
});

test('large inbound body, raw MIME and attachment use authorized direct downloads while HTML remains sandboxed', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const fixture = await (
    await request.post('http://127.0.0.1:4311/fixtures/large-transfers')
  ).json();
  await login(page);
  const remote: string[] = [];
  const direct: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname === 'remote-image.invalid') remote.push(request.url());
    if (url.origin === 'http://127.0.0.1:4311' && url.pathname.includes(`/inbound/${fixture.id}/`))
      direct.push(url.pathname);
  });
  const fullBody = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/v1/inbound/${fixture.id}/body`,
  );
  await page.goto(`/inbound/${fixture.id}`);
  await expect(
    page.getByRole('heading', { name: 'Large incoming message', exact: true }),
  ).toBeVisible();
  const body = page.locator('pre').filter({ hasText: 'Large incoming body' });
  await expect(body).toBeVisible();
  expect((await (await fullBody).body()).length).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(await body.evaluate((node) => node.textContent?.length ?? 0)).toBeLessThanOrEqual(
    64 * 1024,
  );
  await expect(page.getByRole('status')).toContainText('This preview is shortened');
  await page.getByRole('button', { name: 'HTML preview', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Received HTML preview"]')
      .getByRole('heading', { name: 'Large incoming body' }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Received HTML preview"]')).toHaveAttribute(
    'sandbox',
    '',
  );
  expect(
    await page.evaluate(() => Object.prototype.hasOwnProperty.call(window, 'compromised')),
  ).toBe(false);
  await expect(page.getByRole('status')).toContainText('This preview is shortened');
  expect(
    await page
      .frameLocator('iframe[title="Received HTML preview"]')
      .locator('body')
      .evaluate((node) => node.textContent?.length ?? 0),
  ).toBeLessThan(65 * 1024);
  expect(remote).toEqual([]);
  const rawDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original MIME', exact: true }).click();
  const raw = await rawDownload;
  expect(raw.suggestedFilename()).toBe(`${fixture.id}.eml`);
  expect((await downloadedBytes(raw)).length).toBe(fixture.size);
  const attachmentButton = page.getByRole('button', { name: /^large-report.bin ·/ });
  // Let the scrolled iframe hit region settle before the ordinary pointer click.
  await attachmentButton.scrollIntoViewIfNeeded();
  await expect(attachmentButton).toBeInViewport();
  const attachmentDownload = page.waitForEvent('download', { timeout: 15000 });
  await attachmentButton.click();
  const attachment = await attachmentDownload;
  expect(attachment.suggestedFilename()).toBe('large-report.bin');
  const bytes = await downloadedBytes(attachment);
  expect(bytes.length).toBe(fixture.size);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    createHash('sha256').update(Buffer.alloc(fixture.size, 0x61)).digest('hex'),
  );
  expect(direct).toEqual(
    expect.arrayContaining([
      `/v1/inbound/${fixture.id}/body`,
      `/v1/inbound/${fixture.id}/raw`,
      `/v1/inbound/${fixture.id}/attachments/${fixture.attachment_id}`,
    ]),
  );
});

test('a truncated accepted response retains the draft and retries the same committed message', async ({
  page,
  request,
}) => {
  await login(page);
  const dialog = await compose(page, 'Truncated acceptance response');
  let truncate = true;
  let firstStatus: number | undefined;
  let acceptedId: string | undefined;
  await page.route('http://127.0.0.1:4311/v1/emails', async (route) => {
    if (route.request().method() !== 'POST' || !truncate) return route.continue();
    truncate = false;
    const response = await route.fetch({ maxRetries: 0 });
    firstStatus = response.status();
    acceptedId = (await response.json()).id;
    await route.fulfill({ response, contentType: 'application/json', body: '{"id":' });
  });
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Flare returned an incomplete response');
  expect(firstStatus).toBe(201);
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue(
    'Truncated acceptance response',
  );
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/emails/${acceptedId}$`));
  await expect(
    page.getByRole('heading', { name: 'Truncated acceptance response', exact: true }),
  ).toBeVisible();
  const events = await (await request.get('http://127.0.0.1:4311/fixtures/transfer-events')).json();
  const grants = events.filter(
    (event: { kind: string; operation: string }) =>
      event.kind === 'grant' && event.operation === 'email.send',
  );
  expect(grants).toHaveLength(2);
  expect(grants[0]).toEqual(grants[1]);
  expect(await (await page.request.get('/api/emails')).json()).toHaveLength(1);
});
