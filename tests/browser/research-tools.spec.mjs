import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { examplePacket } from '../../web/example.js';
import { navigate } from './navigation.mjs';
const NOW = new Date('2026-08-20T10:00:00Z');
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW });
  await navigate(page);
});
async function downloadText(page, selector) {
  const pending = page.waitForEvent('download'); await page.locator(selector).click();
  const stream = await (await pending).createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}
test('search preserves raw exports and restores every source for print', async ({ page }) => {
  await page.locator('#source-search').fill('UPGRADE');
  await expect(page.locator('#source-results')).toContainText('1 of 2');
  await expect(page.locator('.source-item:visible')).toHaveCount(1);
  const raw = JSON.parse(await downloadText(page, '#export-json'));
  expect(raw.sources).toHaveLength(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.source-item:visible')).toHaveCount(2);
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#source-type').selectOption('secondary');
  await expect(page.locator('#source-results')).toContainText('0 of 2');
});
test('repair navigation and bounded undo preserve inputs and reset review', async ({ page }) => {
  await page.locator('#edit-details').click();
  const thesis = page.locator('[name="thesis"]'); const previous = await thesis.inputValue();
  await thesis.fill('Edited fictional research thesis.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#review-status')).toHaveText('Pending review');
  await page.locator('#undo-edit').click();
  await expect(page.locator('#thesis')).toHaveText(previous);
  await expect(page.locator('#review-status')).toHaveText('Pending review');
  await expect(page.locator('#undo-edit')).toBeDisabled();
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#new-packet').click();
  await page.locator('#close-editor').click();
  await page.locator('.repair-action').filter({ hasText: 'reference.price:' }).click();
  await expect(page.locator('#packet-editor')).toBeVisible();
  await expect(page.locator('[name="price"]')).toBeFocused();
});
test('comparison rejects hostile JSON and displays literal research changes', async ({ page }) => {
  await page.getByText('Open packet comparison', { exact: true }).click();
  const previous = examplePacket(); previous.thesis = '<img src=x onerror=alert(1)>';
  await page.locator('#comparison-json').fill(JSON.stringify(previous));
  await page.locator('#compare-packets').click();
  await expect(page.locator('#comparison-status')).toContainText('1 changed fields');
  await expect(page.locator('#comparison-results')).toContainText('<img src=x');
  await expect(page.locator('#comparison-results img')).toHaveCount(0);
  await page.locator('#comparison-json').fill('{"__proto__":{}}');
  await page.locator('#compare-packets').click();
  await expect(page.locator('#comparison-results li')).toHaveCount(0);
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  await page.locator('#clear-comparison').click();
  await expect(page.locator('#comparison-json')).toHaveValue('');
});
test('sensitivity remains hypothetical and exports bind the unchanged packet', async ({ page }) => {
  await page.getByText('Explore reference-price sensitivity', { exact: true }).click();
  await page.locator('#sensitivity-price').fill('200');
  await page.locator('#calculate-sensitivity').click();
  await expect(page.locator('#sensitivity-results')).toContainText('-53.000%');
  const raw = JSON.parse(await downloadText(page, '#export-json'));
  expect(raw.reference.price).toBe(100);
  const receipt = JSON.parse(await downloadText(page, '#export-receipt'));
  const { createHash } = await import('node:crypto');
  expect(receipt.packetSha256).toBe(createHash('sha256').update(JSON.stringify(raw)).digest('hex'));
  const handoff = JSON.parse(await downloadText(page, '#export-risk-handoff'));
  expect(handoff.status).toBe('INCOMPLETE_HANDOFF'); expect(handoff.thesis).toBeUndefined();
  expect(handoff.sources).toEqual(raw.sources);
  const csv = await downloadText(page, '#export-csv'); expect(csv).toContain('SUBMITTED_UNAUTHENTICATED');
  await page.locator('#sensitivity-price').fill('0'); await page.locator('#calculate-sensitivity').click();
  await expect(page.locator('#sensitivity-results li')).toHaveCount(0);
  await expect(page.locator('#sensitivity-status')).toContainText('finite positive');
});
test('new tools remain accessible and usable on narrow screens', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText('Compare all four horizon boundaries', { exact: true }).click();
  await expect(page.locator('#horizon-overview tbody tr')).toHaveCount(4);
  const violations = (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations;
  expect(violations.map(item => item.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name === 'chromium') await page.screenshot({ path: '../evidence/crypto-workbench-mobile.png', fullPage: true });
});

test('overview clock advances and expired research clears hypothetical results', async ({ page }) => {
  const packet = examplePacket(); packet.kind = 'research';
  packet.sources[0].url = 'https://www.iana.org/domains/reserved';
  packet.sources[1].url = 'https://www.rfc-editor.org/rfc/rfc2606';
  await page.locator('#packet-file').setInputFiles({ name: 'research.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await page.getByText('Compare all four horizon boundaries', { exact: true }).click();
  await expect(page.locator('#horizon-overview')).toContainText('11.0 hours remaining');
  await page.clock.fastForward(3600000);
  await expect(page.locator('#horizon-overview')).toContainText('10.0 hours remaining');
  await page.getByText('Explore reference-price sensitivity', { exact: true }).click();
  await page.locator('#sensitivity-price').fill('200'); await page.locator('#calculate-sensitivity').click();
  await expect(page.locator('#sensitivity-results li')).toHaveCount(4);
  await page.clock.fastForward(10 * 3600000);
  await expect(page.locator('#horizon-overview')).toContainText('Elapsed');
  await expect(page.locator('#sensitivity-results li')).toHaveCount(0);
  expect(await downloadText(page, '#export-csv')).toContain('WITHHELD');
});

test('independent handoff downloads cannot reveal a prior review through readiness gaps', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  let expected;
  for (const status of ['pending', 'deliver', 'deliver_with_warning', 'repair', 'withhold']) {
    const packet = examplePacket(); packet.liquidity = ''; packet.sources[0].excerpt = '';
    packet.riskReview.status = status; packet.riskReview.notes = 'PRIOR REVIEW ' + status;
    packet.riskReview.sourceIds = [];
    packet.riskReview.assertions.forEach(assertion => { assertion.result = 'PASS'; });
    await page.locator('#packet-file').setInputFiles({ name: 'review.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
    const handoff = JSON.parse(await downloadText(page, '#export-risk-handoff'));
    expect(handoff.localGaps.map(gap => gap.path)).toContain('liquidity');
    expect(handoff.localGaps.map(gap => gap.path)).toContain('sources[0].excerpt');
    expect(handoff.localGaps.every(gap => !gap.path.startsWith('riskReview'))).toBe(true);
    expect(JSON.stringify(handoff)).not.toContain('PRIOR REVIEW');
    const comparable = { ...handoff, generatedAt: null };
    if (expected) expect(comparable).toEqual(expected);
    expected = comparable;
    expect(JSON.parse(await downloadText(page, '#export-json'))).toEqual(packet);
  }
});

test('internationalized source imports remain valid while encoded controls fail closed', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  const packet = examplePacket(); packet.sources[0].url = 'https://例え.みんな/証拠';
  await page.locator('#packet-file').setInputFiles({ name: 'source.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)) });
  await expect(page.locator('#source-list a').first()).toHaveAttribute('href', 'https://xn--r8jz45g.xn--q9jyb4c/%E8%A8%BC%E6%8B%A0');
  for (const url of ['https://source.xn--a', 'https://xn--a.example.com']) {
    const invalid = structuredClone(packet); invalid.sources[0].url = url;
    await page.locator('#packet-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) });
    await expect(page.locator('#app-error')).toContainText('HTTPS');
    expect(JSON.parse(await downloadText(page, '#export-json'))).toEqual(packet);
  }
});
