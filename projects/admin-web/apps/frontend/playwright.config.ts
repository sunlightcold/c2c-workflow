import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  expect: { timeout: 8000 },
  outputDir: 'node_modules/.e2e/test-results',
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: { height: 812, width: 375 },
      },
    },
  ],
  reporter: 'list',
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:15666',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --force',
    env: { VITE_E2E_DISABLE_SOCKET: 'true' },
    port: 15_666,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  workers: 1,
});
