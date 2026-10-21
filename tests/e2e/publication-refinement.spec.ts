import { expect, test, type Page } from '@playwright/test';

const operationId = '2fa650c6-524f-4f14-b2ec-737ed1b2bc1a';
const recentId = '544e174e-107c-4e25-a6c8-13daf0208119';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email', { exact: true }).fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('publication locks acceptance controls, then permits closing while durable work and history refresh continue', async ({
  page,
}) => {
  await login(page);
  expect(
    (
      await page.request.post('/api/workflows', {
        headers: { Origin: 'http://localhost:4310' },
        data: { workflowId: 'guarded-publication', name: 'Guarded publication', steps: [] },
      })
    ).ok(),
  ).toBe(true);
  const acceptance = latch();
  const history = latch();
  let accepted = false;
  let requests = 0;
  await page.route(
    (url) => url.pathname === '/api/publish',
    async (route) => {
      requests++;
      await acceptance.promise;
      accepted = true;
      await route.fulfill({ json: { id: operationId, status: 'pending' } });
    },
  );
  await page.route(
    (url) => url.pathname === '/api/publications',
    async (route) => {
      if (accepted) {
        await history.promise;
        return route.fulfill({ status: 503, json: { message: 'Publication history unavailable' } });
      }
      return route.fulfill({
        json: [{ id: recentId, status: 'completed', created_at: '2026-10-21T12:00:00Z' }],
      });
    },
  );
  await page.route(`**/api/publications/${operationId}`, (route) =>
    route.fulfill({ json: { id: operationId, status: 'pending', error: null, items: [] } }),
  );
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish to Production', exact: true });
  const selection = dialog.getByRole('checkbox').first();
  const recent = dialog.getByRole('button', { name: /^completed ·/ });
  await expect(recent).toBeVisible();
  await selection.check();
  await dialog.getByRole('button', { name: 'Publish 1 selected', exact: true }).click();
  await expect(dialog).toHaveAttribute('aria-busy', 'true');
  await expect(selection).toBeDisabled();
  await expect(recent).toBeDisabled();
  for (const button of await dialog.getByRole('button', { name: 'Close', exact: true }).all())
    await expect(button).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  expect(requests).toBe(1);
  acceptance.release();
  await expect(dialog.locator('code').filter({ hasText: operationId })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
  await expect(dialog).not.toHaveAttribute('aria-busy', 'true');
  history.release();
  await expect(dialog.getByRole('alert')).toHaveText('Publication history unavailable');
  await expect(dialog.getByRole('button', { name: 'Retry publication history' })).toBeEnabled();
  await expect(dialog.locator('code').filter({ hasText: operationId })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('publication retries clear old errors, serialize acceptance and distinguish an accepted retry from a failed status refresh', async ({
  page,
}) => {
  await login(page);
  await page.route(
    (url) => url.pathname === '/api/publications',
    (route) =>
      route.fulfill({
        json: [{ id: operationId, status: 'failed', created_at: '2026-10-21T12:00:00Z' }],
      }),
  );
  let accepted = false;
  await page.route(`**/api/publications/${operationId}`, (route) =>
    route.fulfill(
      accepted
        ? { status: 503, json: { message: 'Publication status unavailable' } }
        : { json: { id: operationId, status: 'failed', error: null, items: [] } },
    ),
  );
  const acceptance = latch();
  let requests = 0;
  await page.route(`**/api/publications/${operationId}/retry`, async (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({ status: 503, json: { message: 'Retry temporarily unavailable' } });
    await acceptance.promise;
    accepted = true;
    return route.fulfill({ json: { id: operationId, status: 'pending' } });
  });
  await page.getByRole('button', { name: 'Publish changes', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Publish to Production', exact: true });
  await dialog.getByRole('button', { name: /^failed ·/ }).click();
  await dialog.getByRole('button', { name: 'Retry publication', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Retry temporarily unavailable');
  await dialog.getByRole('button', { name: 'Retry publication', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Accepting retry…' })).toBeDisabled();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: /^failed ·/ })).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Review corrected resources for replacement' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(requests).toBe(2);
  acceptance.release();
  await expect(dialog.getByRole('status')).toHaveText(
    'Retry accepted. Closing this dialog does not cancel the operation.',
  );
  await expect(dialog.getByRole('alert')).toHaveText('Publication status unavailable');
  await expect(
    dialog.getByRole('button', { name: 'Retry publication', exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Refresh publication status' })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeEnabled();
  expect(requests).toBe(2);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
