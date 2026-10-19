import { test, expect } from '@playwright/test';

test('direct dashboard ingress returns private-path404 without a session or redirect', async ({
  request,
}) => {
  for (const path of [
    '/health',
    '/health-check',
    '/ready',
    '/internal/metrics',
    '/v1/internal',
    '/api/internal',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
    expect(response.headers().location).toBeUndefined();
  }
  for (const method of ['POST', 'OPTIONS']) {
    const response = await request.fetch('/api/internal/events', { method, maxRedirects: 0 });
    expect(response.status()).toBe(404);
  }
  const metrics = await request.get('/metrics', { maxRedirects: 0 });
  expect(metrics.status()).toBe(307);
  expect(metrics.headers().location).toBe('/login');
});
