import { expect, test } from '@playwright/test';

test('navigation breakpoints and mobile policy status remain usable', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4311/reset');
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 899, 900, 901, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
      .toBeLessThanOrEqual(1);
    if (width === 390) {
      const heading = page.getByRole('heading', { name: 'Sending access', exact: true });
      await expect(heading).toBeInViewport();
      await expect(page.getByText('Awaiting review', { exact: true })).toBeInViewport();
    }
    if (width <= 900) {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true });
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole('navigation', { name: 'Workspace pages' }).getByRole('link'),
      ).toHaveCount(25);
      await page.keyboard.press('Escape');
      await expect(drawer).toBeHidden();
    }
  }
});

test('CSS magnification at 200 percent keeps editor actions and dialog controls reachable', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/reset');
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workflows', {
    headers: { Origin: 'http://localhost:4310' },
    data: { workflowId: 'zoom-welcome', name: 'Zoom welcome', steps: [] },
  });
  expect(created.ok()).toBe(true);
  await page.goto('/workflows/zoom-welcome');
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.getByRole('button', { name: 'Add first step', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});

test('the 720 by 480 viewport equivalent of 200 percent browser zoom reflows the editor and dialog', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/reset');
  // Browser zoom on a 1440×960 window halves its CSS viewport at 200%.
  // Exercise that reflow separately from CSS zoom, which retains desktop media queries.
  await page.setViewportSize({ width: 720, height: 480 });
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const created = await page.request.post('/api/workflows', {
    headers: { Origin: 'http://localhost:4310' },
    data: { workflowId: 'reflow-welcome', name: 'Reflow welcome', steps: [] },
  });
  expect(created.ok()).toBe(true);
  await page.goto('/workflows/reflow-welcome');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  const save = page.getByRole('button', { name: 'Save changes', exact: true });
  await save.scrollIntoViewIfNeeded();
  await expect(save).toBeInViewport();
  await page.getByRole('button', { name: 'Add first step', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a step', exact: true });
  const lastOption = dialog.getByRole('button', { name: /HTTP request/ });
  await lastOption.scrollIntoViewIfNeeded();
  await expect(lastOption).toBeInViewport();
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth))
    .toBeLessThanOrEqual(1);
  await close.click();
  await expect(dialog).toBeHidden();
});
