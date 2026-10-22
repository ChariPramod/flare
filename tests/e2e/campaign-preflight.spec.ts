import { expect, test, type Page } from '@playwright/test';
const headers = { Origin: 'http://localhost:4310' };
async function openCampaign(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  const response = await page.request.post('/api/broadcasts', {
    headers,
    data: {
      name: 'Checklist campaign',
      sender: 'news@example.test',
      content: {
        subject: 'Hello {{first_name}}',
        html: '<p>Hello</p><a href="{{{FLARE_UNSUBSCRIBE_URL}}}">Preferences</a>',
        variables: {},
      },
    },
  });
  expect(response.ok()).toBe(true);
  const campaign = await response.json();
  await page.goto(`/broadcasts/${campaign.id}`);
  await expect(page.getByRole('region', { name: 'Pre-send checklist' })).toContainText(
    'Mailpit sandbox',
  );
  return campaign.id as string;
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('explicit small-recipient sandbox tests never schedule the campaign and keep outcomes separate on mobile', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await openCampaign(page);
  let sends = 0,
    schedules = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/schedule')) schedules++;
  });
  await page.route(`**/api/broadcasts/${id}/test`, async (route) => {
    sends++;
    expect(route.request().postDataJSON()).toEqual({
      revision: 'a'.repeat(64),
      sandbox: true,
      recipients: ['me@example.test', 'second@example.test'],
    });
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    await route.fulfill({
      json: {
        data: [
          { id: 'test-one', status: 'queued' },
          { id: 'test-two', status: 'suppressed' },
        ],
        sandbox: true,
        template_version: 1,
        replay_until: new Date(Date.now() + 86400000).toISOString(),
      },
    });
  });
  expect(sends).toBe(0);
  await page.getByRole('button', { name: 'Review test email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Send a controlled test' });
  await expect(dialog).toContainText('does not reach external mailboxes');
  await dialog
    .getByLabel('Test recipient addresses')
    .fill('1@example.test,2@example.test,3@example.test,4@example.test');
  await expect(
    dialog.getByRole('button', { name: 'Send test to Mailpit', exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel('Test recipient addresses').fill('Me@example.test; second@example.test');
  await dialog.getByRole('button', { name: 'Send test to Mailpit', exact: true }).click();
  await expect(dialog).toContainText('Test request accepted');
  await expect(dialog).toContainText('Acceptance does not establish delivery');
  expect(sends).toBe(1);
  expect(schedules).toBe(0);
  await expect(dialog.getByRole('link', { name: 'View test email' })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('button', { name: 'Review test email', exact: true }).click();
  await expect(dialog).toContainText('Test request accepted');
  expect(sends).toBe(1);
});

test('a lost response keeps the same intent across closing and reopening; a deliberate new test gets a new key', async ({
  page,
}) => {
  const id = await openCampaign(page);
  const requests: { body: unknown; key: string }[] = [];
  await page.route(`**/api/broadcasts/${id}/test`, async (route) => {
    requests.push({
      body: route.request().postDataJSON(),
      key: route.request().headers()['idempotency-key']!,
    });
    if (requests.length === 1)
      return route.fulfill({
        status: 503,
        json: { message: 'Response unavailable; retry safely' },
      });
    return route.fulfill({
      json: {
        data: [{ id: 'one-message', status: 'queued' }],
        sandbox: true,
        template_version: 1,
        replay_until: new Date(Date.now() + 86400000).toISOString(),
      },
    });
  });
  await page.getByRole('button', { name: 'Review test email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Send a controlled test' });
  await dialog.getByLabel('Test recipient addresses').fill('reviewer@example.test');
  await dialog.getByRole('button', { name: 'Send test to Mailpit', exact: true }).click();
  await expect(dialog).toContainText('Response unavailable');
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('button', { name: 'Review test email', exact: true }).click();
  await expect(dialog.getByLabel('Test recipient addresses')).toBeDisabled();
  await dialog.getByRole('button', { name: 'Retry same test', exact: true }).click();
  await expect(dialog).toContainText('Test request accepted');
  expect(requests[0]).toEqual(requests[1]);
  page.once('dialog', (dialog) => dialog.accept());
  await dialog.getByRole('button', { name: 'Start a separate test', exact: true }).click();
  await expect(dialog.getByLabel('Test recipient addresses')).toBeEnabled();
  await dialog.getByRole('button', { name: 'Send test to Mailpit', exact: true }).click();
  await expect(dialog).toContainText('Test request accepted');
  expect(requests[2]!.key).not.toBe(requests[1]!.key);
});

test('failed preflight and real-mode blockers remain actionable without enabling a send', async ({
  page,
}) => {
  const id = await openCampaign(page);
  await page.route(`**/api/broadcasts/${id}/preflight`, (route) =>
    route.fulfill({ status: 503, json: { message: 'Readiness unavailable' } }),
  );
  await page.getByRole('button', { name: 'Refresh checklist', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pre-send checklist' })).toContainText(
    'Readiness unavailable',
  );
  await expect(page.getByRole('button', { name: 'Review test email', exact: true })).toBeDisabled();
  await page.route(`**/api/broadcasts/${id}/preflight`, (route) =>
    route.fulfill({
      json: {
        revision: 'b'.repeat(64),
        sandbox: false,
        checked_at: new Date().toISOString(),
        ready: false,
        can_test: false,
        checks: [
          {
            id: 'approval',
            status: 'blocked',
            message: 'Marketing requires operator approval',
            href: '/emails',
          },
        ],
      },
    }),
  );
  await page.getByRole('button', { name: 'Refresh checklist', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pre-send checklist' })).toContainText(
    'Marketing requires operator approval',
  );
  await page.getByRole('button', { name: 'Review test email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Send a controlled test' });
  await expect(dialog).toContainText('Real delivery');
  await dialog.getByLabel('Test recipient addresses').fill('me@example.test');
  await expect(dialog.getByRole('button', { name: 'Send test email', exact: true })).toBeDisabled();
});

test('audience checklist actions navigate to the actual contact module', async ({ page }) => {
  await openCampaign(page);
  await page
    .getByRole('region', { name: 'Pre-send checklist' })
    .getByRole('link', { name: 'Review audience', exact: true })
    .click();
  await expect(page).toHaveURL(/\/audience$/);
  await expect(page.getByRole('button', { name: 'Import contacts', exact: true })).toBeVisible();
});
