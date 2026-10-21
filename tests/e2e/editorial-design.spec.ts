import { expect, test, type Locator, type Page, type Response } from '@playwright/test';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

async function expectNoPageOverflow(page: Page) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) -
            document.documentElement.clientWidth,
        ),
      { message: `${new URL(page.url()).pathname} fits the viewport` },
    )
    .toBeLessThanOrEqual(1);
}

async function textContrast(locator: Locator) {
  return locator.evaluate((element) => {
    let ancestor: Element | null = element;
    let background = 'rgb(255, 255, 255)';
    while (ancestor) {
      const color = getComputedStyle(ancestor).backgroundColor;
      if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
        background = color;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    const luminance = (color: string) => {
      const rgb = color
        .match(/[\d.]+/g)!
        .slice(0, 3)
        .map(Number);
      const channels = rgb.map((part) => {
        const value = part / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const [light, dark] = [luminance(getComputedStyle(element).color), luminance(background)].sort(
      (a, b) => b - a,
    );
    return (light! + 0.05) / (dark! + 0.05);
  });
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('editorial headings and body load distinct local font assets', async ({ page }) => {
  const fontResponses: Response[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.woff2')) fontResponses.push(response);
  });
  await page.goto('/login');
  const typography = await page.evaluate(async () => {
    await document.fonts.ready;
    const firstFamily = (value: string) => value.split(',')[0]!.trim().replace(/["']/g, '');
    return {
      heading: firstFamily(getComputedStyle(document.querySelector('h1')!).fontFamily),
      headingStack: getComputedStyle(document.querySelector('h1')!).fontFamily,
      body: firstFamily(getComputedStyle(document.body).fontFamily),
      loaded: Array.from(document.fonts)
        .filter((font) => font.status === 'loaded')
        .map((font) => firstFamily(font.family)),
    };
  });
  expect(typography.heading).toBeTruthy();
  expect(typography.body).toBeTruthy();
  expect(typography.heading).not.toBe(typography.body);
  expect(typography.headingStack).toContain('serif');
  expect(typography.loaded).toContain(typography.heading);
  expect(typography.loaded).toContain(typography.body);
  expect(fontResponses.length).toBeGreaterThanOrEqual(2);
  for (const response of fontResponses) {
    expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
    expect(response.ok()).toBe(true);
    expect((await response.body()).byteLength).toBeGreaterThan(0);
  }
});

test('login, invitations and public preferences fit narrow screens and keep forms usable', async ({
  page,
}) => {
  await login(page);
  const contact = await page.request.post('/api/contacts', {
    headers: { Origin: 'http://localhost:4310' },
    data: {
      email: 'a-long-recipient-address-for-mobile-preferences@example.test',
      first_name: 'Alex',
    },
  });
  expect(contact.ok()).toBe(true);
  await page.context().clearCookies();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const [url, heading] of [
      ['/login', 'Welcome back'],
      ['/invite?token=editorial-invitation', 'Join your team'],
      ['/preferences/browser-fixture-link', 'Email preferences'],
    ]) {
      await page.goto(url!);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      await expectNoPageOverflow(page);
    }
  }
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('checkbox', { name: /Unsubscribe from all broadcasts/ }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your preferences have been saved');
  await expectNoPageOverflow(page);
});

test('every sidebar module renders its main heading without overflow on desktop and mobile', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  const pages = await page
    .getByRole('navigation', { name: 'Workspace pages' })
    .getByRole('link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')!));
  expect(pages).toHaveLength(25);
  expect(new Set(pages).size).toBe(pages.length);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const url of pages) {
      await test.step(`${url} at ${width}px`, async () => {
        const response = await page.goto(url);
        expect(response?.ok(), url).toBe(true);
        await expect(page.locator('#main-content h1').first()).toBeVisible();
        await expectNoPageOverflow(page);
      });
    }
  }
  expect(errors).toEqual([]);
});

test('populated tables and the workflow content editor remain usable across screen sizes', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(90000);
  await request.post('http://127.0.0.1:4311/fixtures/inbound-pagination');
  await login(page);
  const workflow = await page.request.post('/api/workflows', {
    headers: { Origin: 'http://localhost:4310' },
    data: {
      workflowId: 'editorial-responsive-welcome',
      name: 'Customer welcome · Email and Inbox',
      steps: [
        {
          stepId: 'email',
          name: 'A personal welcome',
          type: 'email',
          controlValues: { subject: 'Welcome aboard', body: '<p>Your workspace is ready.</p>' },
        },
      ],
    },
  });
  expect(workflow.ok()).toBe(true);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/inbound');
    await expect(
      page.getByRole('table', { name: 'Received email', exact: true }).locator('tbody tr'),
    ).toHaveCount(50);
    await expectNoPageOverflow(page);
    const rules = page.locator('.table-panel').filter({
      has: page.getByRole('table', { name: 'Forwarding rules', exact: true }),
    });
    await rules.getByLabel('Rows per page').selectOption('10');
    await expect(rules.locator('tbody tr')).toHaveCount(10);
    await rules.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(rules.getByText('11–20 of 31 loaded results', { exact: true })).toBeVisible();
    await expectNoPageOverflow(page);

    await page.goto('/workflows/editorial-responsive-welcome');
    await expect(
      page.getByRole('heading', { name: 'Customer welcome · Email and Inbox', exact: true }),
    ).toBeVisible();
    await page.getByRole('tab', { name: 'Content', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Editor content', exact: true });
    await expect(editor).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeVisible();
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`workflow-${width}.png`), fullPage: true });
    if (width === 1440) {
      const theme = page.getByRole('button', { name: 'Toggle color theme', exact: true });
      await theme.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('.monaco-editor.vs-dark')).toBeVisible();
      await expect(editor).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('workflow-dark.png'), fullPage: true });
      await theme.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('.monaco-editor.vs')).toBeVisible();
    }
  }
});

test('public entry text stays readable in both themes and honors reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/login');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const locator of [
      page.getByRole('heading', { name: 'Welcome back', exact: true }),
      page.getByText('Sign in to keep things moving.', { exact: true }),
      page.getByText('Only required if you enabled two-factor authentication.', { exact: true }),
      submit,
    ]) {
      expect(await textContrast(locator), `${theme} entry text contrast`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    const motion = await submit.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitions: style.transitionDuration.split(',').map(parseFloat),
        animations: style.animationDuration.split(',').map(parseFloat),
      };
    });
    expect(motion.reduced).toBe(true);
    expect(motion.transitions.every((seconds) => seconds <= 0.001)).toBe(true);
    expect(motion.animations.every((seconds) => seconds <= 0.001)).toBe(true);
  }
});
