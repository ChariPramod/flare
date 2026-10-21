import { test, expect, type Locator, type Page } from '@playwright/test';

async function textContrast(locator: Locator) {
  const colors = await locator.evaluate((element) => {
    let background = element;
    while (
      getComputedStyle(background).backgroundColor === 'rgba(0, 0, 0, 0)' &&
      background.parentElement
    )
      background = background.parentElement;
    return {
      text: getComputedStyle(element).color,
      background: getComputedStyle(background).backgroundColor,
    };
  });
  const luminance = (value: string) => {
    const [red, green, blue] = value
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((part) => {
        const channel = Number(part) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return red! * 0.2126 + green! * 0.7152 + blue! * 0.0722;
  };
  const values = [luminance(colors.text), luminance(colors.background)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

async function compose(page: Page) {
  const headers = { Origin: 'http://localhost:4310' };
  const created = await page.request.post('/api/domains', {
    headers,
    data: { name: 'attachments.example.test', region: 'us-east-1' },
  });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await page.request.post(`/api/domains/${id}/verify`, { headers })).ok()).toBe(true);
  await page.goto('/emails');
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('sender@attachments.example.test');
  await page.getByRole('textbox', { name: 'To', exact: true }).fill('reader@example.test');
  await page.getByLabel('Subject', { exact: true }).fill('Retained draft');
  await page.getByLabel('Message body').fill('Preserve this draft while the API recovers.');
  return page.getByRole('dialog');
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('Overview shows organization allowance, sender blockers and retained messages from the API', async ({
  page,
  request,
}, testInfo) => {
  const held = await request.post('http://127.0.0.1:4311/fixtures/sending-policy', {
    data: { usage: { reserved: 12, sent_24h: 37 } },
  });
  const { id } = await held.json();
  await request.post('http://127.0.0.1:4311/fixtures/email-outcomes');
  await request.post('http://127.0.0.1:4311/fixtures/domain-readiness', { data: { route: true } });
  await login(page);
  await expect(page.getByRole('region', { name: 'Sending access', exact: true })).toContainText(
    'Sending paused',
  );
  const allowance = page.getByRole('region', { name: 'Recipient allowance', exact: true });
  await expect(allowance).toContainText('51 available of 100');
  await expect(allowance).toContainText('37 used in 24 hours · 12 reserved');
  await expect(page.getByRole('meter', { name: 'Recipient allowance used' })).toHaveAttribute(
    'aria-valuenow',
    '49',
  );
  await expect(page.getByRole('region', { name: 'Sender readiness', exact: true })).toContainText(
    '0 of 1 sending domains pass Development checks',
  );
  await expect(page.getByRole('region', { name: 'Sender readiness', exact: true })).toContainText(
    'They do not establish Production readiness or verify real-world delivery.',
  );
  const feedback = page.getByRole('region', { name: 'Recipient feedback', exact: true });
  await expect(feedback).toContainText('Unknown bounce outcomes');
  await expect(feedback).toContainText('No recorded feedback is not proof of delivery');
  const attention = page.getByRole('region', { name: 'Needs attention', exact: true });
  await expect(attention).toContainText('Latest 100 emails · selected environment');
  await expect(attention).toContainText('Held: sending not approved');
  await expect(attention).toContainText(
    'Review delivery details before retrying; provider acceptance may be uncertain.',
  );
  await page.screenshot({ path: testInfo.outputPath('overview-desktop.png'), fullPage: true });
  await attention.getByRole('link', { name: /Held policy fixture/ }).click();
  await expect(page).toHaveURL(new RegExp(`/emails/${id}$`));
  await expect(page.getByRole('region', { name: 'Email on hold', exact: true })).toContainText(
    'Next eligibility check',
  );
});

test('unavailable overview APIs never look healthy and each card can recover', async ({ page }) => {
  let unavailable = true;
  await page.route(/\/api\/(sending-policy|domains|emails)$/, (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Overview fixture service unavailable' }),
        })
      : route.continue(),
  );
  await login(page);
  const access = page.getByRole('region', { name: 'Sending access', exact: true });
  const allowance = page.getByRole('region', { name: 'Recipient allowance', exact: true });
  const readiness = page.getByRole('region', { name: 'Sender readiness', exact: true });
  const attention = page.getByRole('region', { name: 'Needs attention', exact: true });
  await expect(access).toContainText('Sending policy unavailable');
  await expect(allowance).toContainText('Recipient allowance unavailable');
  await expect(allowance.getByRole('meter')).toHaveCount(0);
  await expect(readiness).toContainText('Sender readiness unavailable');
  await expect(readiness).not.toContainText('sending domains ready');
  await expect(attention).toContainText('Recent emails unavailable');
  await expect(
    attention.getByRole('heading', { name: /No held or failed|Your first message/ }),
  ).toHaveCount(0);
  unavailable = false;
  await access.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(access).toContainText('Awaiting review');
  await expect(allowance.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
  await readiness.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(readiness).toContainText('Add a sending domain');
  await attention.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    attention.getByRole('heading', { name: 'Your first message starts here', exact: true }),
  ).toBeVisible();
});

test('phone navigation traps keyboard focus, restores it on Escape and supports the skip link', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  const trigger = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
    includeHidden: true,
  });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const navigation = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(navigation).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(navigation.getByLabel('Environment', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('navigation-phone.png'), fullPage: true });
  // A full tab cycle remains inside the modal rather than reaching the obscured page.
  for (let step = 0; step < 32; step++) {
    await page.keyboard.press('Tab');
    expect(await navigation.evaluate((element) => element.contains(document.activeElement))).toBe(
      true,
    );
  }
  await page.keyboard.press('Escape');
  await expect(navigation).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await skip.focus();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('overview-phone.png'), fullPage: true });
  await trigger.click();
  await navigation.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await expect(navigation).toBeHidden();
  const publication = page.getByRole('dialog', { name: 'Publish to Production', exact: true });
  await expect(publication).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(publication).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await navigation.getByRole('link', { name: 'Received email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Received email', exact: true })).toBeVisible();
  await expect(navigation).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 960 });
  const desktopPublish = page.getByRole('button', { name: 'Publish changes', exact: true });
  await desktopPublish.click();
  await expect(publication).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(publication).toBeHidden();
  await expect(desktopPublish).toBeFocused();
});

test('viewer cannot publish from the mobile navigation', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4311/fixtures/domain-readiness');
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const navigation = page.getByRole('dialog', { name: 'Workspace navigation' });
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole('button', { name: 'Publish changes', exact: true }),
  ).toHaveCount(0);
});

test('shared text and primary actions keep readable contrast in both color themes', async ({
  page,
}, testInfo) => {
  await login(page);
  for (const theme of ['light', 'dark']) {
    await page.goto('/overview');
    if (theme === 'dark')
      await page.getByRole('button', { name: 'Toggle color theme', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    expect(
      await textContrast(page.getByRole('heading', { name: 'Overview', exact: true })),
      `${theme} heading contrast`,
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      await textContrast(page.locator('.page-heading p')),
      `${theme} muted description contrast`,
    ).toBeGreaterThanOrEqual(4.5);
    if (theme === 'dark')
      await page.screenshot({ path: testInfo.outputPath('overview-dark.png'), fullPage: true });
    await page.goto('/emails');
    const send = page.getByRole('button', { name: 'Send email', exact: true });
    await expect(send).toBeVisible();
    await page.mouse.move(0, 0);
    expect(await textContrast(send), `${theme} primary action contrast`).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});

test('received messages use server pagination and forwarding state survives independent navigation', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  await page.goto('/inbound');
  const messages = page.getByRole('table', { name: 'Received email' });
  const forwarding = page.getByRole('table', { name: 'Forwarding rules' });
  const forwardingPanel = page.locator('.table-panel').filter({ has: forwarding });
  await expect(messages.locator('tbody tr')).toHaveCount(50);
  await expect(messages.getByRole('link', { name: 'Received 050', exact: true })).toBeVisible();
  await expect(forwarding.locator('tbody tr')).toHaveCount(25);
  await forwardingPanel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    forwarding.getByRole('cell', { name: 'forward-26@example.test', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/forwarding_page=2/);
  await expect(messages.locator('tbody tr')).toHaveCount(50);

  const nextRequest = page.waitForRequest(
    (value) =>
      new URL(value.url()).pathname === '/api/inbound' &&
      new URL(value.url()).searchParams.get('page') === '2',
  );
  await page.getByRole('button', { name: 'Next received messages', exact: true }).click();
  await nextRequest;
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  await expect(messages.getByRole('link', { name: 'Received 051', exact: true })).toBeVisible();
  await expect(messages.getByRole('link', { name: 'Received 061', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next received messages', exact: true }),
  ).toBeDisabled();
  await expect(
    forwarding.getByRole('cell', { name: 'forward-26@example.test', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  expect(new URL(page.url()).searchParams.get('forwarding_page')).toBe('2');

  await page
    .getByRole('textbox', { name: 'Search forwarding rules…', exact: true })
    .fill('forward-31');
  await expect(forwarding.locator('tbody tr')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('forwarding_q')).toBe('forward-31');
  expect(new URL(page.url()).searchParams.has('forwarding_page')).toBe(false);
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  await page.goBack();
  await expect(messages.locator('tbody tr')).toHaveCount(50);
  await expect(forwarding.locator('tbody tr')).toHaveCount(6);
  await expect(
    page.getByRole('textbox', { name: 'Search forwarding rules…', exact: true }),
  ).toHaveValue('');
  expect(new URL(page.url()).searchParams.get('forwarding_page')).toBe('2');
  await page.goForward();
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  await expect(forwarding.locator('tbody tr')).toHaveCount(1);
  await expect(
    page.getByRole('textbox', { name: 'Search forwarding rules…', exact: true }),
  ).toHaveValue('forward-31');
  await page.reload();
  await expect(messages.locator('tbody tr')).toHaveCount(11);
  await expect(forwarding.locator('tbody tr')).toHaveCount(1);

  const urlBeforeLocalSearch = page.url();
  await page.getByRole('textbox', { name: 'Search this page…', exact: true }).fill('Received 061');
  await expect(messages.locator('tbody tr')).toHaveCount(1);
  await expect(forwarding.locator('tbody tr')).toHaveCount(1);
  expect(page.url()).toBe(urlBeforeLocalSearch);
});

test('table sorting announces its direction and remains keyboard accessible', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  await page.goto('/inbound');
  const messages = page.getByRole('table', { name: 'Received email' });
  const subject = messages.getByRole('columnheader', { name: 'Subject', exact: true });
  await expect(subject).toHaveAttribute('aria-sort', 'none');
  const button = subject.getByRole('button', { name: 'Subject', exact: true });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(subject).toHaveAttribute('aria-sort', 'ascending');
  await expect(button).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(subject).toHaveAttribute('aria-sort', 'descending');
  await expect(messages.locator('tbody tr').first()).toContainText('Received 050');
  await expect(button).toBeFocused();
});

test('ambiguous provider acceptance remains visible without cancellation or resend actions', async ({
  page,
  request,
}) => {
  const result = await request.post('http://127.0.0.1:4311/fixtures/email-outcomes');
  const { id } = await result.json();
  await login(page);
  await page.goto(`/emails/${id}`);
  await expect(page.getByText('Provider acceptance is uncertain', { exact: true })).toBeVisible();
  await expect(page.getByText('postal · ambiguous', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel email', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Update schedule', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /retry|resend/i })).toHaveCount(0);
});

test('one recipient bounce does not conceal another recipient’s ambiguous acceptance', async ({
  page,
  request,
}) => {
  const result = await request.post('http://127.0.0.1:4311/fixtures/email-outcomes', {
    data: { mixed: true },
  });
  const { id } = await result.json();
  await login(page);
  await page.goto(`/emails/${id}`);
  await expect(
    page.getByRole('region', { name: 'Uncertain email acceptance', exact: true }),
  ).toContainText('Provider acceptance is uncertain');
  await expect(page.getByText('postal · ambiguous', { exact: true })).toBeVisible();
  await expect(
    page.locator('.recipient-row').filter({ hasText: 'bounced@example.test' }),
  ).toContainText('bounced');
  await expect(
    page.locator('.recipient-row').filter({ hasText: 'reader@example.test' }),
  ).toContainText('failed');
  await expect(
    page.getByRole('button', { name: /retry|resend|Cancel email|Update schedule/i }),
  ).toHaveCount(0);
});

test('a background policy failure removes stale approval and quota until retry succeeds', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/sending-policy', {
    data: { state: 'approved', usage: { sent_24h: 37, reserved: 12 } },
  });
  await page.clock.install();
  let unavailable = false;
  await page.route('**/api/sending-policy', (route) =>
    unavailable
      ? route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Sending policy could not be read' }),
        })
      : route.continue(),
  );
  await login(page);
  await page.goto('/emails');
  const policy = page.getByRole('region', { name: 'Organization sending access', exact: true });
  await expect(policy).toContainText('Your organization is approved');
  await expect(policy).toContainText('Used: 37');
  unavailable = true;
  const failedRefresh = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/sending-policy' && response.status() === 503,
  );
  await page.clock.fastForward(16000);
  await failedRefresh;
  await expect(policy).toContainText('Sending access is unavailable');
  await expect(policy).not.toContainText('Your organization is approved');
  await expect(policy).not.toContainText('Used: 37');
  unavailable = false;
  await policy.getByRole('button', { name: 'Retry sending access', exact: true }).click();
  await expect(policy).toContainText('Your organization is approved');
  await expect(policy).toContainText('Used: 37');
});

test('polling a shorter email list restores a valid page without losing the search', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/email-pagination');
  await page.clock.install();
  await login(page);
  await page.goto('/emails');
  const table = page.getByRole('table');
  const panel = page.locator('.table-panel').filter({ has: table });
  await page.getByRole('textbox', { name: 'Search emails…', exact: true }).fill('Page fixture');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('Page fixture 26');
  expect(new URL(page.url()).searchParams.get('page')).toBe('2');
  await request.post('http://127.0.0.1:4311/fixtures/email-pagination', { data: { count: 25 } });
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/emails',
  );
  await page.clock.fastForward(6000);
  await refreshed;
  await expect(table.locator('tbody tr')).toHaveCount(25);
  await expect(panel).toContainText('Page 1 of 1');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.get('q')).toBe('Page fixture');
  await expect(page.getByRole('textbox', { name: 'Search emails…', exact: true })).toHaveValue(
    'Page fixture',
  );
});

test('pending or unavailable attachment limits prevent encoding while text-only submission remains available', async ({
  page,
}) => {
  let resolveCapabilities!: () => void;
  const gate = new Promise<void>((resolve) => {
    resolveCapabilities = resolve;
  });
  await page.route('**/api/email-capabilities', async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Attachment limits are temporarily unavailable' }),
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'attachmentReads', { value: 0, writable: true });
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      Reflect.set(window, 'attachmentReads', Reflect.get(window, 'attachmentReads') + 1);
      return original.call(this, blob);
    };
  });
  await login(page);
  const dialog = await compose(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'hold.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Do not encode before checking limits'),
  });
  await expect(
    dialog.getByText('Loading configured attachment limits…', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentReads'))).toBe(0);
  resolveCapabilities();
  await expect(
    dialog.getByRole('button', { name: 'Retry attachment limits', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentReads'))).toBe(0);
  await dialog.getByRole('button', { name: 'Remove hold.txt', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Send email', exact: true })).toBeEnabled();
  const submission = page.waitForRequest(
    (value) => new URL(value.url()).pathname === '/api/emails' && value.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  expect((await submission).postDataJSON().attachments).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Retained draft', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentReads'))).toBe(0);
});

test('attachment limits come from the API and reject excess bytes and counts before encoding', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/email-capabilities', {
    data: { attachment_max_bytes: 128 * 1024, attachment_max_count: 2 },
  });
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsDataURL;
    Object.defineProperty(window, 'attachmentReads', { value: 0, writable: true });
    FileReader.prototype.readAsDataURL = function (blob: Blob) {
      Reflect.set(window, 'attachmentReads', Reflect.get(window, 'attachmentReads') + 1);
      return original.call(this, blob);
    };
  });
  await login(page);
  const dialog = await compose(page);
  const input = dialog.locator('input[type="file"]');
  await expect(
    dialog.getByText('128 KiB combined, up to 2 files.', { exact: false }),
  ).toBeVisible();
  await input.setInputFiles([
    { name: 'first.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(70 * 1024) },
    { name: 'second.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(70 * 1024) },
  ]);
  await expect(dialog.getByRole('alert')).toContainText(/combined|limit|exceed/i);
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentReads'))).toBe(0);
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue('Retained draft');
  await expect(dialog.getByLabel('Message body')).toHaveValue(
    'Preserve this draft while the API recovers.',
  );
  await dialog.getByRole('button', { name: 'Remove first.bin', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove second.bin', exact: true }).click();
  await input.setInputFiles(
    ['one', 'two', 'three'].map((name) => ({
      name: `${name}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(name),
    })),
  );
  await expect(dialog.getByRole('alert')).toContainText(/2/);
  expect(await page.evaluate(() => Reflect.get(window, 'attachmentReads'))).toBe(0);
  for (const filename of ['one.txt', 'two.txt', 'three.txt']) {
    await dialog.getByRole('button', { name: `Remove ${filename}`, exact: true }).click();
  }
  await input.setInputFiles({
    name: 'boundary.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(128 * 1024),
  });
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Remove boundary.bin', exact: true }),
  ).toBeVisible();
  const submission = page.waitForRequest(
    (value) => new URL(value.url()).pathname === '/api/emails' && value.method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  expect(
    Buffer.from((await submission).postDataJSON().attachments[0].content, 'base64'),
  ).toHaveLength(128 * 1024);
  await expect(page.getByRole('heading', { name: 'Retained draft', exact: true })).toBeVisible();
});

test('recoverable send failures preserve draft and reuse the same idempotency key', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const dialog = await compose(page);
  const submissions: { key: string | undefined; body: string | null }[] = [];
  await page.route('**/api/emails', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    submissions.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData(),
    });
    if (submissions.length === 1)
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Delivery queue is temporarily unavailable' }),
      });
    return route.continue();
  });
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Delivery queue is temporarily unavailable',
  );
  await expect(dialog.getByLabel('Subject', { exact: true })).toHaveValue('Retained draft');
  await expect(dialog.getByLabel('Message body')).toHaveValue(
    'Preserve this draft while the API recovers.',
  );
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath('compose-phone-retry.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Retained draft', exact: true })).toBeVisible();
  expect(submissions).toHaveLength(2);
  expect(submissions[0]!.key).toBeTruthy();
  expect(submissions[1]).toEqual(submissions[0]);
});
