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

test('coverage filtering exposes unlisted sources after edits and preserves raw exports', async ({ page }) => {
  await page.locator('#source-coverage').selectOption('unlisted');
  await expect(page.locator('#source-results')).toContainText('0 of 2');
  expect(await exported(page, '#export-evidence-csv')).toContain('example-upgrade');
  await page.locator('#edit-details').click();
  await page.locator('[name="thesis"]').fill('Changed research requires a new review.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#source-results')).toContainText('2 of 2');
  await page.locator('#source-search').fill('upgrade');
  await expect(page.locator('#source-results')).toContainText('1 of 2');
});

test('citation copy gives a usable recovery when browser clipboard access fails', async ({ page }) => {
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true }));
  const button = page.getByRole('button', { name: 'Copy citation for example-upgrade', exact: true });
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#app-error')).toContainText('Export complete evidence CSV');
  await expect(button).toBeEnabled();
  expect(await exported(page, '#export-evidence-csv')).toContain('example-upgrade');
});

test('citation copy places full source provenance on the browser clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard read permission is not supported by the Firefox automation API.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy citation for example-upgrade', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('Source citation copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain('RESEARCH ONLY | SYNTHETIC');
  expect(copied).toContain(examplePacket().sources[0].excerpt);
});

test('hypothetical classification has keyboard, empty-input, edit and gate recovery', async ({ page }) => {
  await page.getByText('Explore submitted scenario intervals', { exact: true }).click();
  await page.locator('#classify-price').click();
  await expect(page.locator('#classification-status')).toContainText('Enter a hypothetical price');
  await page.locator('#classification-price').fill('94');
  await page.locator('#classify-price').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#classification-results')).toContainText('12h: Base');
  await page.locator('#classification-price').fill('106');
  await expect(page.locator('#classification-results')).toBeEmpty();
  await page.locator('#classify-price').click();
  await expect(page.locator('#classification-results')).toContainText('12h: Bull');
  await page.locator('#new-packet').click(); await page.locator('#close-editor').click();
  await expect(page.locator('#classification-results')).toBeEmpty();
  await page.locator('#classification-price').fill('100'); await page.locator('#classify-price').click();
  await expect(page.locator('#classification-status')).toContainText('withheld');
});

test('range probability bounds distinguish partial bins and recover from invalid ranges', async ({ page }) => {
  await page.getByText('Explore submitted scenario intervals', { exact: true }).click();
  await page.locator('#probability-lower').fill('0'); await page.locator('#calculate-probability-bounds').click();
  await expect(page.locator('#probability-results')).toContainText('12h: 100% to 100%');
  await page.locator('#probability-lower').fill('100'); await page.locator('#probability-upper').fill('101');
  await page.locator('#calculate-probability-bounds').click();
  await expect(page.locator('#probability-results')).toContainText('12h: 0% to');
  await page.locator('#probability-upper').fill('99'); await page.locator('#calculate-probability-bounds').click();
  await expect(page.locator('#probability-results')).toBeEmpty();
  await expect(page.locator('#probability-status')).toContainText('greater upper price');
});

test('comparison export tracks the displayed baseline and disables stale or invalid input', async ({ page }) => {
  await page.getByText('Open packet comparison', { exact: true }).click();
  const previous = examplePacket(); previous.thesis = 'Previous comparison text';
  await page.locator('#comparison-json').fill(JSON.stringify(previous)); await page.locator('#compare-packets').click();
  const sheet = JSON.parse(await exported(page, '#export-comparison'));
  expect(sheet.previous.thesis).toBe(previous.thesis); expect(sheet.current.thesis).toBe(examplePacket().thesis);
  await page.locator('#comparison-json').fill('malformed');
  await expect(page.locator('#export-comparison')).toBeDisabled();
  await page.locator('#compare-packets').click(); await expect(page.locator('#export-comparison')).toBeDisabled();
  await page.locator('#comparison-json').fill(JSON.stringify(previous)); await page.locator('#compare-packets').click();
  await expect(page.locator('#export-comparison')).toBeEnabled();
});

test('baseline portability survives reload without replacing the open packet and retains prior data on failure', async ({ page }) => {
  await page.getByText('Open packet comparison', { exact: true }).click();
  await page.locator('#pin-baseline').click();
  const baselineText = await exported(page, '#export-baseline');
  await page.reload(); await page.getByText('Open packet comparison', { exact: true }).click();
  await expect(page.locator('#export-baseline')).toBeDisabled();
  const previous = JSON.parse(baselineText); previous.thesis = 'Portable baseline thesis';
  await page.locator('#baseline-file').setInputFiles({ name: 'baseline.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(previous)) });
  await expect(page.locator('#comparison-results')).toContainText('Portable baseline thesis');
  await expect(page.locator('#thesis')).toHaveText(examplePacket().thesis);
  await page.locator('#baseline-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.locator('#app-error')).toContainText('prior baseline and open packet remain unchanged');
  expect(JSON.parse(await exported(page, '#export-baseline')).thesis).toBe('Portable baseline thesis');
  previous.asset.symbol = 'OTHER';
  await page.locator('#baseline-file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(previous)) });
  await expect(page.locator('#app-error')).toContainText('same named asset');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});

test('a delayed baseline import cannot replace a newer explicit pinned baseline', async ({ page }) => {
  await page.getByText('Open packet comparison', { exact: true }).click();
  await page.evaluate(() => {
    const original = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () { await new Promise(resolve => { window.releaseBaselineRead = resolve; }); return original.call(this); };
  });
  const previous = examplePacket(); previous.thesis = 'Stale delayed baseline';
  await page.locator('#baseline-file').setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(previous)) });
  await page.locator('#pin-baseline').click();
  await page.evaluate(() => window.releaseBaselineRead());
  expect(JSON.parse(await exported(page, '#export-baseline')).thesis).toBe(examplePacket().thesis);
});
