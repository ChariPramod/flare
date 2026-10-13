import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});
test('sign in, create and edit a workflow, trigger it, and inspect activity', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const cookie = (await page.context().cookies()).find((c) => c.name === 'flare_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('flare_session');
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await page.getByLabel('Workflow name').fill('Welcome customers');
  await page.getByRole('dialog').getByRole('button', { name: 'Create workflow' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome customers' })).toBeVisible();
  await page.getByRole('button', { name: 'Add first step' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Email / })
    .click();
  await page.getByRole('tab', { name: 'Content', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('broken');
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(
    JSON.stringify({ subject: 'Welcome', body: '<p>Welcome aboard.</p>' }),
  );
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Revision 2')).toBeVisible();
  await page.screenshot({ path: 'test-results/workflow-canvas.png', fullPage: true });
  await page.getByRole('button', { name: 'Test workflow' }).click();
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByRole('heading', { name: 'Trigger accepted' })).toBeVisible();
  await page.getByRole('link', { name: 'accepted · 1 attempts' }).click();
  await expect(page.getByRole('heading', { name: 'Run timeline' })).toBeVisible();
  await expect(page.getByText('accepted', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test('domain DNS records, verification contract, email submission and raw source', async ({
  page,
}) => {
  await login(page);
  await page.getByRole('link', { name: 'Domains', exact: true }).click();
  await page.getByRole('button', { name: 'Add domain', exact: true }).click();
  await page.getByLabel('Domain name').fill('notifications.example.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Add domain', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DNS records' })).toBeVisible();
  await expect(
    page.getByText('flare._domainkey.notifications.example.test', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Verify DNS records' }).click();
  await expect(page.locator('.page-heading').getByText('verified', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/domain-records.png', fullPage: true });
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill('hello@notifications.example.test');
  await page.getByRole('textbox', { name: /^To / }).fill('recipient@example.test');
  await page.getByLabel('Subject', { exact: true }).fill('Browser contract email');
  await page.locator('textarea[name="body"]').fill('Hello from the browser contract test.');
  await page.getByRole('dialog').getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser contract email' })).toBeVisible();
  await expect(page.getByText('smtp · accepted')).toBeVisible();
  await page.getByRole('button', { name: 'Raw MIME' }).click();
  await expect(page.getByText('Browser fixture MIME', { exact: false })).toBeVisible();
});
test('production guard, origin validation, tenant switch denial, responsive shell', async ({
  page,
}) => {
  await login(page);
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(page.getByRole('button', { name: 'Create workflow', exact: true })).toBeDisabled();
  const forbidden = await page.request.post('/api/emails', {
    headers: { Origin: 'https://untrusted.example' },
    data: {},
  });
  expect(forbidden.status()).toBe(403);
  expect((await page.request.get('/novu/v1/workflows')).status()).toBe(404);
  expect(
    (
      await page.request.post('/novu/v1/inbox/session', {
        headers: { Origin: 'http://localhost:4310' },
        data: { applicationIdentifier: 'test', subscriber: { subscriberId: 'demo' } },
      })
    ).status(),
  ).toBe(401);
  const wrongTenant = await page.request.post('/api/session/switch', {
    headers: { Origin: 'http://localhost:4310' },
    data: {
      orgId: '00000000-0000-4000-8000-000000000099',
      environmentId: '00000000-0000-4000-8000-000000000003',
    },
  });
  expect(wrongTenant.status()).toBe(403);
  await page.setViewportSize({ width: 820, height: 1180 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/tablet-shell.png', fullPage: true });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('webhook creation, signed-event details, replay, redacted logs and metrics', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('link', { name: 'Webhooks', exact: true }).click();
  await page.getByRole('button', { name: 'Add endpoint' }).click();
  await page.getByLabel('Endpoint name').fill('Production receiver');
  await page.getByLabel('URL', { exact: true }).fill('https://receiver.example.test/events');
  await page.getByRole('button', { name: 'Save endpoint' }).click();
  await expect(page.getByRole('heading', { name: 'Save your signing secret' })).toBeVisible();
  await expect(page.locator('.secret-box code')).toContainText('whsec_');
  await page.getByRole('button', { name: 'I’ve saved it' }).click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await page.getByRole('link', { name: 'webhook.test', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Attempt history' })).toBeVisible();
  await expect(page.getByText('Attempt 1 · 204')).toBeVisible();
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  const replayResponse = page.waitForResponse(
    (r) => r.url().includes('/replay') && r.request().method() === 'POST',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await replayResponse).ok()).toBe(true);
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.screenshot({ path: 'test-results/webhook-delivery.png', fullPage: true });
  await page.getByRole('link', { name: 'Logs', exact: true }).click();
  await page.getByLabel('HTTP status code').fill('201');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByRole('link', { name: /\/v1\/webhooks/ }).click();
  await expect(page.getByRole('heading', { name: 'Response body' })).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: 'REDACTED' })).toBeVisible();
  await page.getByRole('link', { name: 'Logs', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  expect((await downloaded).suggestedFilename()).toBe('flare-requests.csv');
  const initialMetrics = page.waitForResponse((r) => r.url().includes('/api/metrics?'));
  await page.getByRole('link', { name: 'Metrics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Delivery metrics' })).toBeVisible();
  await expect(page.getByText('Bounce rate exceeds 4%.')).toBeVisible();
  await expect(
    page.locator('.metric-card').filter({ hasText: 'Accepted messages' }).locator('strong'),
  ).toHaveText('12');
  const first = await initialMetrics;
  const firstTo = new URL(first.url()).searchParams.get('to');
  const refreshed = page.waitForResponse(
    (r) => r.url().includes('/api/metrics?') && new URL(r.url()).searchParams.get('to') !== firstTo,
  );
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  expect((await refreshed).ok()).toBe(true);
  await expect(page.locator('.recharts-area-curve').first()).toHaveAttribute('d', /^M/);
  await page.screenshot({ path: 'test-results/delivery-metrics.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('audience preferences, template preview/version and scheduled broadcast cancellation', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.getByRole('link', { name: 'Audience', exact: true }).click();
  await page.getByRole('button', { name: 'Add contact', exact: true }).click();
  await page.getByLabel('Email address', { exact: true }).fill('alex@example.test');
  await page.getByLabel('First name', { exact: true }).fill('Alex');
  await page.getByRole('button', { name: 'Save contact', exact: true }).click();
  await page.getByRole('link', { name: 'alex@example.test', exact: true }).click();
  await page.getByRole('button', { name: 'Create preference link', exact: true }).click();
  const preference = await page.getByLabel('Preference link', { exact: true }).inputValue();
  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(preference);
  await expect(publicPage.getByRole('heading', { name: 'Email preferences' })).toBeVisible();
  await publicPage.getByRole('checkbox', { name: /Unsubscribe from all broadcasts/ }).check();
  await publicPage.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(publicPage.getByRole('status')).toContainText('saved');
  await publicPage.screenshot({ path: 'test-results/preference-page.png', fullPage: true });
  await publicContext.close();
  await page.getByRole('link', { name: 'Templates', exact: true }).click();
  await page.getByRole('button', { name: 'Create template', exact: true }).click();
  await page.getByLabel('Template name').fill('Monthly news');
  await page.getByLabel('Template identifier').fill('monthly-news');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Create template', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Monthly news' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'HTML', exact: true })
    .fill('<h1>Hello {{first_name}}</h1><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>');
  await page.getByRole('button', { name: 'Preview draft', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Email preview"]').getByRole('heading', { name: 'Hello Alex' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await expect(page.getByText('Version 2 · monthly-news', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/template-editor.png', fullPage: true });
  await page.getByRole('link', { name: 'Broadcasts', exact: true }).click();
  await page.getByRole('button', { name: 'Create broadcast', exact: true }).click();
  await page.getByLabel('Broadcast name').fill('October news');
  await page.getByLabel('From address').fill('news@example.test');
  await page.getByLabel('Email template').selectOption({ label: 'Monthly news · v2' });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October news' })).toBeVisible();
  await page.getByLabel('Send time').fill('in 2 hours');
  await page.getByRole('button', { name: 'Schedule broadcast', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('scheduled');
  await page.getByRole('button', { name: 'Cancel broadcast', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('canceled');
  expect(errors).toEqual([]);
});

test('automation sequence editor, test event, wait timeline and cancellation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('link', { name: 'Automations', exact: true }).click();
  await page.getByRole('button', { name: 'Create automation', exact: true }).click();
  await page.getByLabel('Automation name', { exact: true }).fill('Welcome sequence');
  await page.getByLabel('Automation identifier', { exact: true }).fill('welcome-sequence');
  await page.getByRole('button', { name: 'Create sequence', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome sequence' })).toBeVisible();
  await page.getByLabel('Trigger event', { exact: true }).fill('signed_up');
  await page.getByLabel('Wait seconds', { exact: true }).fill('120');
  await page.getByRole('checkbox', { name: 'Enable for new events' }).check();
  await page.getByRole('button', { name: 'Save sequence', exact: true }).click();
  await expect(page.getByText(/Revision 2 · running sequences/)).toBeVisible();
  await page.screenshot({ path: 'test-results/automation-editor.png', fullPage: true });
  await page.getByRole('button', { name: 'Send test event', exact: true }).click();
  await page.getByLabel('Contact ID', { exact: true }).fill('00000000-0000-4000-8000-000000000077');
  await page.getByRole('button', { name: 'Submit event', exact: true }).click();
  await page.getByRole('link', { name: 'test@example.test', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Automation run', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'waiting', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel run', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.inline-tags .badge').first()).toHaveText('canceled');
  expect(errors).toEqual([]);
});
