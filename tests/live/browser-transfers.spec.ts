import { createHash } from 'node:crypto';
import { test, expect, type Download, type Page } from '@playwright/test';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live browser-transfer acceptance`);
  return value;
}
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Development' });
  const mode = await page.request.get('/api/browser-transfer-config');
  expect(mode.ok()).toBe(true);
  expect(await mode.json()).toEqual({ enabled: true });
}
async function downloaded(download: Download) {
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of stream!) {
    size += chunk.length;
    hash.update(chunk);
  }
  return { size, sha256: hash.digest('hex') };
}

test('live large email survives a lost acceptance response without another logical submission', async ({
  page,
}) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires disposable direct-transfer configuration');
  await login(page);
  const subject = `Large browser transfer ${Date.now()}`;
  const directSends: {
    bytes: number;
    sha256: string;
    key: string | undefined;
    cookie: string | undefined;
  }[] = [];
  const grants: unknown[] = [];
  const proxySends: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.method() !== 'POST') return;
    if (
      url.pathname === '/api/browser-transfers' &&
      request.postDataJSON()?.operation === 'email.send'
    )
      grants.push(request.postDataJSON());
    if (url.pathname === '/api/emails') proxySends.push(url.pathname);
    if (url.pathname === '/v1/emails') {
      const body = request.postDataBuffer()!;
      directSends.push({
        bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'),
        key: request.headers()['idempotency-key'],
        cookie: request.headers().cookie,
      });
    }
  });
  let discardFirst = true;
  let firstStatus: number | undefined;
  let acceptedId: string | undefined;
  await page.route('**/v1/emails', async (route) => {
    if (route.request().method() !== 'POST' || !discardFirst) return route.continue();
    discardFirst = false;
    const accepted = await route.fetch({ maxRetries: 0 });
    firstStatus = accepted.status();
    acceptedId = (await accepted.json()).id;
    // The server has committed acceptance, but the browser sees a connection failure.
    await route.abort('connectionfailed');
  });
  await page.goto('/emails');
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('From', { exact: true }).fill(required('E2E_FROM'));
  await dialog.getByRole('textbox', { name: /^To / }).fill(required('E2E_TO'));
  await dialog.getByLabel('Subject', { exact: true }).fill(subject);
  await dialog.getByLabel('Message body').fill('Keep this exact draft after a lost response — 🙂');
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'large-send.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(5 * 1024 * 1024, 0x71),
  });
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(firstStatus).toBe(201);
  expect(acceptedId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue(subject);
  await expect(dialog.getByRole('button', { name: 'Remove large-send.bin' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/emails/${acceptedId}$`));
  await expect(page.getByRole('heading', { name: subject, exact: true })).toBeVisible();
  expect(proxySends).toEqual([]);
  expect(directSends).toHaveLength(2);
  expect(directSends[0]).toEqual(directSends[1]);
  expect(directSends[0]!.bytes).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(directSends[0]!.cookie).toBeUndefined();
  expect(directSends[0]!.key).toBeTruthy();
  expect(grants).toHaveLength(2);
  expect(grants[0]).toEqual(grants[1]);
  const rows = await (await page.request.get('/api/emails')).json();
  expect(rows.filter((row: { subject: string }) => row.subject === subject)).toHaveLength(1);
  await expect(page.locator('.page-heading .badge')).toHaveText(/^(Provider accepted|Delivered)$/, {
    timeout: 60000,
  });
  const sourceResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/v1/emails/${acceptedId}/source`,
  );
  await page.getByRole('button', { name: 'Raw MIME', exact: true }).click();
  expect((await sourceResponse).ok()).toBe(true);
  const source = page.locator('pre').filter({ hasText: 'DKIM-Signature:' });
  await expect(source).toBeVisible();
  expect(
    await source.evaluate((node) => new TextEncoder().encode(node.textContent ?? '').byteLength),
  ).toBeGreaterThan(4.5 * 1024 * 1024);
});

test('live large inbound body and exact original/attachment bytes bypass the proxy while HTML stays inert', async ({
  page,
}) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires disposable signed large inbound fixture');
  await page.setViewportSize({ width: 1280, height: 720 });
  const id = required('E2E_LARGE_INBOUND_ID');
  const attachmentId = required('E2E_LARGE_ATTACHMENT_ID');
  await login(page);
  const direct: string[] = [];
  const remote: string[] = [];
  const dialogs: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith(`/v1/inbound/${id}/`)) direct.push(url.pathname);
    if (url.hostname === 'remote.invalid') remote.push(url.href);
  });
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const bodyResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/v1/inbound/${id}/body`,
  );
  await page.goto(`/inbound/${id}`);
  await expect(
    page.getByRole('heading', { name: 'Acceptance large inbound transfer', exact: true }),
  ).toBeVisible();
  const body = await bodyResponse;
  expect(body.ok()).toBe(true);
  expect((await body.body()).length).toBeGreaterThan(4.5 * 1024 * 1024);
  await page.getByRole('button', { name: 'HTML preview', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Received HTML preview"]')
      .getByText('Large transfer fixture', { exact: true }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Received HTML preview"]')).toHaveAttribute(
    'sandbox',
    '',
  );
  await expect(page.getByRole('status')).toContainText('This preview is shortened');
  expect(
    await page
      .frameLocator('iframe[title="Received HTML preview"]')
      .locator('body')
      .evaluate((node) => node.textContent?.length ?? 0),
  ).toBeLessThan(65 * 1024);
  expect(remote).toEqual([]);
  expect(dialogs).toEqual([]);
  const rawDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original MIME', exact: true }).click();
  const raw = await rawDownload;
  expect(raw.suggestedFilename()).toBe(`${id}.eml`);
  expect(await downloaded(raw)).toEqual({
    size: Number(required('E2E_LARGE_RAW_BYTES')),
    sha256: required('E2E_LARGE_RAW_SHA256'),
  });
  const attachmentButton = page.getByRole('button', { name: /^large-fixture.bin ·/ });
  // Let the scrolled iframe hit region settle before the ordinary pointer click.
  await attachmentButton.scrollIntoViewIfNeeded();
  await expect(attachmentButton).toBeInViewport();
  const [attachment] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.waitForRequest(
      (request) =>
        new URL(request.url()).pathname === `/v1/inbound/${id}/attachments/${attachmentId}`,
      { timeout: 15000 },
    ),
    attachmentButton.click(),
  ]);
  expect(attachment.suggestedFilename()).toBe('large-fixture.bin');
  expect(await downloaded(attachment)).toEqual({
    size: 5 * 1024 * 1024,
    sha256: createHash('sha256')
      .update(Buffer.alloc(5 * 1024 * 1024, 0x71))
      .digest('hex'),
  });
  expect(direct).toEqual(
    expect.arrayContaining([
      `/v1/inbound/${id}/body`,
      `/v1/inbound/${id}/raw`,
      `/v1/inbound/${id}/attachments/${attachmentId}`,
    ]),
  );
});
