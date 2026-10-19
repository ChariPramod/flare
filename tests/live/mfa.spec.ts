import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';

// Enrollment material must never enter retained screenshots, videos or traces.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live MFA acceptance`);
  return value;
}

// This independent authenticator derives RFC 6238 codes from the key shown by the UI.
function authenticatorCode(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret]
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return ((digest.readUInt32BE(digest[19]! & 15) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, '0');
}

async function fillPrivate(locator: Locator, value: string) {
  // Playwright's default failed-fill call log contains its input argument.
  try {
    await locator.fill(value);
  } catch {
    throw new Error('Could not fill a private authentication field');
  }
}

async function expectPrivateFieldsCleared(page: Page) {
  await expect
    .poll(
      async () => {
        try {
          return (
            (await page.getByLabel('Current password').inputValue()) === '' &&
            (await page.getByLabel('Authenticator or recovery code').inputValue()) === ''
          );
        } catch {
          throw new Error('Could not inspect private authentication fields');
        }
      },
      { message: 'Password and authentication code are cleared' },
    )
    .toBe(true);
}

async function login(page: Page, email: string, password: string, code = '', accepted = true) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await fillPrivate(page.getByLabel('Password', { exact: true }), password);
  await fillPrivate(page.getByLabel('Authenticator or recovery code'), code);
  const response = page.waitForResponse(
    (result) => new URL(result.url()).pathname === '/api/auth/login',
  );
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // The dashboard intentionally strips the bearer token from this response.
  expect((await response).status(), 'Browser login HTTP status').toBe(accepted ? 200 : 401);
  if (accepted)
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
}

async function enroll(page: Page, password: string) {
  await fillPrivate(page.getByLabel('Current password'), password);
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy authenticator secret' })).toBeVisible();
  let secret: string;
  try {
    secret = (await page.locator('.secret-box code').textContent())!;
  } catch {
    throw new Error('Could not read the private authenticator key');
  }
  expect(/^[A-Z2-7]{32}$/.test(secret), 'The UI exposes a valid authenticator key').toBe(true);
  await fillPrivate(page.getByLabel('Authenticator or recovery code'), authenticatorCode(secret));
  await page.getByRole('button', { name: 'Enable two-factor authentication', exact: true }).click();
  await expect(page.getByText('Save these recovery codes', { exact: true })).toBeVisible();
  let recovery: string[];
  try {
    recovery = JSON.parse(await page.locator('.info-banner pre').innerText()) as string[];
  } catch {
    throw new Error('Could not parse the private recovery codes');
  }
  expect(recovery.length, 'Recovery code count').toBe(10);
  expect(new Set(recovery).size, 'Recovery codes are distinct').toBe(10);
  await expectPrivateFieldsCleared(page);
  await expect(page.getByRole('button', { name: 'Copy authenticator secret' })).toBeHidden();
  return { secret, recovery };
}

test('live browser MFA enrollment, recovery replay, session revocation and viewer restrictions', async ({
  browser,
  baseURL,
}) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Creates an isolated user in the disposable stack');
  test.setTimeout(180000);
  // Disable automatic error-context DOM snapshots as well as visual artifacts.
  // browser.mjs also sets this before the Playwright worker starts.
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
  const contexts: BrowserContext[] = [];
  const newPage = async () => {
    const context = await browser.newContext({ baseURL });
    contexts.push(context);
    return context.newPage();
  };
  try {
    const owner = await newPage();
    await login(owner, required('E2E_EMAIL'), required('E2E_PASSWORD'));
    const email = `browser-mfa-${randomUUID()}@example.test`;
    const password = randomBytes(32).toString('base64url');
    const invite = await owner.request.post('/api/team/invites', {
      headers: { Origin: new URL(owner.url()).origin },
      data: { email, role: 'viewer' },
    });
    expect(invite.status(), 'Viewer invitation HTTP status').toBe(201);
    const invitation = new URL((await invite.json()).accept_url);
    const page = await newPage();
    // Keep the invitation token in memory and on the real invitation page only.
    try {
      await page.goto(`${invitation.pathname}${invitation.search}`);
    } catch {
      throw new Error('Could not open the private invitation page');
    }
    await page.getByLabel('Your name').fill('Browser MFA acceptance');
    await fillPrivate(page.getByLabel('Create password'), password);
    await page.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Workflows', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create workflow', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Publish changes', exact: true })).toBeHidden();
    const write = await page.request.post('/api/workflows', {
      headers: { Origin: new URL(page.url()).origin },
      data: { workflowId: `forbidden-${randomUUID()}`, name: 'Forbidden viewer mutation' },
    });
    expect(write.status(), 'Viewer writes are denied by the real API').toBe(403);
    expect(
      (await page.request.get('/api/session')).status(),
      'A role denial retains the session',
    ).toBe(200);

    const older = await newPage();
    await login(older, email, password);
    await page.goto('/settings');
    const first = await enroll(page, password);
    // MFA enrollment invalidates sessions issued before enrollment.
    expect((await older.request.get('/api/session')).status()).toBe(401);
    await older.reload();
    await expect(older.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(older.getByRole('heading', { name: 'Overview', exact: true })).toBeHidden();

    const preLogout = await page.context().cookies();
    expect(preLogout.find((cookie) => cookie.name === 'flare_session')?.httpOnly).toBe(true);
    await logout(page);
    const revoked = await newPage();
    await revoked.context().addCookies(preLogout);
    expect(
      (await revoked.request.get('/api/session')).status(),
      'Logout revokes server session',
    ).toBe(401);
    await login(page, email, password, '', false);
    await login(page, email, password, first.recovery[0]!);
    await page.goto('/settings');
    await expect(page.getByText('Save these recovery codes', { exact: true })).toBeHidden();
    await logout(page);
    await login(page, email, password, first.recovery[0]!, false);
    await login(page, email, password, first.recovery[1]!);

    await page.goto('/settings');
    await fillPrivate(page.getByLabel('Current password'), password);
    await fillPrivate(page.getByLabel('Authenticator or recovery code'), first.recovery[2]!);
    await page.getByRole('button', { name: 'Disable two-factor authentication' }).click();
    await expect(
      page.getByRole('button', { name: 'Set up authenticator', exact: true }),
    ).toBeDisabled();
    await expectPrivateFieldsCleared(page);
    await expect(page.getByText('Save these recovery codes', { exact: true })).toBeHidden();
    const second = await enroll(page, password);
    expect(second.secret !== first.secret, 'Re-enrollment rotates the authenticator key').toBe(
      true,
    );
    expect(
      second.recovery.every((code) => !first.recovery.includes(code)),
      'Recovery codes rotate',
    ).toBe(true);
    await logout(page);
    await login(page, email, password, first.recovery[3]!, false);
    await login(page, email, password, second.recovery[0]!);
    // Browser cookie expiry cannot expose cached protected account data after navigation.
    const cookies = await page.context().cookies();
    await page.context().addCookies(cookies.map((cookie) => ({ ...cookie, expires: 1 })));
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect((await page.request.get('/api/session')).status()).toBe(401);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
