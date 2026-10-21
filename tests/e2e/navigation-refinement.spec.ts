import { test, expect, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('page search includes all modules, announces selection and navigates using keywords', async ({
  page,
}) => {
  await login(page);
  const trigger = page.getByRole('button', { name: 'Search pages', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search workspace', exact: true });
  const search = dialog.getByRole('combobox', { name: 'Search pages', exact: true });
  await expect(search).toBeFocused();
  await expect(dialog.getByRole('option')).toHaveCount(25);
  await expect(dialog.getByRole('group', { name: 'WORKSPACE', exact: true })).toBeVisible();
  await expect(dialog.getByRole('group', { name: 'EMAIL', exact: true })).toBeAttached();
  await expect(dialog.getByRole('group', { name: 'DEVELOPER', exact: true })).toBeAttached();
  await expect(dialog.getByRole('option', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('ArrowDown');
  const workflow = dialog.getByRole('option', { name: 'Workflows', exact: true });
  await expect(workflow).toHaveAttribute('aria-selected', 'true');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    (await workflow.getAttribute('id'))!,
  );
  await search.press('ArrowUp');
  await search.press('ArrowUp');
  await expect(dialog.getByRole('option', { name: 'Settings', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(search).toBeFocused();
  await search.fill('  dNs  ');
  await expect(dialog.getByRole('option')).toHaveCount(1);
  await expect(dialog.getByRole('option', { name: 'Domains', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.press('Enter');
  await expect(page).toHaveURL(/\/domains$/);
  await expect(page.getByRole('heading', { name: 'Domains', exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('page search handles no matches, resets on reopen and returns keyboard focus', async ({
  page,
}) => {
  await login(page);
  const trigger = page.getByRole('button', { name: 'Search pages', exact: true });
  await trigger.focus();
  await page.keyboard.press('ControlOrMeta+k');
  const dialog = page.getByRole('dialog', { name: 'Search workspace', exact: true });
  const search = dialog.getByRole('combobox', { name: 'Search pages', exact: true });
  await search.fill('a-page-that-does-not-exist');
  await expect(dialog.getByText('No matching pages', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('option')).toHaveCount(0);
  await expect(search).not.toHaveAttribute('aria-activedescendant');
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page).toHaveURL(/\/overview$/);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Show all pages', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(search).toBeFocused();
  await expect(dialog.getByRole('option')).toHaveCount(25);
  await search.fill('preferences');
  await expect(dialog.getByRole('option', { name: 'Subscribers', exact: true })).toBeVisible();
  await search.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(search).toHaveValue('');
  await expect(dialog.getByRole('option')).toHaveCount(25);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('phone page search is visible, fits the viewport and keeps navigation usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const trigger = page.getByRole('button', { name: 'Search pages', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Search workspace', exact: true });
  const search = dialog.getByRole('combobox', { name: 'Search pages', exact: true });
  await search.fill('inbound');
  await dialog.getByRole('option', { name: 'Received email', exact: true }).click();
  await expect(page).toHaveURL(/\/inbound$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Workspace navigation', exact: true });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('ControlOrMeta+k');
  await expect(dialog).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused();
});

test('sidebar preference survives navigation and reload without hiding mobile controls', async ({
  page,
}) => {
  await login(page);
  const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('link', { name: 'Workflows', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search pages', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
});

test('blocked browser preference storage does not break navigation or theme changes', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    };
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Toggle sidebar', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.getByRole('button', { name: 'Toggle color theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Search pages', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Search pages', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
