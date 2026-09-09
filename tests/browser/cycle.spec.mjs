import { test, expect } from '@playwright/test';
import { examplePacket } from '../../web/example.js';
import { navigate } from './navigation.mjs';
const NOW = new Date('2026-08-20T10:00:00Z');
test.beforeEach(async ({ page }) => { await page.clock.install({ time: NOW }); await navigate(page); });
async function exported(page, selector) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const stream = await (await pending).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
test('pinned comparison survives edits and is forgotten on reload', async ({ page }) => {
  await page.getByText('Open packet comparison', { exact: true }).click();
  await page.locator('#pin-baseline').click();
  await page.locator('#edit-details').click();
  await page.locator('[name="thesis"]').fill('A changed synthetic thesis.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#comparison-results')).toContainText('A changed synthetic thesis.');
  await expect(page.locator('#baseline-status')).toContainText('Pinned DEMO');
  page.on('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.locator('#baseline-status')).toContainText('No baseline pinned');
});

test('evidence row editing focuses the selected claim and returns to its rebuilt action', async ({ page }) => {
  await page.locator('#source-search').fill('activity');
  const action = page.getByRole('button', { name: 'Edit source example-activity', exact: true });
  await action.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('[name="source-1-claim"]')).toBeFocused();
  await page.locator('[name="source-1-claim"]').fill('Updated fictional activity observation.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(action).toBeFocused();
  await expect(page.locator('#source-search')).toHaveValue('activity');
  expect(JSON.parse(await exported(page, '#export-json')).sources[1].claim).toBe('Updated fictional activity observation.');
  await expect(page.locator('#review-status')).toHaveText('Pending review');
});

test('guided review coverage updates source IDs without authenticating a reviewer', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.getByText('Select sources actually reviewed', { exact: true }).click();
  const source = page.locator('.review-source-checkbox[value="example-activity"]');
  await expect(source).toBeChecked(); await source.uncheck();
  await expect(page.locator('[name="sourceIds"]')).toHaveValue('example-upgrade');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('.repair-action').filter({ hasText: 'account for every recorded source' })).toHaveCount(1);
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await page.locator('#edit-details').click();
  if (!(await page.locator('#review-source-picker').getAttribute('open'))) await page.getByText('Select sources actually reviewed', { exact: true }).click();
  await source.check();
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  expect(JSON.parse(await exported(page, '#export-json')).riskReview.sourceIds).toEqual(['example-upgrade', 'example-activity']);
});
