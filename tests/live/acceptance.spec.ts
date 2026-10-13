import { test, expect } from '@playwright/test';
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live-stack acceptance`);
  return value;
}
test('live login → workflow → Novu activity', async ({ page }) => {
  const suffix = Date.now();
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Development' });
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await page.getByLabel('Workflow name').fill(`Acceptance ${suffix}`);
  const [created] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/workflows' &&
        response.request().method() === 'POST',
    ),
    page.getByRole('dialog').getByRole('button', { name: 'Create workflow' }).click(),
  ]);
  expect(created.status(), 'Workflow creation HTTP status').toBe(201);
  await expect(
    page.getByRole('heading', { name: `Acceptance ${suffix}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add first step' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^In-app / })
    .click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Revision 2')).toBeVisible();
  await page.getByRole('button', { name: 'Test workflow' }).click();
  await page
    .getByLabel('Subscriber ID', { exact: true })
    .fill(process.env.E2E_SUBSCRIBER ?? 'demo-subscriber');
  await page.getByRole('button', { name: 'Run test' }).click();
  await expect(page.getByRole('heading', { name: 'Trigger accepted' })).toBeVisible();
  await page.getByRole('link', { name: /accepted · \d+ attempts/ }).click();
  await expect(page.getByRole('heading', { name: 'Run timeline' })).toBeVisible();
  await expect(page.getByText('accepted', { exact: true })).toBeVisible();
});
test('live domain DNS screen → email → provider acceptance', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Domains', exact: true }).click();
  await page.getByRole('button', { name: 'Add domain', exact: true }).click();
  await page.getByLabel('Domain name').fill(`acceptance-${Date.now()}.example.test`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add domain', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DNS records' })).toBeVisible();
  // Use a separately verified real domain; this test never bypasses DNS verification.
  await page.getByRole('link', { name: 'Emails', exact: true }).click();
  await page.getByRole('button', { name: 'Send email', exact: true }).click();
  await page.getByLabel('From', { exact: true }).fill(required('E2E_FROM'));
  await page.getByRole('textbox', { name: /^To / }).fill(required('E2E_TO'));
  const subject = `Live acceptance ${Date.now()}`;
  await page.getByLabel('Subject', { exact: true }).fill(subject);
  await page.locator('textarea[name="body"]').fill('Flare live acceptance test.');
  await page.getByRole('dialog').getByRole('button', { name: 'Send email', exact: true }).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();
  await expect(page.locator('.page-heading .badge')).toHaveText(/^(sent|delivered)$/, {
    timeout: 60000,
  });
  await page.getByRole('button', { name: 'Raw MIME' }).click();
  await expect(page.locator('pre').filter({ hasText: 'DKIM-Signature:' })).toBeVisible();
});

test('live inbound retrieval preserves envelope recipients and blocks remote HTML resources', async ({
  page,
}) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires disposable signed inbound fixture');
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.goto(`/inbound/${required('E2E_INBOUND_ID')}`);
  await expect(
    page.getByText('incoming@example.net → hidden@acceptance.test', { exact: true }),
  ).toBeVisible();
  const remote: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('remote.invalid')) remote.push(request.url());
  });
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole('button', { name: 'html', exact: true }).click();
  await expect(
    page.frameLocator('iframe[title="Received HTML preview"]').getByText('Safe incoming body'),
  ).toBeVisible();
  expect(remote).toEqual([]);
  expect(dialogs).toEqual([]);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download original MIME', exact: true }).click();
  expect((await download).suggestedFilename()).toBe(`${required('E2E_INBOUND_ID')}.eml`);
});

test('live layout editing and selected publication reaches verified completion', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.goto('/layouts');
  const name = `Browser layout ${Date.now()}`;
  const identifier = `browser-layout-${Date.now()}`;
  await page.getByRole('button', { name: 'Create layout', exact: true }).click();
  await page.getByLabel('Layout name', { exact: true }).fill(name);
  await page.getByLabel('Layout identifier', { exact: true }).fill(identifier);
  await page.getByRole('button', { name: 'Create wrapper', exact: true }).click();
  await page.getByRole('link', { name, exact: true }).click();
  await page
    .getByLabel('Layout HTML')
    .fill('<main>{{{body}}}</main><footer>Acceptance footer</footer>');
  await page.getByRole('button', { name: 'Save layout version', exact: true }).click();
  await expect(page.getByText(`Version 2 · ${identifier}`, { exact: true })).toBeVisible();
  await page.goto('/workflows');
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('checkbox', { name: new RegExp(identifier) })
    .check();
  await page.getByRole('button', { name: 'Publish 1 selected', exact: true }).click();
  await expect(
    page.getByText('All selected resources and engine updates are verified.', { exact: true }),
  ).toBeVisible({ timeout: 120000 });
});

test('live dead-letter redrive preserves identity and reaches Novu', async ({ page }) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires disposable definitive failure fixture');
  await page.goto('/login');
  await page.getByLabel('Work email').fill(required('E2E_EMAIL'));
  await page.getByLabel('Password', { exact: true }).fill(required('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.goto('/dead-letters');
  const label = `workflow · ${required('E2E_REDRIVE_ID').slice(0, 8)}`;
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Acceptance definitive failure')).toBeVisible();
  await page.getByRole('button', { name: 'Redrive operation', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.goto(`/activity/${required('E2E_REDRIVE_ID')}`);
  await expect(page.getByText('accepted', { exact: true })).toBeVisible({ timeout: 60000 });
});
