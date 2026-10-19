import { test, expect } from '@playwright/test';

test('live subscriber Inbox renders native delivery and persists read state', async ({ page }) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires the disposable native Inbox fixture');
  const subscriberId = 'acceptance-inbox-reader';
  const body = 'Acceptance inbox notification delivered by Novu';
  await page.goto('/login');
  await page.getByLabel('Work email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  const initialized = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/novu/v1/inbox/session' &&
      response.request().method() === 'POST',
  );
  await page.goto(`/subscribers/${subscriberId}`);
  const response = await initialized;
  expect(response.status(), 'Authenticated Inbox session').toBe(201);
  const envelope = await response.json();
  const session = envelope.data ?? envelope;
  expect(typeof session.token).toBe('string');
  const origin = new URL(page.url()).origin;
  const headers = { Authorization: `Bearer ${session.token}`, Origin: origin };
  const feed = async () => {
    const result = await page.request.get('/novu/v1/inbox/notifications?limit=100', { headers });
    expect(result.status()).toBe(200);
    const payload = await result.json();
    return (payload.data?.data ?? payload.data) as Array<{
      id: string;
      body: string;
      isRead: boolean;
    }>;
  };
  const notification = (await feed()).find((item) => item.body === body)!;
  expect(notification).toBeDefined();
  expect(notification.isRead).toBe(false);
  await page.locator('.inbox-panel').getByRole('button').click();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  const marked = page.waitForResponse(
    (result) =>
      new URL(result.url()).pathname === `/novu/v1/inbox/notifications/${notification.id}/read` &&
      result.request().method() === 'PATCH',
  );
  await page.getByText(body, { exact: true }).click();
  expect((await marked).status()).toBe(200);
  await expect
    .poll(async () => (await feed()).find((item) => item.id === notification.id)?.isRead)
    .toBe(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'In-app inbox' })).toBeVisible();
  expect((await feed()).find((item) => item.id === notification.id)?.isRead).toBe(true);

  const accessResult = await page.request.get(`/api/subscribers/${subscriberId}/inbox-token`);
  expect(accessResult.status()).toBe(200);
  const access = await accessResult.json();
  const tampered = await page.request.post('/novu/v1/inbox/session', {
    headers: { Origin: origin },
    data: {
      applicationIdentifier: access.applicationIdentifier,
      subscriberHash: '0'.repeat(64),
      subscriber: { subscriberId },
    },
  });
  expect(tampered.status()).toBe(403);
  const wrongOrigin = await page.request.patch(
    `/novu/v1/inbox/notifications/${notification.id}/unread`,
    {
      headers: { ...headers, Origin: 'https://untrusted.invalid' },
    },
  );
  expect(wrongOrigin.status()).toBe(403);
  expect((await feed()).find((item) => item.id === notification.id)?.isRead).toBe(true);
});
