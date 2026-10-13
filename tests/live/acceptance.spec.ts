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
  await page.getByRole('dialog').getByRole('button', { name: 'Create workflow' }).click();
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
