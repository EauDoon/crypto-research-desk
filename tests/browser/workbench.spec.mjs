import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { examplePacket } from '../../web/example.js';
import { navigate } from './navigation.mjs';

const NOW = new Date('2026-08-20T10:00:00Z');
const STORAGE_KEY = 'crypto-research-desk.packet.v1';
const errors = new WeakMap();
const requests = new WeakMap();
function research() {
  const packet = examplePacket();
  packet.kind = 'research';
  packet.sources[0].url = 'https://www.iana.org/domains/reserved';
  packet.sources[1].url = 'https://www.rfc-editor.org/rfc/rfc2606';
  return packet;
}
async function importText(page, text) {
  await page.locator('#packet-file').setInputFiles({ name: 'packet.json', mimeType: 'application/json', buffer: Buffer.from(text) });
}
async function importPacket(page, packet) {
  await importText(page, JSON.stringify(packet));
  await expect(page.locator('#notice')).toContainText('Packet imported locally');
}
async function fullEditor(page) {
  await page.locator('#edit-json').click();
  await expect(page.locator('#packet-editor')).toBeVisible();
  return JSON.parse(await page.locator('#packet-json').inputValue());
}
async function exported(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}
async function a11y(page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
}
test.beforeEach(async ({ page }) => {
  errors.set(page, []); requests.set(page, []);
  page.on('pageerror', error => errors.get(page).push(error.message));
  page.on('request', request => {
    if (!request.url().startsWith('http://127.0.0.1:4173/') && !request.url().startsWith('blob:')) requests.get(page).push(request.url());
  });
  await page.clock.install({ time: NOW });
  await navigate(page);
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page), 'browser runtime errors').toEqual([]);
  expect(requests.get(page), 'unexpected external network requests').toEqual([]);
});

test('the default view is explicitly synthetic, local, and accessible', async ({ page }) => {
  await expect(page.locator('#provenance-tag')).toHaveText('SYNTHETIC EXAMPLE');
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#chart-badge')).toHaveText('SAMPLE THRESHOLDS');
  await expect(page.locator('#remember-packet')).not.toBeChecked();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  await expect(page.locator('#assertion-record .assertion-summary')).toHaveCount(5);
  await a11y(page);
});

test('horizon tabs support arrows, Home, End, and correct tab panels', async ({ page }) => {
  await page.locator('#tab-12h').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-24h')).toBeFocused();
  await expect(page.locator('#tab-24h')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#horizon-24h')).toBeVisible();
  await expect(page.locator('#horizon-12h')).toBeHidden();
  await page.keyboard.press('End');
  await expect(page.locator('#tab-7d')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.locator('#tab-12h')).toBeFocused();
});

test('new packets show unknown values, withhold the chart, and keep the form accessible', async ({ page }) => {
  await page.locator('#new-packet').click();
  await expect(page.locator('#packet-editor')).toBeVisible();
  await expect(page.locator('input[name="symbol"]')).toBeFocused();
  await a11y(page);
  await page.locator('#close-editor').click();
  await expect(page.locator('#new-packet')).toBeFocused();
  await expect(page.locator('#reference-price')).toContainText('UNKNOWN');
  await expect(page.locator('#structure-status')).toHaveText('INCOMPLETE');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await a11y(page);
});

test('invalid imports preserve the open packet and report exact validation failures', async ({ page }) => {
  for (const [text, message] of [
    ['{"schemaVersion":1,"schemaVersion":2}', 'Duplicate'],
    ['{"__proto__":{"polluted":true}}', 'Reserved'],
    ['{"x":9007199254740993}', 'precision'],
    [JSON.stringify({ ...examplePacket(), extra: true }), 'Unexpected fields'],
  ]) {
    await importText(page, text);
    await expect(page.locator('#app-error')).toContainText(message);
    await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
    await expect(page.locator('#chart-area svg')).toBeVisible();
  }
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
});

test('unsafe links and incorrect probabilities are rejected without a network request', async ({ page }) => {
  const unsafe = research(); unsafe.sources[0].url = 'javascript:alert(1)';
  await importText(page, JSON.stringify(unsafe));
  await expect(page.locator('#app-error')).toContainText('HTTPS');
  unsafe.sources[0].url = research().sources[0].url;
  unsafe.horizons[0].scenarios[0].probability = 25.000000005;
  await importText(page, JSON.stringify(unsafe));
  await expect(page.locator('#app-error')).toContainText('decimal places');
  await expect(page.locator('#provenance-tag')).toHaveText('SYNTHETIC EXAMPLE');
});

test('imported prose stays inert and submitted reviews remain explicitly unverified', async ({ page }) => {
  const packet = research();
  packet.thesis = '<img src="https://invalid.example/x" onerror="window.pwned=true"> Untrusted prose';
  await importPacket(page, packet);
  await expect(page.locator('#thesis')).toHaveText(packet.thesis);
  await expect(page.locator('#thesis img')).toHaveCount(0);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('#provenance-tag')).toHaveText('UNVERIFIED RESEARCH');
  await expect(page.locator('#provenance-text')).toContainText('have not been authenticated');
  await expect(page.locator('#chart-badge')).toHaveText('SUBMITTED THRESHOLDS');
  await expect(page.locator('#source-list a').first()).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(page.locator('#source-list a').first()).toHaveAccessibleName(/opens in a new tab/);
  await a11y(page);
});

test('JSON and Markdown downloads preserve packet content and evidence', async ({ page }) => {
  const json = await exported(page, '#export-json');
  expect(JSON.parse(json.text)).toEqual(examplePacket());
  expect(json.name).toMatch(/Research Packet\.json$/);
  const markdown = await exported(page, '#export-brief');
  expect(markdown.name).toMatch(/Research Brief\.md$/);
  for (const text of ['SYNTHETIC EXAMPLE', '## 12 hours', '## 24 hours', '## 3 days', '## 7 days', 'authority', 'Print / PDF']) {
    expect(markdown.text).toContain(text);
  }
});

test('editing research inputs clears the old review and withholds the chart', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="thesis"]').fill('A changed fictional thesis.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#edit-details')).toBeFocused();
  await expect(page.locator('#review-status')).toHaveText('Pending review');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await expect(page.locator('#notice')).toContainText('previous review was reset');
});

test('changing input and review records together preserves the editor and rejects the update', async ({ page }) => {
  const packet = await fullEditor(page);
  packet.thesis = 'Changed thesis';
  packet.riskReview.unknownField = true;
  await page.locator('#packet-json').fill(JSON.stringify(packet));
  await page.locator('#apply-json').click();
  await expect(page.locator('#editor-error')).toContainText('separately from a new review');
  expect(JSON.parse(await page.locator('#packet-json').inputValue()).riskReview.unknownField).toBe(true);
  await expect(page.locator('#thesis')).toHaveText(examplePacket().thesis);
  await expect(page.locator('#packet-editor')).toBeVisible();
});

test('reordering JSON keys does not invalidate an unchanged review', async ({ page }) => {
  const packet = await fullEditor(page);
  await page.locator('#packet-json').fill(JSON.stringify(Object.fromEntries(Object.entries(packet).reverse())));
  await page.locator('#apply-json').click();
  await expect(page.locator('#packet-editor')).toBeHidden();
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#review-status')).toContainText('Deliver with warning');
});

test('a no-op details save preserves multiline lists and the original review', async ({ page }) => {
  const packet = research(); packet.risks = ['First line\nSecond line']; packet.unknowns = ['Unknown A\nUnknown B'];
  await importPacket(page, packet);
  await page.locator('#edit-details').click();
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const json = await exported(page, '#export-json');
  expect(JSON.parse(json.text)).toEqual(packet);
  await expect(page.locator('#chart-area svg')).toBeVisible();
});

test('prices that would lose decimal precision are rejected in the details form', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('input[name="price"]').fill('0.1234567890123456789');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('precision would be lost');
  await expect(page.locator('#reference-price')).toHaveText('100 USD');
});

test('imported synthetic packets with distinct content require replacement confirmation', async ({ page }) => {
  const packet = examplePacket(); packet.thesis = 'Preserve this imported synthetic packet.';
  await importPacket(page, packet);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#new-packet').click();
  await expect(page.locator('#thesis')).toHaveText(packet.thesis);
  await expect(page.locator('#packet-editor')).toBeHidden();
});

test('edited synthetic drafts cannot be replaced without a confirmation', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="thesis"]').fill('Keep this draft.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#new-packet').click();
  await expect(page.locator('#thesis')).toHaveText('Keep this draft.');
  await expect(page.locator('#packet-editor')).toBeHidden();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#new-packet').click();
  await expect(page.locator('#packet-editor')).toBeVisible();
});

test('Escape preserves unapplied changes when canceled and restores focus after discard', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="thesis"]').fill('Unapplied edit.');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  page.once('dialog', dialog => dialog.dismiss());
  await page.keyboard.press('Escape');
  await expect(page.locator('#packet-editor')).toBeVisible();
  await expect(page.locator('textarea[name="thesis"]')).toHaveValue('Unapplied edit.');
  page.once('dialog', dialog => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.locator('#packet-editor')).toBeHidden();
  await expect(page.locator('#edit-details')).toBeFocused();
});

test('local saving is opt-in, survives reload, and clears only the app key', async ({ page }) => {
  await page.locator('#remember-packet').check();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).asset.symbol, STORAGE_KEY)).toBe('DEMO');
  await navigate(page, { reload: true });
  await expect(page.locator('#remember-packet')).toBeChecked();
  await expect(page.locator('#storage-status')).toContainText('Restored');
  await page.evaluate(() => localStorage.setItem('unrelated-test-key', 'keep'));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-saved').click();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('unrelated-test-key'))).toBe('keep');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});

test('corrupt storage is retained without replacement and saving stays off', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{"bad":true}'), STORAGE_KEY);
  await navigate(page, { reload: true });
  await expect(page.locator('#app-error')).toContainText('not deleted or overwritten');
  await expect(page.locator('#remember-packet')).not.toBeChecked();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{"bad":true}');
});

test('quota failures remain visible after edits and do not replace a previous saved draft', async ({ page }) => {
  await page.locator('#remember-packet').check();
  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('Test storage full', 'QuotaExceededError'); }; });
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="thesis"]').fill('Only in memory.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#app-error')).toContainText('storage is unavailable or full');
  await expect(page.locator('#remember-packet')).not.toBeChecked();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).thesis, STORAGE_KEY)).toBe(examplePacket().thesis);
});

test('another tab changing storage pauses saving without replacing the open packet', async ({ page, context }) => {
  await page.locator('#remember-packet').check();
  const other = await context.newPage();
  await navigate(other);
  await other.evaluate(key => localStorage.removeItem(key), STORAGE_KEY);
  await expect(page.locator('#remember-packet')).not.toBeChecked();
  await expect(page.locator('#storage-status')).toContainText('another tab');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await other.close();
});

test('expiry refresh marks the horizon elapsed and withholds charts even with a focused tab', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-08-20T20:59:30Z'));
  await importPacket(page, research());
  await page.locator('#tab-12h').focus();
  await page.clock.fastForward(60000);
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await expect(page.locator('#tab-12h')).toContainText('ELAPSED');
  await expect(page.locator('#expiry-12h')).toBeVisible();
  await expect(page.locator('#tab-12h')).toBeFocused();
});

test('mobile and desktop layouts contain overflow and keep dialog actions reachable', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page overflow at ' + width).toBe(true);
    await page.locator('#edit-details').click();
    await page.getByRole('button', { name: 'Save details', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Save details', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: 'Save details', exact: true }).click();
    await expect(page.locator('#packet-editor')).toBeHidden();
  }
});

test('long prose and large exact price labels do not overflow the page or SVG', async ({ page }) => {
  const packet = research();
  packet.thesis = 'X'.repeat(5000); packet.asset.venue = 'V'.repeat(120); packet.asset.name = 'N'.repeat(120);
  packet.reference.price *= 1e9;
  for (const h of packet.horizons) for (const s of h.scenarios) { s.lower *= 1e9; if (s.upper !== null) s.upper *= 1e9; }
  await importPacket(page, packet);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  const clipped = await page.locator('#chart-area svg text').evaluateAll(nodes => nodes.filter(node => {
    const box = node.getBBox(); return box.x < 0 || box.x + box.width > 820;
  }).map(node => node.textContent));
  expect(clipped).toEqual([]);
});

test('print styling reveals all horizons, and reduced motion keeps the controls usable', async ({ page }) => {
  const originalOpen = await page.locator('details').evaluateAll(nodes => nodes.map(node => node.open));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  for (const id of ['12h', '24h', '3d', '7d']) await expect(page.locator('#horizon-' + id)).toBeVisible();
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#assertion-record')).toBeVisible();
  await expect(page.locator('.source-item blockquote').first()).toBeVisible();
  await expect(page.locator('.driver-grid').first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.locator('details').evaluateAll(nodes => nodes.map(node => node.open))).toEqual(originalOpen);
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  await page.locator('#tab-3d').click();
  await expect(page.locator('#horizon-3d')).toBeVisible();
});
