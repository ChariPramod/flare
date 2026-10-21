import { expect, test, type Page } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('deep links reveal the current navigation item and collapsed labels work from the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  await page.goto('/settings');
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation', exact: true });
  const current = navigation.getByRole('link', { name: 'Settings', exact: true });
  await expect(current).toHaveAttribute('aria-current', 'page');
  await expect
    .poll(async () => {
      const box = await current.boundingBox();
      const viewport = await navigation.boundingBox();
      return Boolean(
        box &&
        viewport &&
        box.y >= viewport.y &&
        box.y + box.height <= viewport.y + viewport.height,
      );
    })
    .toBe(true);
  const toggle = page.getByRole('button', { name: 'Toggle sidebar', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Shift+Tab');
  await expect(current).toBeFocused();
  await expect(page.getByRole('tooltip', { name: 'Settings', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(current).toBeFocused();
  await expectNoOverflow(page);
});

test('environment switching announces pending work and preserves context after failure', async ({
  page,
}) => {
  await login(page);
  let requests = 0;
  let release: (() => void) | undefined;
  await page.route('**/api/session/switch', async (route) => {
    requests++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({ status: 503, json: { message: 'Environment temporarily unavailable' } });
  });
  const environment = page.getByLabel('Environment', { exact: true });
  const previous = await environment.inputValue();
  await environment.selectOption({ label: 'Production' });
  await expect(environment).toBeDisabled();
  await expect(page.getByLabel('Organization', { exact: true })).toBeDisabled();
  await expect(page.getByRole('status').filter({ hasText: 'Switching workspace' })).toBeVisible();
  expect(requests).toBe(1);
  expect(release).toBeDefined();
  release!();
  await expect(
    page.getByText('Environment temporarily unavailable', { exact: true }),
  ).toBeVisible();
  await expect(environment).toBeEnabled();
  await expect(environment).toHaveValue(previous);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  expect(requests).toBe(1);
});

test('sending policy is visible above the fold on a typical laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await login(page);
  const policy = page.getByRole('region', { name: 'Sending access', exact: true });
  await expect(policy).toContainText(/Awaiting review|Approved|Sending paused/);
  const box = await policy.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(768);
  await expectNoOverflow(page);
});

test('workspace headings and panels follow the shared desktop and mobile scale', async ({
  page,
}) => {
  await login(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const headingSize = width > 900 ? '36px' : '30px';
    const panelPadding = width > 900 ? '24px' : '16px';
    await page.goto('/overview');
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toHaveCSS(
      'font-size',
      headingSize,
    );
    await expect(page.getByRole('heading', { name: 'Sending access', exact: true })).toHaveCSS(
      'font-size',
      '22px',
    );
    await expect(page.getByRole('region', { name: 'Sending access', exact: true })).toHaveCSS(
      'padding',
      panelPadding,
    );
    await expectNoOverflow(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toHaveCSS(
      'font-size',
      headingSize,
    );
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toHaveCSS(
      'font-size',
      '22px',
    );
    await expect(page.locator('.panel').first()).toHaveCSS('padding', panelPadding);
    await expectNoOverflow(page);
    await page.goto('/metrics');
    await expect(page.getByRole('heading', { name: 'Delivery metrics', exact: true })).toHaveCSS(
      'font-size',
      headingSize,
    );
    await expect(page.locator('.metric-card').first()).toHaveCSS('padding', panelPadding);
    await expectNoOverflow(page);
  }
});

test('metrics fits narrow screens and primary mobile shell controls have touch-sized targets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/metrics');
  await expect(page.getByRole('heading', { name: 'Delivery metrics', exact: true })).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expectNoOverflow(page);
  for (const label of ['Open navigation', 'Search pages', 'Toggle color theme', 'Account menu']) {
    const box = await page.getByRole('button', { name: label, exact: true }).boundingBox();
    expect(box?.height, label).toBeGreaterThanOrEqual(44);
    expect(box?.width, label).toBeGreaterThanOrEqual(44);
  }
  expect(
    await page
      .getByLabel('Metric workflow')
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('16px');
});

test('keyboard field focus uses the full accent and reduced motion stops animation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const email = page.getByLabel('Work email');
  await email.focus();
  const focus = await email.evaluate((element) => {
    const style = getComputedStyle(element);
    const probe = document.createElement('span');
    probe.style.color = 'var(--accent)';
    document.body.appendChild(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    return {
      outline: style.outlineColor,
      accent,
      width: style.outlineWidth,
      transition: style.transitionDuration,
      animation: style.animationName,
    };
  });
  expect(focus.outline).toBe(focus.accent);
  expect(focus.width).toBe('2px');
  expect(focus.transition).toBe('0s');
  expect(focus.animation).toBe('none');
});

test('editor height follows wrapping header content on a short laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 600 });
  await login(page);
  const workflow = await page.request.post('/api/workflows', {
    headers: { Origin: 'http://localhost:4310' },
    data: {
      workflowId: 'layout-short-editor',
      name: 'Short laptop workflow',
      steps: [{ stepId: 'inbox', name: 'Inbox', type: 'in_app', controlValues: { body: 'Hello' } }],
    },
  });
  expect(workflow.ok()).toBe(true);
  await page.route('**/api/session', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.organizations[0].name = 'A workspace with a deliberately long organization name';
    data.organizations[0].environments[0].name =
      'Development environment with an extended context label';
    await route.fulfill({ response, json: data });
  });
  await page.goto('/workflows/layout-short-editor');
  await expect(
    page.getByRole('heading', { name: 'Short laptop workflow', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const editor = await page.locator('#main-content').boundingBox();
  expect(editor).not.toBeNull();
  expect(editor!.height).toBeGreaterThan(100);
  expect(editor!.y + editor!.height).toBeLessThanOrEqual(601);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
  await expectNoOverflow(page);
});
