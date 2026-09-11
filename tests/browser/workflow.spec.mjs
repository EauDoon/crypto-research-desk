import { test, expect } from '@playwright/test';
import { examplePacket } from '../../web/example.js';
import { navigate } from './navigation.mjs';
import AxeBuilder from '@axe-core/playwright';
const NOW = new Date('2026-08-20T10:00:00Z');
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW }); await navigate(page);
});
async function exported(page, selector) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const stream = await (await pending).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
test('repair worksheet exports a new incomplete draft', async ({ page }) => {
  await page.locator('#new-packet').click(); await page.locator('#close-editor').click();
  const sheet = JSON.parse(await exported(page, '#export-repairs'));
  expect(sheet.items.some(item => item.path === 'reference.price')).toBe(true);
  expect(sheet.chartEligible).toBe(false);
});

test('evidence chronology remains complete when source cards are filtered', async ({ page }) => {
  await page.getByText('Inspect evidence chronology', { exact: true }).click();
  await page.locator('#source-search').fill('upgrade');
  await expect(page.locator('#evidence-chronology li')).toHaveCount(4);
  await expect(page.locator('#evidence-chronology')).toContainText('example-activity captured');
});

test('evidence-age policy errors recover and do not modify the packet gate', async ({ page }) => {
  await page.getByText('Source recency and review coverage', { exact: true }).click();
  await page.locator('#evidence-age-limit').fill('0.1');
  await expect(page.locator('#evidence-age-results')).toContainText('EXCEEDS_LIMIT');
  await page.locator('#evidence-age-limit').fill('');
  await expect(page.locator('#evidence-age-results')).toContainText('Use a capture-age limit');
  await page.locator('#evidence-age-limit').fill('24');
  await expect(page.locator('#evidence-age-results')).toContainText('WITHIN_LIMIT');
  await expect(page.locator('#structure-status')).toHaveText('Structure complete');
});
