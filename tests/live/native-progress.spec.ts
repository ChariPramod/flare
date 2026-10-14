import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('live native progress exposes delayed work and confirms cancellation', async ({ page }) => {
  test.skip(!process.env.E2E_ACCEPTANCE, 'Requires the disposable native engine');
  const id = randomUUID();
  const transactionId = randomUUID();
  let triggered = false;
  await page.goto('/login');
  await page.getByLabel('Work email').fill(process.env.E2E_EMAIL!);
  try {
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  } catch {
    throw new Error('Could not fill the acceptance password');
  }
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workflows', exact: true })).toBeVisible();
  await page.getByLabel('Environment', { exact: true }).selectOption({ label: 'Development' });
  const headers = { Origin: new URL(page.url()).origin };
  try {
    const subscriber = `native-browser-${id}`;
    const saved = await page.request.post('/api/subscribers', {
      headers,
      data: { subscriberId: subscriber },
    });
    expect(saved.status(), 'Native progress subscriber creation').toBe(201);
    const workflow = await page.request.post('/api/workflows', {
      headers,
      data: {
        workflowId: `native-browser-${id}`,
        name: 'Browser pending-work cancellation',
        steps: [
          {
            stepId: 'wait',
            name: 'Wait',
            type: 'delay',
            controlValues: { type: 'regular', amount: 180, unit: 'seconds' },
          },
          {
            stepId: 'receipt',
            name: 'Receipt',
            type: 'in_app',
            controlValues: { body: `Canceled browser receipt ${id}` },
          },
        ],
      },
    });
    expect(workflow.status(), 'Native progress workflow creation').toBe(201);
    const trigger = await page.request.post('/api/events/trigger', {
      headers,
      data: { name: `native-browser-${id}`, to: subscriber, transactionId },
    });
    expect(trigger.status(), 'Native progress trigger acceptance').toBe(201);
    triggered = true;
    const run = (await trigger.json()).ids[0] as string;
    await page.goto(`/activity/${run}`);
    await expect(page.getByRole('heading', { name: 'Native job progress' })).toBeVisible();
    await expect(page.getByText('delay: delayed', { exact: true })).toBeVisible();
    await expect(page.getByText('in_app: pending', { exact: true })).toBeVisible();
    await expect(page.getByText(/Last checked:/)).toBeVisible();
    await expect(page.getByText(/messages already sent cannot be recalled/)).toBeVisible();
    const cancelResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `/api/events/trigger/${transactionId}` &&
        response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Request cancellation', exact: true }).click();
    expect((await cancelResponse).status(), 'Parent trigger cancellation').toBe(200);
    await expect(page.getByText('Engine cancellation: confirmed', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Request cancellation', exact: true }),
    ).toBeHidden();
    const state = await page.request.get(`/api/activity/${run}`);
    const details = await state.json();
    expect(details.status).toBe('canceled');
    expect(details.attempts).toBe(1);
    expect(details.cancellation.eligible).toBe(false);
  } finally {
    if (triggered)
      await page.request
        .delete(`/api/events/trigger/${transactionId}`, { headers })
        .catch(() => undefined);
  }
});
