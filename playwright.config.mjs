import { defineConfig, devices } from '@playwright/test';
import { PREVIEW_ORIGIN, PREVIEW_PORT } from './tests/browser/origin.mjs';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 3,
  reporter: 'list',
  use: {
    baseURL: PREVIEW_ORIGIN,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: {
    command: 'node tools/serve.mjs --dist --port ' + PREVIEW_PORT,
    url: PREVIEW_ORIGIN,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
