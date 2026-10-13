import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/live',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    channel: process.env.E2E_BROWSER_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
