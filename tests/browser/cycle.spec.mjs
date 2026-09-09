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
