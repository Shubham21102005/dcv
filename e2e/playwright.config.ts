import { defineConfig } from '@playwright/test';

// Runs against the live stack. `webServer` boots `pnpm dev` if :5174 is not
// already answering (reuseExistingServer), so `pnpm pw` works either way.
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: '..',
  },
});
