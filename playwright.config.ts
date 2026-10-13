import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4310',
    channel: process.env.E2E_BROWSER_CHANNEL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 960 },
  },
  webServer: [
    {
      command: 'pnpm exec tsx tests/e2e/fixture-server.ts',
      url: 'http://127.0.0.1:4311/health',
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @flare/web dev --port 4310',
      url: 'http://localhost:4310/login',
      env: { FLARE_API_URL: 'http://127.0.0.1:4311', WEB_ORIGIN: 'http://localhost:4310' },
      timeout: 120000,
      reuseExistingServer: false,
    },
  ],
});
