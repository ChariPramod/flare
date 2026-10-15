import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test, expect, type Locator, type Page } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
type Fixture = {
  id: string;
  email: string;
  password: string;
  secret: string;
  recoveryCodes: string[];
  orgId: string;
};
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} for disposable operator acceptance`);
  return value;
}
async function privateFill(input: Locator, value: string) {
  try {
    await input.fill(value);
  } catch {
    throw new Error('Could not fill a private operator authentication field');
  }
}
function code(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  return ((hash.readUInt32BE(hash[19]! & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
function interrupt(phase: 'expire' | 'revoke') {
  const directory = required('E2E_ACCEPTANCE_DIRECTORY'),
    project = required('E2E_ACCEPTANCE_PROJECT');
  if (
    !basename(directory).startsWith('flare-acceptance-') ||
    !/^flare-acceptance-\d+-\d+$/.test(project)
  )
    throw new Error('Operator session interruption requires the disposable Compose project');
  try {
    execFileSync(
      'docker',
      [
        'compose',
        '--project-name',
        project,
        '--project-directory',
        directory,
        '--env-file',
        join(directory, '.env'),
        '-f',
        join(directory, 'docker-compose.yml'),
        '-f',
        join(directory, 'docker-compose.acceptance.yml'),
        'exec',
        '-T',
        'flare-api',
        'node',
        'scripts/acceptance/operator-session.mjs',
        phase,
      ],
      { stdio: 'ignore', timeout: 30000 },
    );
  } catch {
    throw new Error(`Disposable operator session ${phase} failed`);
  }
}
async function login(page: Page, email: string, password: string, recovery = '') {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await privateFill(page.getByLabel('Password', { exact: true }), password);
  await privateFill(page.getByLabel('Authenticator or recovery code'), recovery);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('live operator-only MFA session governs sending policy and loses access on proof expiry or revocation', async ({
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.E2E_ACCEPTANCE,
    'Requires the disposable operator fixture and Compose stack',
  );
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
  let fixture: Fixture;
  try {
    fixture = JSON.parse(readFileSync(required('E2E_OPERATOR_FIXTURE'), 'utf8')) as Fixture;
  } catch {
    throw new Error('Could not read private operator acceptance fixture');
  }
  const operator = await browser.newContext({ baseURL }),
    owner = await browser.newContext({ baseURL });
  try {
    const page = await operator.newPage();
    await login(page, fixture.email, fixture.password, fixture.recoveryCodes[0]!);
    await expect(page).toHaveURL(/\/operator$/);
    await expect(
      page.getByRole('heading', { name: 'Verify operator access', exact: true }),
    ).toBeVisible();
    const session = await page.request.get('/api/operator/session');
    expect(session.status()).toBe(200);
    expect((await session.json()).step_up_required).toBe(true);
    expect((await page.request.get('/api/operator/sending-policies')).status()).toBe(403);
    const cookies = await operator.cookies();
    expect(cookies.some((c) => c.name === 'flare_session' && c.httpOnly)).toBe(true);
    expect(cookies.some((c) => ['flare_org', 'flare_environment'].includes(c.name))).toBe(false);
    // Login consumed a recovery code, so this authenticator counter is fresh.
    await privateFill(
      page.getByLabel('Operator authenticator or recovery code'),
      code(fixture.secret),
    );
    await page.getByRole('button', { name: 'Verify operator access', exact: true }).click();
    await page.getByLabel('Organization sending policy').selectOption(fixture.orgId);
    await page.getByLabel('Sending state').selectOption('approved');
    await page
      .getByLabel('Policy change reason')
      .fill('Reviewed isolated operator acceptance organization.');
    await page.getByRole('button', { name: 'Save sending policy', exact: true }).click();
    await expect(page.getByText('Revision 1', { exact: false })).toBeVisible();
    const policy = await page.request.get(`/api/operator/sending-policies/${fixture.orgId}`);
    expect(policy.status()).toBe(200);
    expect(await policy.json()).toMatchObject({ state: 'approved', revision: 1 });
    const audit = await page.request.get(`/api/operator/sending-policies/${fixture.orgId}/audit`);
    expect(audit.status()).toBe(200);
    expect(
      (await audit.json()).some(
        (entry: { actor_id: string; action: string }) =>
          entry.actor_id === fixture.id && entry.action === 'operator.sending_policy.updated',
      ),
    ).toBe(true);

    interrupt('expire');
    expect((await page.request.get('/api/operator/sending-policies')).status()).toBe(403);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Verify operator access', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Organization sending policy')).toHaveCount(0);
    await privateFill(
      page.getByLabel('Operator authenticator or recovery code'),
      fixture.recoveryCodes[1]!,
    );
    await page.getByRole('button', { name: 'Verify operator access', exact: true }).click();
    await expect(page.getByLabel('Organization sending policy')).toBeVisible();
    const replay = await page.request.post('/api/operator/step-up', {
      headers: { Origin: new URL(page.url()).origin },
      data: { code: fixture.recoveryCodes[1] },
    });
    expect(replay.status(), 'Operator recovery proof is single-use').toBe(403);
    // A rejected proof must not log out the otherwise valid operator session.
    expect((await page.request.get('/api/operator/session')).status()).toBe(200);
    interrupt('revoke');
    expect((await page.request.get('/api/operator/session')).status()).toBe(401);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();

    const tenant = await owner.newPage();
    await login(tenant, required('E2E_EMAIL'), required('E2E_PASSWORD'));
    await expect(tenant.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
    expect(
      (await tenant.request.get('/api/operator/session')).status(),
      'Tenant ownership is not platform authorization',
    ).toBe(403);
    await tenant.goto('/operator');
    await expect(tenant.locator('.error-box[role="alert"]')).toContainText(
      'Platform operator access is required',
    );
    await expect(tenant.getByLabel('Organization sending policy')).toHaveCount(0);
    const created = await tenant.request.post('/api/api-keys', {
      headers: { Origin: new URL(tenant.url()).origin },
      data: { name: 'Operator-denial acceptance', permission: 'full_access' },
    });
    expect(created.status()).toBe(201);
    const key = await created.json();
    try {
      const denied = await tenant.request.get(
        'http://localhost:4000/v1/operator/sending-policies',
        { headers: { Authorization: `Bearer ${key.token}` } },
      );
      expect(denied.status(), 'Full-access API keys cannot perform platform operations').toBe(401);
    } finally {
      await tenant.request.delete(`/api/api-keys/${key.id}`, {
        headers: { Origin: new URL(tenant.url()).origin },
      });
    }
  } finally {
    await Promise.all([operator.close(), owner.close()]);
  }
});
