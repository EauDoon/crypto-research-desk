import { defineConfig, devices } from '@playwright/test';

let production;
try { production = new URL(process.env.PRODUCTION_URL); }
catch { throw new Error('Set PRODUCTION_URL to the deployed HTTPS origin.'); }
if (production.protocol !== 'https:' || production.username || production.password
  || production.pathname !== '/' || production.search || production.hash) {
  throw new Error('PRODUCTION_URL must be an HTTPS origin without credentials, a path, query, or fragment.');
}
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: './tests/production',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: production.origin,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: protectionBypass ? {
      'x-vercel-protection-bypass': protectionBypass,
      'x-vercel-set-bypass-cookie': 'true',
    } : undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
});
