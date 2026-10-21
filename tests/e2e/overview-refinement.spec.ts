import { expect, test, type Page } from '@playwright/test';

const approvedPolicy = {
  state: 'approved',
  daily_limit: 100,
  per_minute_limit: 10,
  usage: { reserved: 0, sent_24h: 0 },
  feedback: { recipients_24h: 0, hard_bounces: 0, complaints: 0, unknown: 0 },
};
const readyDomain = {
  id: '0a42381e-60e6-4a08-b425-2a6d80042caa',
  name: 'ready.example.test',
  status: 'verified',
  sending: true,
  checked_at: new Date().toISOString(),
  readiness: { blockers: [], transports: [{ ready: true, blockers: [] }] },
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill('tester@example.test');
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
}

function email(index: number, status: string) {
  return {
    id: `c9724c82-164a-4552-a28a-${String(index).padStart(12, '0')}`,
    subject: `Message ${index}`,
    status,
    created_at: new Date(Date.UTC(2026, 9, 1, 10, index)).toISOString(),
    hold_reason: status === 'held' ? 'quota_exhausted' : null,
    next_attempt_at: null,
  };
}

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4311/reset');
});

test('overview separates recent outcomes, filters attention and keeps the fetched-list scope visible', async ({
  page,
}) => {
  const messages = [
    ...Array.from({ length: 6 }, (_, index) => email(index + 1, 'held')),
    email(7, 'failed'),
    email(8, 'failed'),
    email(9, 'queued'),
    email(10, 'sent'),
    email(11, 'delivered'),
  ];
  await page.route('**/api/emails', (route) => route.fulfill({ json: messages }));
  await page.route('**/api/sending-policy', (route) => route.fulfill({ json: approvedPolicy }));
  await page.route('**/api/domains', (route) => route.fulfill({ json: [readyDomain] }));
  await login(page);

  const recent = page.getByRole('region', { name: 'Recent emails', exact: true });
  await expect(recent.getByRole('listitem')).toHaveCount(5);
  await expect(recent.getByRole('listitem').first()).toContainText('Message 11');
  await expect(recent.getByRole('listitem').nth(1)).toContainText('Provider accepted');
  await expect(recent.getByRole('listitem').nth(2)).toContainText('Accepted');
  await expect(recent).toContainText('Delivered requires a recipient delivery event.');
  const attention = page.getByRole('region', { name: 'Needs attention', exact: true });
  await expect(attention).toContainText('Latest 100 emails · selected environment');
  await expect(attention).toContainText('Showing 5 of 8 in this list');
  await attention.getByRole('button', { name: 'On hold 6', exact: true }).click();
  await expect(attention).toContainText('Showing 5 of 6 in this list');
  await expect(attention.getByRole('link', { name: /Message 8/ })).toHaveCount(0);
  await expect(attention.getByRole('button', { name: 'On hold 6', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await attention.getByRole('button', { name: 'Failed 2', exact: true }).click();
  await expect(attention.getByRole('listitem')).toHaveCount(2);
  await expect(attention).toContainText('provider acceptance may be uncertain');
  await expect(
    attention.getByRole('link', { name: 'View all emails', exact: true }),
  ).toHaveAttribute('href', '/emails');
  await recent.getByRole('link', { name: /Message 10 / }).click();
  await expect(page).toHaveURL(new RegExp(`/emails/${messages[9]!.id}$`));
});

test('refresh disables repeated requests and removes stale success after a failed refresh', async ({
  page,
}) => {
  let fail = false;
  let release: (() => void) | undefined;
  let requests = 0;
  await page.route('**/api/sending-policy', async (route) => {
    requests++;
    if (!fail) return route.fulfill({ json: approvedPolicy });
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return route.fulfill({ status: 503, json: { message: 'Policy check unavailable' } });
  });
  await login(page);
  const access = page.getByRole('region', { name: 'Sending access', exact: true });
  const freshness = page.getByRole('status', { name: 'Overview refresh status' });
  await expect(access).toContainText('Approved');
  await expect(freshness).toContainText('Updated');
  fail = true;
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(page.getByRole('button', { name: 'Refresh overview' })).toBeDisabled();
  await expect(freshness).toContainText('Updating overview');
  await expect.poll(() => Boolean(release)).toBe(true);
  release!();
  await expect(access).toContainText('Sending policy unavailable');
  await expect(access).not.toContainText('Approved');
  await expect(freshness).toContainText('Some data is unavailable');
  await expect(freshness).not.toContainText('Updated');
  await expect(
    page.getByRole('heading', { name: 'Let’s get a current view of your workspace.', exact: true }),
  ).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: 'Refresh overview' }).click();
  await expect(access).toContainText('Approved');
  await expect(freshness).toContainText('Updated');
  expect(requests).toBe(3);
});

test('empty workspace gives an honest next step and viewer language stays read-only', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/sending-policy', {
    data: { viewer: true, state: 'approved' },
  });
  await page.route('**/api/emails', (route) => route.fulfill({ json: [] }));
  await login(page);
  await expect(
    page.getByRole('heading', { name: 'Give your notifications a sending domain.', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Ask a workspace administrator to add a sending domain.', { exact: false }),
  ).toBeVisible();
  const recent = page.getByRole('region', { name: 'Recent emails', exact: true });
  await expect(recent).toContainText('No email submissions yet');
  await expect(recent).toContainText('Submitted emails will appear here with their latest status.');
  await expect(page.getByRole('link', { name: 'Set up a domain', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Build a workflow', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Needs attention', exact: true })).toContainText(
    'Your first message starts here',
  );
});

test('Production offers workflow inspection and does not claim that ready domains prove delivery', async ({
  page,
}) => {
  await page.route('**/api/sending-policy', (route) => route.fulfill({ json: approvedPolicy }));
  await page.route('**/api/domains', (route) => route.fulfill({ json: [readyDomain] }));
  await login(page);
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Production' });
  await expect(page.getByRole('link', { name: 'Explore workflows', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Build a workflow', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Sender readiness', exact: true })).toContainText(
    '1 of 1 sending domains ready',
  );
  await expect(
    page.getByText('Email provider acceptance is separate from recipient delivery.', {
      exact: false,
    }),
  ).toBeVisible();
});

test('policy suspension takes priority over ready domains and zero usage', async ({
  page,
  request,
}) => {
  await request.post('http://127.0.0.1:4311/fixtures/sending-policy');
  await page.route('**/api/domains', (route) => route.fulfill({ json: [readyDomain] }));
  await login(page);
  await expect(
    page.getByRole('heading', {
      name: 'Sending is paused. Review what needs attention.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review held emails', exact: true })).toHaveAttribute(
    'href',
    '/emails',
  );
  await expect(page.getByRole('link', { name: 'Build a workflow', exact: true })).toHaveCount(0);
});
