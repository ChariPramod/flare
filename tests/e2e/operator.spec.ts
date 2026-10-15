import { test, expect, type Page } from '@playwright/test';
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});
test('tenant owner cannot open platform policy controls', async ({ page }) => {
  await login(page);
  await page.goto('/operator');
  await expect(page.locator('.error-box[role="alert"]')).toContainText(
    'Platform operator access is required',
  );
  await expect(page.getByLabel('Organization sending policy')).toHaveCount(0);
});
test('operator stepup gates policy edits, rejects stale changes and records restoration', async ({
  page,
  request,
}, testInfo) => {
  const fixture = await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true },
  });
  const { org_id } = await fixture.json();
  await login(page);
  await page.goto('/operator');
  await expect(page.getByRole('heading', { name: 'Verify operator access' })).toBeVisible();
  await expect(page.getByLabel('Organization sending policy')).toHaveCount(0);
  await page.getByLabel('Operator authenticator or recovery code').fill('wrong');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('fresh authenticator');
  await page.getByLabel('Operator authenticator or recovery code').fill('654321');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  await page.getByLabel('Organization sending policy').selectOption(org_id);
  await page.getByLabel('Sending state').selectOption('approved');
  await page
    .getByLabel('Policy change reason')
    .fill('Reviewed domain ownership and pilot recipients.');
  await page.getByRole('button', { name: 'Save sending policy' }).click();
  await expect(page.getByText('Revision 1', { exact: false })).toBeVisible();
  await expect(page.locator('pre').filter({ hasText: 'sending_policy.updated' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('operator-policy.png'), fullPage: true });
  await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true, stale: true },
  });
  await page.getByLabel('Daily recipient limit').fill('200');
  await page
    .getByLabel('Policy change reason')
    .fill('Reviewed proposed increase to pilot capacity.');
  await page.getByRole('button', { name: 'Save sending policy' }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('revision changed');
  await page.reload();
  await page.getByLabel('Organization sending policy').selectOption(org_id);
  await expect(page.getByLabel('Daily recipient limit')).toHaveValue('100');
  await page.getByLabel('Suppressed email').fill('reader@example.test');
  await page
    .getByLabel('Restoration reason')
    .fill('Reviewed corrected mailbox and documented recipient request.');
  await page.getByRole('button', { name: 'Restore suppression' }).click();
  await expect(page.locator('pre').filter({ hasText: 'suppression.restored' })).toBeVisible();
  await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true, expired: true },
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Verify operator access' })).toBeVisible();
  await expect(page.getByLabel('Daily recipient limit')).toHaveCount(0);
});
test('viewer can inspect sending restrictions and held email without operator controls', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:4311/fixtures/sending-policy', {
    data: { viewer: true },
  });
  const { id } = await response.json();
  await login(page);
  await page.goto('/emails');
  await expect(page.getByRole('region', { name: 'Organization sending access' })).toContainText(
    'Recipient feedback requires review',
  );
  await expect(page.getByRole('button', { name: 'Send email', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Authenticated sending feedback')).toContainText(
    '24-hour recipient cohort: 20',
  );
  await expect(page.getByLabel('Authenticated sending feedback')).toContainText('Hard bounces: 1');
  await expect(page.getByLabel('Authenticated sending feedback')).toContainText('Complaints: 1');
  await expect(page.getByLabel('Authenticated sending feedback')).toContainText(
    'Unknown bounces: 2',
  );
  await expect(page.getByLabel('Sending state')).toHaveCount(0);
  await page.getByRole('link', { name: 'Held policy fixture' }).click();
  await expect(page).toHaveURL(new RegExp(`/emails/${id}$`));
  await expect(page.getByRole('region', { name: 'Email on hold' })).toContainText(
    'Next eligibility check',
  );
  await expect(page.getByText('transactional', { exact: true })).toBeVisible();
  await expect(page.getByText(/Revision 2/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel email', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save sending policy', exact: true })).toHaveCount(
    0,
  );
});
test('operator publishes and disables route revisions with explicit evidence', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/operator', { data: { allowed: true } });
  await login(page);
  await page.goto('/operator');
  await page.getByLabel('Operator authenticator or recovery code').fill('654321');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  const registry = page.getByRole('region', { name: 'Provider route registry' });
  await registry.getByText('Create or revise a provider route', { exact: true }).click();
  await page.getByLabel('Provider route name', { exact: true }).fill('Pilot transactional route');
  await page.getByLabel('Named transport instance IDs').fill('fixture-postal');
  await page.getByLabel('Physical sending evidence reviewed').check();
  await page
    .getByLabel('Route change reason')
    .fill('Reviewed isolated provider configuration fixture.');
  await page.getByRole('button', { name: 'Publish route revision' }).click();
  await expect(registry.locator('.error-box')).toContainText('physical IP evidence');
  await page.getByLabel('Physical sending IPs').fill('8.8.8.8');
  await page
    .getByLabel('Route proof reference')
    .fill('Synthetic browser proof, not real provider evidence.');
  await page.getByRole('button', { name: 'Publish route revision' }).click();
  const row = registry.getByRole('row').filter({ hasText: 'Pilot transactional route' });
  await expect(row).toContainText('Revision 1');
  await expect(row.getByText('Verified', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Disable Pilot transactional route revision 1' }).click();
  await page
    .getByLabel('Route disable reason')
    .fill('Pause this route during a provider configuration review.');
  await page.getByRole('button', { name: 'Disable route revision', exact: true }).click();
  await expect(row.getByText('Disabled', { exact: true })).toBeVisible();
  await expect(
    row.getByRole('button', { name: 'Disable Pilot transactional route revision 1' }),
  ).toBeDisabled();
});
test('owner can cancel an unsent held email without changing sending approval', async ({
  page,
  request,
}) => {
  const fixture = await request.post('http://127.0.0.1:4311/fixtures/sending-policy', {
    data: { viewer: false },
  });
  const { id } = await fixture.json();
  await login(page);
  await page.goto(`/emails/${id}`);
  await page.getByRole('button', { name: 'Cancel email', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Cancel held email?');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.page-heading .badge')).toHaveText('canceled');
  await expect(page.getByRole('region', { name: 'Organization sending access' })).toContainText(
    'Sending is paused',
  );
});

test('operator polling removes cached controls after session revocation', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/operator', { data: { allowed: true } });
  await login(page);
  await page.goto('/operator');
  await page.getByLabel('Operator authenticator or recovery code').fill('654321');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  await expect(page.getByLabel('Organization sending policy')).toBeVisible();
  await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true, revoked: true },
  });
  await expect(page).toHaveURL(/\/login$/, { timeout: 25000 });
  await expect(page.getByLabel('Organization sending policy')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Provider route registry' })).toHaveCount(0);
});

test('operator records and revokes domain evidence without bypassing readiness blockers', async ({
  page,
  request,
}) => {
  const fixture = await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true },
  });
  const { org_id, domain_id } = await fixture.json();
  await login(page);
  await page.goto('/operator');
  await page.getByLabel('Operator authenticator or recovery code').fill('654321');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  await page.getByLabel('Organization sending policy').selectOption(org_id);
  const panel = page.getByRole('region', { name: 'Domain transport evidence' });
  await panel.getByLabel('Evidence domain ID').fill(domain_id);
  await panel.getByRole('button', { name: 'Load domain evidence' }).click();
  await expect(panel).toContainText('transport evidence missing');
  await expect(panel).toContainText('operator attestations');
  await panel.getByLabel('Evidence transport instance').selectOption('fixture-postal');
  await panel
    .getByLabel('Received evidence reference')
    .fill('Synthetic contract evidence, not production verification.');
  const observation = new Date(Date.now() - 60000);
  const local = new Date(observation.getTime() - observation.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await panel.getByLabel('Evidence observation time').fill(local);
  await panel.getByLabel('Observed DKIM signing domain').fill('example.test');
  await panel.getByLabel('Observed envelope MAIL FROM domain').fill('psrp.example.test');
  for (const method of ['DKIM', 'SPF', 'DMARC'])
    await panel.getByLabel(`Trusted receiver reports ${method} pass`, { exact: true }).check();
  await panel
    .getByLabel('Evidence review reason')
    .fill('Reviewed synthetic trusted receiver authentication results.');
  await panel.getByRole('button', { name: 'Record domain evidence' }).click();
  await expect(panel).toContainText('dns evidence stale');
  await expect(panel.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Sending state')).toHaveValue('pending_review');
  await panel.getByRole('button', { name: 'Revoke evidence for fixture-postal' }).click();
  await page
    .getByLabel('Evidence revocation reason')
    .fill('Provider configuration changed and requires new verification.');
  await page.getByRole('button', { name: 'Revoke domain evidence', exact: true }).click();
  await expect(panel).toContainText('transport evidence revoked');
  await expect(panel.getByText('Revoked', { exact: true })).toBeVisible();
});

test('viewer distinguishes verified domain ownership from blocked Production readiness', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:4311/fixtures/domain-readiness', {
    data: {},
  });
  const { id } = await response.json();
  await login(page);
  await page.goto(`/domains/${id}`);
  const panel = page.getByRole('region', { name: 'Domain sending readiness' });
  await expect(panel).toContainText('Domain ownership: verified');
  await expect(panel).toContainText('approved route unavailable');
  await expect(panel).toContainText('DNS evidence stale or future dated');
  await expect(panel).toContainText(
    'Production requires DNS and transport evidence less than 24 hours old',
  );
  await expect(page.getByRole('button', { name: 'Verify DNS records' })).toBeDisabled();
  await request.post('http://127.0.0.1:4311/fixtures/domain-readiness', {
    data: { id, route: true },
  });
  await page.reload();
  await expect(panel).toContainText('fixture-postal');
  await expect(panel).toContainText('transport evidence missing');
  await expect(panel).toContainText('Not aligned');
  await expect(panel).toContainText('Unknown');
  await expect(panel.getByText('Readiness passes', { exact: true })).toHaveCount(0);
});

test('operator can suspend an organization while preserving its disabled route binding', async ({
  page,
  request,
}) => {
  const fixture = await request.post('http://127.0.0.1:4311/fixtures/operator', {
    data: { allowed: true, disabled_binding: true },
  });
  const { org_id } = await fixture.json();
  await login(page);
  await page.goto('/operator');
  await page.getByLabel('Operator authenticator or recovery code').fill('654321');
  await page.getByRole('button', { name: 'Verify operator access' }).click();
  await page.getByLabel('Organization sending policy').selectOption(org_id);
  const boundId = await page.getByLabel('transactional route ID', { exact: true }).inputValue();
  await page.getByLabel('Sending state').selectOption('suspended');
  await page
    .getByLabel('Policy change reason')
    .fill('Suspend this organization during provider review.');
  const saved = page.waitForRequest(
    (req) =>
      req.method() === 'PATCH' && req.url().endsWith(`/api/operator/sending-policies/${org_id}`),
  );
  await page.getByRole('button', { name: 'Save sending policy' }).click();
  const savedRequest = await saved;
  const payload = savedRequest.postDataJSON();
  const savedResponse = await savedRequest.response();
  expect(savedResponse?.status(), 'Suspension preserves an unchanged disabled binding').toBe(200);
  expect(await savedResponse!.json()).toMatchObject({
    state: 'suspended',
    revision: 1,
    route_bindings: { transactional: { id: boundId, revision: 1 } },
  });
  await expect(page.getByLabel('Sending state')).toHaveValue('suspended');
  await expect(page.getByLabel('transactional route ID', { exact: true })).toHaveValue(boundId);
  expect(payload).toEqual({
    expected_revision: 0,
    reason: 'Suspend this organization during provider review.',
    state: 'suspended',
  });
  await page.getByLabel('transactional route revision', { exact: true }).fill('2');
  await page
    .getByLabel('Policy change reason')
    .fill('Attempt to bind a revision that has not been reviewed.');
  await page.getByRole('button', { name: 'Save sending policy' }).click();
  await expect(page.locator('.error-box[role="alert"]')).toContainText('active verified revision');
});
