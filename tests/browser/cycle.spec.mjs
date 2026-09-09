import { test, expect } from '@playwright/test';
import { examplePacket } from '../../web/example.js';
import AxeBuilder from '@axe-core/playwright';
import { navigate } from './navigation.mjs';
const NOW = new Date('2026-08-20T10:00:00Z');
const runtimeErrors = new WeakMap(), externalRequests = new WeakMap();
test.beforeEach(async ({ page }) => {
  runtimeErrors.set(page, []); externalRequests.set(page, []);
  page.on('pageerror', error => runtimeErrors.get(page).push(error.message));
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('blob:')) externalRequests.get(page).push(request.url()); });
  await page.clock.install({ time: NOW }); await navigate(page);
});
test.afterEach(async ({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); expect(externalRequests.get(page)).toEqual([]); });
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
  if (!(await page.locator('#review-source-picker').evaluate(node => node.open))) await page.getByText('Select sources actually reviewed', { exact: true }).click();
  await source.check();
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  expect(JSON.parse(await exported(page, '#export-json')).riskReview.sourceIds).toEqual(['example-upgrade', 'example-activity']);
});

test('bundles import through the normal picker and reject tampering without replacement', async ({ page }) => {
  const text = await exported(page, '#export-bundle');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#new-packet').click(); await page.locator('#close-editor').click();
  await page.locator('#packet-file').setInputFiles({ name: 'bundle.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  expect(JSON.parse(await exported(page, '#export-json'))).toEqual(JSON.parse(text).packet);
  const forged = JSON.parse(text); forged.packet.thesis = 'Unbound change';
  await page.locator('#packet-file').setInputFiles({ name: 'forged.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) });
  await expect(page.locator('#app-error')).toContainText('do not match');
  expect(JSON.parse(await exported(page, '#export-json'))).toEqual(JSON.parse(text).packet);
});

test('renewal starts an incomplete draft and undo restores research without restoring clearance', async ({ page }) => {
  await page.locator('#renew-packet').click();
  await expect(page.locator('[name="price"]')).toBeFocused();
  await expect(page.locator('#editor-help')).toContainText('unverified starting material');
  await page.locator('#close-editor').click();
  const draft = JSON.parse(await exported(page, '#export-json'));
  expect(draft.reference.price).toBeNull(); expect(draft.horizons.every(row => row.scenarios.length === 0)).toBe(true);
  await page.locator('#undo-edit').click();
  expect(JSON.parse(await exported(page, '#export-json')).reference.price).toBe(100);
  await expect(page.locator('#review-status')).toHaveText('Pending review');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
});

test('receipt checks distinguish tampered claims and clear results when research changes', async ({ page }) => {
  const receipt = JSON.parse(await exported(page, '#export-receipt'));
  await page.getByText('Check a saved receipt', { exact: true }).click();
  await page.locator('#receipt-json').fill(JSON.stringify(receipt)); await page.locator('#verify-receipt').click();
  await expect(page.locator('#receipt-result')).toContainText('Recorded local checks: MATCH');
  receipt.chartEligible = false;
  await page.locator('#receipt-json').fill(JSON.stringify(receipt)); await page.locator('#verify-receipt').click();
  await expect(page.locator('#receipt-result')).toContainText('Packet digest: MATCH. Recorded local checks: MISMATCH');
  await page.locator('#renew-packet').click(); await page.locator('#close-editor').click();
  await expect(page.locator('#receipt-result')).toHaveText('');
});
test('late receipt checks cannot report success over a replacement packet', async ({ page }) => {
  const receipt = await exported(page, '#export-receipt');
  await page.getByText('Check a saved receipt', { exact: true }).click();
  await page.locator('#receipt-json').fill(receipt);
  await page.evaluate(() => {
    const digest = crypto.subtle.digest.bind(crypto.subtle); let first = true; window.completedDigests = 0;
    crypto.subtle.digest = async (...args) => {
      if (first) { first = false; await new Promise(resolve => { window.releaseReceiptDigest = resolve; }); }
      const result = await digest(...args); window.completedDigests++; return result;
    };
  });
  await page.locator('#verify-receipt').click();
  await page.locator('#new-packet').click(); await page.locator('#close-editor').click();
  await page.evaluate(() => window.releaseReceiptDigest());
  await expect.poll(() => page.evaluate(() => window.completedDigests)).toBe(2);
  await expect(page.locator('#receipt-result')).toHaveText('');
  await expect(page.locator('#asset-symbol')).toHaveText('NEW');
});
test('source audit and full CSV remain complete under screen filtering', async ({ page }) => {
  await page.getByText('Inspect source-origin concentration', { exact: true }).click();
  await expect(page.locator('#source-origin-audit')).toContainText('example.com: 1 of 2');
  await page.locator('#source-search').fill('upgrade');
  const csv = await exported(page, '#export-evidence-csv');
  expect(csv).toContain('example-activity'); expect(csv).toContain('example-upgrade');
});
test('manual monitoring retains contexts and clears after research renewal', async ({ page }) => {
  await page.getByText('Plan manual research monitoring', { exact: true }).click();
  await expect(page.locator('#monitoring-checklist')).toContainText('12h Bear');
  await expect(page.locator('#monitoring-checklist')).toContainText('7d Bear');
  expect(await exported(page, '#export-monitoring')).toContain('A cancellation is reported.');
  await page.locator('#renew-packet').click(); await page.locator('#close-editor').click();
  await expect(page.locator('#monitoring-checklist')).toContainText('WITHHELD');
  const withheld = await exported(page, '#export-monitoring'); expect(withheld).toContain('WITHHELD'); expect(withheld).not.toContain('cancellation');
});
test('second-cycle controls remain accessible across wide and narrow layouts', async ({ page }, testInfo) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(item => item.id)).toEqual([]);
    if (testInfo.project.name === 'chromium' && [1440, 390].includes(width)) await page.screenshot({ path: '../evidence/crypto-research-desk-' + width + '.png', fullPage: true });
  }
});
