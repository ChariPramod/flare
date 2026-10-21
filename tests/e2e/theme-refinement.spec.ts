import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('saved dark mode is restored before public content is parsed and survives navigation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('flare-theme', 'dark');
    const observer = new MutationObserver(() => {
      if (document.body) {
        document.documentElement.dataset.firstBodyTheme = document.documentElement.dataset.theme;
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  for (const path of ['/login', '/invite?token=theme-test', '/preferences/browser-fixture-link']) {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-first-body-theme', 'dark');
    await expect(page.locator('h1')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('unavailable theme storage leaves the login and authenticated theme switch usable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Storage unavailable', 'SecurityError');
      },
    });
  });
  await page.goto('/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle color theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Toggle color theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('theme bootstrap is a synchronous same-origin head asset', async ({ page }) => {
  await page.goto('/login');
  const script = page.locator('head script[src="/theme.js"]');
  await expect(script).toHaveCount(1);
  expect(
    await script.evaluate((element) => ({
      async: (element as HTMLScriptElement).async,
      defer: (element as HTMLScriptElement).defer,
    })),
  ).toEqual({ async: false, defer: false });
  expect((await page.request.get('/theme.js')).ok()).toBe(true);
});
