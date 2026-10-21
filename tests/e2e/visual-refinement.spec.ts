import { expect, test, type Page } from '@playwright/test';

// Baselines are generated with ops/Dockerfile.browser-tests, never on macOS.
test.skip(process.platform !== 'linux', 'Visual baselines use the pinned Linux browser');

async function snapshot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.005,
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} editorial screens retain their visual hierarchy`, async ({ page, request }) => {
    test.setTimeout(90000);
    await request.post('http://127.0.0.1:4311/reset');
    await page.clock.setFixedTime(new Date('2026-10-21T12:00:00Z'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((value) => localStorage.setItem('flare-theme', value), theme);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await snapshot(page, `login-${theme}.png`);

    await page.getByLabel('Work email').fill('tester@example.test');
    await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh overview', exact: true })).toBeEnabled();
    await expect(page.getByText('Waiting for workspace data…')).toHaveCount(0);
    await snapshot(page, `overview-${theme}.png`);

    await page.request.post('/api/workflows', {
      headers: { Origin: 'http://localhost:4310' },
      data: {
        workflowId: 'visual-welcome',
        name: 'Customer welcome',
        description: 'A personal welcome for every new customer.',
        steps: [
          {
            stepId: 'email',
            name: 'Welcome email',
            type: 'email',
            controlValues: {
              subject: 'Welcome aboard',
              body: '<p>Your workspace is ready.</p>',
            },
          },
        ],
      },
    });
    // Fix only a fixture timestamp; state, errors and operational badges remain visible.
    await page.route(
      (url) => url.pathname === '/api/workflows',
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch();
        const body = await response.json();
        await route.fulfill({
          response,
          json: {
            ...body,
            data: body.data.map((row: Record<string, unknown>) => ({
              ...row,
              updated_at: '2026-10-21T12:00:00Z',
            })),
          },
        });
      },
    );
    await page.goto('/workflows');
    await expect(
      page.getByRole('link', { name: 'Customer welcome visual-welcome', exact: true }),
    ).toBeVisible();
    await snapshot(page, `table-${theme}.png`);
    await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await snapshot(page, `dialog-${theme}.png`);
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto('/workflows/visual-welcome');
    await expect(
      page.getByRole('heading', { name: 'Customer welcome', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.react-flow__node-step')).toHaveCount(1);
    await expect(page.locator('.react-flow__node')).toHaveCount(3);
    await snapshot(page, `editor-${theme}.png`);
  });
}
