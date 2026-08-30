import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { examplePacket } from '../../web/example.js';
import { MAX_PACKET_BYTES, blankPacket } from '../../web/packet.js';
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
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
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
  await expect(page.locator('#chart-area svg')).toContainText('Bull floor 106');
  await expect(page.locator('#chart-area svg')).toContainText('Bear ceiling 94');
  await expect(page.locator('progress').first()).toHaveAttribute('aria-hidden', 'true');
  await a11y(page);
});

test('startup fails closed when JavaScript is unavailable', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const noScriptPage = await context.newPage();
  const response = await noScriptPage.goto('/', { waitUntil: 'commit' });
  expect(response?.status()).toBe(200);
  await expect(noScriptPage.locator('html')).toHaveClass(/app-unavailable/);
  await expect(noScriptPage.locator('#startup-status')).toContainText('Research workbench unavailable');
  await expect(noScriptPage.locator('.requires-app:visible')).toHaveCount(0);
  await expect(noScriptPage.getByRole('button')).toHaveCount(0);
  await expect(noScriptPage.locator('#guide')).toBeVisible();
  await expect(noScriptPage.locator('.page-footer')).toContainText('cannot place trades');
  await context.close();
});

test('startup remains fail closed when the application module cannot load', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await context.route(/\/app(?:\.[^/]+)?\.js$/, route => route.abort());
  const failedPage = await context.newPage();
  await failedPage.goto('/');
  await expect(failedPage.locator('html')).toHaveClass(/app-unavailable/);
  await expect(failedPage.locator('#startup-status')).toBeVisible();
  await expect(failedPage.locator('.requires-app:visible')).toHaveCount(0);
  await context.close();
});

test('startup does not shift visible content when the application module arrives', async ({ browser, baseURL, browserName }) => {
  test.skip(browserName !== 'chromium', 'Layout Shift entries are exposed by Chromium.');
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    window.__cumulativeLayoutShift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cumulativeLayoutShift += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await context.route(/\/app(?:\.[^/]+)?\.js$/, async route => {
    await new Promise(resolve => setTimeout(resolve, 750));
    await route.continue();
  });
  const measuredPage = await context.newPage();
  await measuredPage.goto('/');
  await expect(measuredPage.locator('html')).not.toHaveClass(/app-unavailable/);
  expect(await measuredPage.evaluate(() => window.__cumulativeLayoutShift)).toBeLessThan(0.1);
  await context.close();
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
  await page.locator('#packet-file').setInputFiles({
    name: 'invalid-utf8.json', mimeType: 'application/json',
    buffer: Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
  });
  await expect(page.locator('#app-error')).toContainText('valid UTF-8');
  expect(await page.evaluate(() => ({}).polluted)).toBeUndefined();
});

test('dropped JSON uses the same strict local import path', async ({ page }) => {
  const packet = research(); packet.asset.symbol = 'DROP';
  await page.evaluate(packet => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([JSON.stringify(packet)], 'packet.json', { type: 'application/json' }));
    document.querySelector('#import-zone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, packet);
  await expect(page.locator('#asset-symbol')).toHaveText('DROP');
  await expect(page.locator('#notice')).toContainText('Packet imported locally');
  await expect(page.locator('#import-packet')).toHaveAccessibleDescription('or drop JSON here');
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['{}'], 'first.json', { type: 'application/json' }));
    transfer.items.add(new File(['{}'], 'second.json', { type: 'application/json' }));
    document.querySelector('#import-zone').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  });
  await expect(page.locator('#app-error')).toContainText('Drop one JSON file at a time');
  await expect(page.locator('#asset-symbol')).toHaveText('DROP');
});

test('unsupported drops are canceled before browser default handling', async ({ page }) => {
  const result = await page.evaluate(() => {
    const zone = document.querySelector('#import-zone');
    const dragTransfer = new DataTransfer();
    dragTransfer.setData('text/uri-list', 'https://example.com/research.json');
    const dragover = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dragTransfer });
    const dragResult = zone.dispatchEvent(dragover);

    const dropTransfer = new DataTransfer();
    dropTransfer.setData('text/plain', '{"schemaVersion":1}');
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dropTransfer });
    const dropResult = zone.dispatchEvent(drop);
    return {
      dragDefaultPrevented: dragover.defaultPrevented,
      dragResult,
      dropDefaultPrevented: drop.defaultPrevented,
      dropResult,
      href: window.location.href,
    };
  });
  expect(result).toMatchObject({
    dragDefaultPrevented: true,
    dragResult: false,
    dropDefaultPrevented: true,
    dropResult: false,
  });
  expect(new URL(result.href).pathname).toBe('/');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  await expect(page.locator('#app-error')).toContainText('Drop one JSON file at a time');
});

test('the newest file import wins when reads complete out of order', async ({ page }) => {
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      if (this.name.startsWith('slow')) await new Promise(resolve => setTimeout(resolve, 150));
      return read.call(this);
    };
  });
  const slow = research(); slow.asset.symbol = 'SLOW';
  const fast = research(); fast.asset.symbol = 'FAST';
  const input = page.locator('#packet-file');
  await input.setInputFiles({ name: 'slow.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(slow)) });
  await input.setInputFiles({ name: 'fast.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fast)) });
  await expect(page.locator('#asset-symbol')).toHaveText('FAST');
  await page.waitForTimeout(200);
  await expect(page.locator('#asset-symbol')).toHaveText('FAST');
});

test('opening an editor cancels a pending file read before either draft can overwrite the other', async ({ page }) => {
  await page.evaluate(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      await new Promise(resolve => { window.releasePendingFileRead = resolve; });
      return read.call(this);
    };
  });
  const incoming = research(); incoming.asset.symbol = 'IMPORTED';
  await page.locator('#packet-file').setInputFiles({
    name: 'delayed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(incoming)),
  });
  await page.waitForFunction(() => typeof window.releasePendingFileRead === 'function');
  await page.locator('#edit-details').click();
  await page.evaluate(() => window.releasePendingFileRead());
  await page.locator('textarea[name="thesis"]').fill('The editor draft remains authoritative.');
  await expect(page.locator('#packet-file')).toHaveValue('');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  await expect(page.locator('input[name="symbol"]')).toHaveValue('DEMO');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});

test('one-line packet fields reject line breaks instead of flattening them in the details editor', async ({ page }) => {
  const packet = research(); packet.asset.name = 'Bitcoin\nCash';
  await importText(page, JSON.stringify(packet));
  await expect(page.locator('#app-error')).toContainText('asset.name: Use one line');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});

test('textarea packet fields reject carriage returns instead of normalizing evidence records', async ({ page }) => {
  const packet = research(); packet.sources[0].excerpt = 'First line\r\nSecond line';
  await importText(page, JSON.stringify(packet));
  await expect(page.locator('#app-error')).toContainText('sources[0].excerpt');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
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
  await expect(page.locator('.source-host').first()).toHaveText('www.iana.org');
  await a11y(page);
});

test('evidence records are named articles with navigable source headings', async ({ page }) => {
  const articles = page.locator('#source-list article');
  await expect(articles).toHaveCount(2);
  for (const [index, source] of examplePacket().sources.entries()) {
    const article = articles.nth(index);
    const heading = article.getByRole('heading', { level: 3, name: new RegExp(source.title) });
    await expect(heading).toHaveCount(1);
    await expect(article).toHaveAttribute('aria-labelledby', await heading.getAttribute('id'));
    await expect(article).toHaveAccessibleName(new RegExp(source.title));
  }
});

test('JSON and Markdown downloads preserve packet content and evidence', async ({ page }) => {
  const json = await exported(page, '#export-json');
  expect(JSON.parse(json.text)).toEqual(examplePacket());
  expect(json.name).toBe('(2026-08-20)DEMO Research Packet.json');
  const markdown = await exported(page, '#export-brief');
  expect(markdown.name).toBe('(2026-08-20)DEMO Research Brief.md');
  for (const text of ['SYNTHETIC EXAMPLE', '## 12 hours', '## 24 hours', '## 3 days', '## 7 days', 'authority', 'Print / PDF']) {
    expect(markdown.text).toContain(text);
  }
});

test('raw packet JSON can be copied locally without changing the open record', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async text => { window.copiedPacket = text; } },
    });
  });
  await page.locator('#copy-json').click();
  expect(JSON.parse(await page.evaluate(() => window.copiedPacket))).toEqual(examplePacket());
  await expect(page.locator('#notice')).toContainText('Raw JSON copied locally');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
});

test('a formatted near-limit JSON export can be imported again', async ({ page }) => {
  const packet = examplePacket();
  packet.sources = Array.from({ length: 32 }, (_, index) => ({
    id: 'source-' + index, title: 'Source ' + index, url: 'https://example.com/source-' + index,
    type: 'primary', publishedAt: '2026-08-20T07:00:00Z', capturedAt: '2026-08-20T08:00:00Z',
    claim: 'c'.repeat(3890), excerpt: 'e'.repeat(3890),
  }));
  packet.riskReview.sourceIds = packet.sources.map(source => source.id);
  await importPacket(page, packet);
  const json = await exported(page, '#export-json');
  expect(Buffer.byteLength(json.text)).toBeGreaterThan(MAX_PACKET_BYTES);
  page.once('dialog', dialog => dialog.accept());
  await importText(page, json.text);
  await expect(page.locator('#notice')).toContainText('Packet imported locally');
  expect(JSON.parse((await exported(page, '#export-json')).text)).toEqual(packet);
});

test('undated exports use exact portable fallback filenames', async ({ page }) => {
  await page.locator('#new-packet').click();
  await page.locator('#close-editor').click();
  const json = await exported(page, '#export-json');
  const markdown = await exported(page, '#export-brief');
  expect(json.name).toBe('(Undated)Research Packet.json');
  expect(markdown.name).toBe('(Undated)Research Brief.md');
});

test('export filenames keep the packet date across positive and negative UTC boundaries', async ({ page }) => {
  for (const [capturedAt, timezone, date] of [
    ['2026-08-20T00:30:00+08:00', 'Asia/Singapore', '2026-08-20'],
    ['2026-08-19T23:30:00-07:00', 'America/Los_Angeles', '2026-08-19'],
  ]) {
    const packet = blankPacket();
    packet.asset.symbol = 'OFFSET'; packet.reference.capturedAt = capturedAt; packet.reference.timezone = timezone;
    if (capturedAt.endsWith('-07:00')) page.once('dialog', dialog => dialog.accept());
    await importPacket(page, packet);
    expect((await exported(page, '#export-json')).name).toBe('(' + date + ')OFFSET Research Packet.json');
    expect((await exported(page, '#export-brief')).name).toBe('(' + date + ')OFFSET Research Brief.md');
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

test('method and dated sources can be edited without manipulating packet JSON', async ({ page }) => {
  await page.locator('#edit-details').click();
  await a11y(page);
  await page.locator('select[name="method-basis"]').selectOption('empirical');
  await page.locator('input[name="method-sampleSize"]').fill('12');
  await page.locator('textarea[name="method-description"]').fill('Twelve fictional observations reviewed manually.');
  await page.getByRole('button', { name: 'Remove source 2' }).click();
  await page.locator('#add-source').click();
  const source = {
    id: 'official-record', title: 'Official public record', url: 'http://www.iana.org/domains/reserved', type: 'primary',
    publishedAt: '2026-08-20T06:00:00Z', capturedAt: '2026-08-20T08:00:00Z',
    claim: 'A fictional method input was recorded.', excerpt: 'Fictional excerpt for browser-form verification.',
  };
  for (const [key, value] of Object.entries(source)) {
    const control = page.locator('[name="source-1-' + key + '"]');
    if (key === 'type') await control.selectOption(value); else await control.fill(value);
  }
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const url = page.locator('input[name="source-1-url"]');
  await expect(page.locator('#editor-error')).toContainText('public HTTPS');
  await expect(url).toBeFocused();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await url.fill('https://www.iana.org/domains/reserved');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();

  const json = JSON.parse((await exported(page, '#export-json')).text);
  expect(json.method).toMatchObject({ basis: 'empirical', sampleSize: 12, description: 'Twelve fictional observations reviewed manually.' });
  expect(json.sources.map(item => item.id)).toEqual(['example-upgrade', 'official-record']);
  expect(json.sources[1].url).toBe('https://www.iana.org/domains/reserved');
  expect(json.riskReview).toEqual(blankPacket().riskReview);
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
});

test('horizon scenarios can be edited with derived contiguous bounds', async ({ page }) => {
  await page.locator('#edit-details').click();
  await expect(page.locator('#horizon-editor-list > details')).toHaveCount(4);
  const bearCeiling = page.locator('input[name="horizon-0-bearCeiling"]');
  await bearCeiling.fill('110');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const bullFloor = page.locator('input[name="horizon-0-bullFloor"]');
  await expect(page.locator('#editor-error')).toContainText('upper bound greater');
  await expect(bullFloor).toBeFocused();
  await expect(page.locator('#horizon-editor-list > details').first()).toHaveAttribute('open', '');
  await bearCeiling.fill('93');
  await page.locator('textarea[name="horizon-0-scenario-0-driver"]').fill('Changed fictional downside driver.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();

  const json = JSON.parse((await exported(page, '#export-json')).text);
  const [bear, base, bull] = json.horizons[0].scenarios;
  expect([bear.lower, bear.upper, base.lower, base.upper, bull.lower, bull.upper]).toEqual([0, 93, 93, 106, 106, null]);
  expect(bear.driver).toBe('Changed fictional downside driver.');
  expect(json.riskReview).toEqual(blankPacket().riskReview);
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
});

test('marking a horizon incomplete removes probability guesses and requires a reason', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('select[name="horizon-0-status"]').selectOption('incomplete');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const reason = page.locator('textarea[name="horizon-0-gapReason"]');
  await expect(page.locator('#editor-error')).toContainText('Explain the missing evidence');
  await expect(reason).toBeFocused();
  await page.locator('select[name="horizon-0-status"]').selectOption('complete');
  await expect(page.locator('#editor-error')).toBeHidden();
  await page.locator('select[name="horizon-0-status"]').selectOption('incomplete');
  await reason.fill('No evidence-backed 12-hour forecast is available.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const json = JSON.parse((await exported(page, '#export-json')).text);
  expect(json.horizons[0]).toMatchObject({ status: 'incomplete', gapReason: 'No evidence-backed 12-hour forecast is available.', scenarios: [] });
  expect(json.riskReview).toEqual(blankPacket().riskReview);
});

test('changing input and review records together preserves the editor and rejects the update', async ({ page }) => {
  const packet = await fullEditor(page);
  packet.thesis = 'Changed thesis';
  packet.riskReview.unknownField = true;
  await page.locator('#packet-json').fill(JSON.stringify(packet));
  await page.locator('#apply-json').click();
  await expect(page.locator('#editor-error')).toContainText('separately from a new review');
  await expect(page.locator('#packet-json')).toBeFocused();
  await expect(page.locator('#packet-json')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#packet-json')).toHaveAttribute('aria-describedby', /\beditor-error\b/);
  expect(JSON.parse(await page.locator('#packet-json').inputValue()).riskReview.unknownField).toBe(true);
  await expect(page.locator('#thesis')).toHaveText(examplePacket().thesis);
  await expect(page.locator('#packet-editor')).toBeVisible();
});

test('JSON parse errors mark and focus the JSON editor until it changes', async ({ page }) => {
  await page.locator('#edit-json').click();
  await page.locator('#packet-json').fill('{');
  await page.locator('#apply-json').click();
  await expect(page.locator('#editor-error')).toBeVisible();
  await expect(page.locator('#packet-json')).toBeFocused();
  await expect(page.locator('#packet-json')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#packet-json')).toHaveAttribute('aria-describedby', 'editor-help editor-error');
  await page.locator('#packet-json').fill('{}');
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(page.locator('#packet-json')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#packet-json')).toHaveAttribute('aria-describedby', 'editor-help');
});

test('details validation focuses and describes the first editable invalid field', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.locator('#edit-details').click();
  const reviewer = page.locator('input[name="reviewer"]');
  await reviewer.fill('Example researcher');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('riskReview.reviewer');
  await expect(reviewer).toBeFocused();
  await expect(reviewer).toHaveAttribute('aria-invalid', 'true');
  await expect(reviewer).toHaveAttribute('aria-describedby', /\beditor-error\b/);
  const geometry = await page.evaluate(() => {
    const scroll = document.querySelector('#editor-scroll').getBoundingClientRect();
    const error = document.querySelector('#editor-error').getBoundingClientRect();
    const field = document.querySelector('input[name="reviewer"]').getBoundingClientRect();
    return { errorTop: error.top, scrollTop: scroll.top, fieldTop: field.top, fieldBottom: field.bottom, scrollBottom: scroll.bottom };
  });
  expect(geometry.errorTop).toBeGreaterThanOrEqual(geometry.scrollTop - 1);
  expect(geometry.fieldTop).toBeGreaterThan(geometry.errorTop);
  expect(geometry.fieldBottom).toBeLessThanOrEqual(geometry.scrollBottom + 1);
  await reviewer.fill('Independent reviewer');
  await expect(page.locator('#editor-error')).toBeHidden();
  await expect(reviewer).not.toHaveAttribute('aria-invalid', 'true');
  await expect(reviewer).not.toHaveAttribute('aria-describedby', /\beditor-error\b/);
});

test('a pending packet cannot combine new research with a final review', async ({ page }) => {
  await page.locator('#new-packet').click();
  await page.locator('textarea[name="thesis"]').fill('New research must be saved before review.');
  await page.locator('select[name="reviewStatus"]').selectOption('deliver');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('separately from a new review');
  await expect(page.locator('#packet-editor')).toBeVisible();
  await expect(page.locator('#thesis')).toHaveText('UNKNOWN');
});

test('material edits clear partial pending review data and compare review lists semantically', async ({ page }) => {
  const packet = research();
  packet.riskReview.status = 'pending';
  packet.riskReview.reviewer = 'Draft reviewer';
  packet.riskReview.assertions.reverse();
  await importPacket(page, packet);
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="thesis"]').fill('Changed after a partial review.');
  await page.locator('input[name="sourceIds"]').fill([...packet.riskReview.sourceIds].reverse().join(', '));
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('previous review was reset');
  const json = await exported(page, '#export-json');
  expect(JSON.parse(json.text).riskReview).toEqual(blankPacket().riskReview);
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

test('review-only form edits preserve equivalent horizon timestamp spellings', async ({ page }) => {
  const packet = research();
  packet.reference.capturedAt = '2026-08-20T17:00:00+08:00';
  packet.horizons.forEach((horizon, index) => {
    horizon.endAt = ['2026-08-21T05:00:00+08:00', '2026-08-21T17:00:00+08:00',
      '2026-08-23T17:00:00+08:00', '2026-08-27T17:00:00+08:00'][index];
  });
  await importPacket(page, packet);
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="reviewNotes"]').fill('Updated review note without changing research inputs.');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  const json = JSON.parse((await exported(page, '#export-json')).text);
  expect(json.horizons.map(horizon => horizon.endAt)).toEqual(packet.horizons.map(horizon => horizon.endAt));
  expect(json.riskReview.notes).toBe('Updated review note without changing research inputs.');
  await expect(page.locator('#chart-area svg')).toBeVisible();
});

test('details editing refuses to flatten an existing multiline list entry', async ({ page }) => {
  const packet = research(); packet.risks = ['First line\nSecond line'];
  await importPacket(page, packet);
  await page.locator('#edit-details').click();
  await page.locator('textarea[name="risks"]').fill('First line\nSecond line\nThird item');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('multiline entry');
  await expect(page.locator('textarea[name="risks"]')).toHaveValue('First line\nSecond line\nThird item');
  await expect(page.locator('#packet-editor')).toBeVisible();
});

test('prices that would lose decimal precision are rejected in the details form', async ({ page }) => {
  await page.locator('#edit-details').click();
  await page.locator('input[name="price"]').fill('0.1234567890123456789');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#editor-error')).toContainText('precision would be lost');
  await expect(page.locator('input[name="price"]')).toBeFocused();
  await expect(page.locator('input[name="price"]')).toHaveAttribute('aria-invalid', 'true');
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
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
});

test('clearing when no saved draft exists leaves the default packet clean', async ({ page }) => {
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-saved').click();
  await expect(page.locator('#storage-status')).toContainText('No saved draft was present');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
});

test('corrupt storage is retained without replacement and saving stays off', async ({ page }) => {
  await page.evaluate(key => localStorage.setItem(key, '{"bad":true}'), STORAGE_KEY);
  await navigate(page, { reload: true });
  await expect(page.locator('#app-error')).toContainText('not deleted or overwritten');
  await expect(page.locator('#remember-packet')).toBeDisabled();
  await expect(page.locator('#recover-saved')).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{"bad":true}');
  const recovery = await exported(page, '#recover-saved');
  expect(recovery.name).toBe('Unparsed Saved Research Draft.json');
  expect(JSON.parse(recovery.text)).toEqual({ storageKey: STORAGE_KEY, rawValue: '{"bad":true}' });
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('{"bad":true}');
  await a11y(page);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-saved').click();
  await expect(page.locator('#remember-packet')).toBeEnabled();
  await expect(page.locator('#recover-saved')).toBeHidden();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
});

test('storage denial at startup keeps the workbench usable and saving disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  await context.addInitScript(() => {
    Storage.prototype.getItem = function () { throw new DOMException('Test storage denied', 'SecurityError'); };
  });
  const deniedPage = await context.newPage();
  await navigate(deniedPage);
  await expect(deniedPage.locator('#asset-symbol')).toHaveText('DEMO');
  await expect(deniedPage.locator('#remember-packet')).toBeDisabled();
  await expect(deniedPage.locator('#recover-saved')).toBeHidden();
  await expect(deniedPage.locator('#storage-status')).toContainText('storage is unavailable');
  await a11y(deniedPage);
  await context.close();
});

test('failed saved-draft removal keeps its retention state visible', async ({ page }) => {
  await page.locator('#remember-packet').check();
  await page.evaluate(() => { Storage.prototype.removeItem = function () { throw new DOMException('Test storage denied', 'SecurityError'); }; });
  await page.locator('#remember-packet').evaluate(input => {
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#remember-packet')).toBeChecked();
  await expect(page.locator('#app-error')).toContainText('Saved draft removal failed');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).not.toBeNull();
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

test('a failed save keeps a replacement packet marked as unsaved', async ({ page }) => {
  await page.locator('#remember-packet').check();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('Test storage full', 'QuotaExceededError'); };
  });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#new-packet').click();
  await expect(page.locator('#app-error')).toContainText('storage is unavailable or full');
  await expect(page.locator('#remember-packet')).not.toBeChecked();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).asset.symbol, STORAGE_KEY)).toBe('DEMO');
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(true);
  await page.locator('#close-editor').click();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
    delete window.originalSetItem;
  });
  await page.locator('#remember-packet').check();
});

test('another tab changing storage locks destructive controls without replacing either draft', async ({ page, context }) => {
  await page.locator('#remember-packet').check();
  const other = await context.newPage();
  await navigate(other);
  const otherPacket = research(); otherPacket.thesis = 'Newer draft from another tab.';
  await other.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(otherPacket)]);
  await expect(page.locator('#remember-packet')).toBeDisabled();
  await expect(page.locator('#clear-saved')).toBeDisabled();
  await expect(page.locator('#storage-status')).toContainText('locked until reload');
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).thesis, STORAGE_KEY)).toBe(otherPacket.thesis);
  await a11y(page);
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

test('expiry moves focus to the chart heading when it removes the focused chart region', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.setSystemTime(new Date('2026-08-20T20:59:30Z'));
  await importPacket(page, research());
  await page.locator('#chart-scroll').focus();
  await page.clock.fastForward(60000);
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await expect(page.locator('#chart-heading')).toBeFocused();
});

test('import feedback and its rendered packet share one cutoff instant', async ({ page }) => {
  const packet = research();
  const expiry = Date.parse(packet.horizons[0].endAt);
  await page.evaluate(cutoff => {
    Date.now = () => /applyPacket|render|renderChart|refreshHorizonLabels/.test(new Error().stack) ? cutoff : cutoff - 1;
  }, expiry);
  await importPacket(page, packet);
  await expect(page.locator('#notice')).toContainText('Review the listed data gaps');
  await expect(page.locator('#structure-status')).toHaveText('INCOMPLETE');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await expect(page.locator('#tab-12h small')).toHaveText('ELAPSED');
});

test('one render uses one cutoff instant for structure, chart, and horizon labels', async ({ page }) => {
  const packet = research();
  const expiry = Date.parse(packet.horizons[0].endAt);
  await page.evaluate(cutoff => {
    Date.now = () => /renderChart|refreshHorizonLabels/.test(new Error().stack) ? cutoff : cutoff - 1;
  }, expiry);
  await importPacket(page, packet);
  await expect(page.locator('#structure-status')).toHaveText('Structure complete');
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#tab-12h small')).toHaveText('100% within horizon');
});

test('horizon navigation refreshes expiry before leaving a stale chart visible', async ({ page }) => {
  await page.clock.setSystemTime(new Date('2026-08-20T20:59:30Z'));
  await importPacket(page, research());
  await page.clock.setSystemTime(new Date('2026-08-20T21:00:00Z'));
  await page.locator('#tab-24h').click();
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await expect(page.locator('#tab-12h small')).toHaveText('ELAPSED');
  await expect(page.locator('#tab-24h')).toBeFocused();
});

test('mobile and desktop layouts contain overflow and keep dialog actions reachable', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page overflow at ' + width).toBe(true);
    await page.locator('#edit-details').click();
    await expect(page.getByRole('button', { name: 'Save details', exact: true })).toBeInViewport();
    await expect(page.locator('#close-editor')).toBeInViewport();
    if (width === 320) expect(await page.locator('input[name="horizon-0-scenario-0-probability"]')
      .evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(180);
    await page.getByRole('button', { name: 'Save details', exact: true }).click();
    await expect(page.locator('#packet-editor')).toBeHidden();
  }
});

test('scroll hints follow measured chart and table overflow after resizing', async ({ page }) => {
  for (const width of [768, 1000]) {
    await page.setViewportSize({ width, height: 1000 });
    const chart = page.locator('#chart-scroll');
    await expect.poll(() => chart.evaluate(node => node.scrollWidth > node.clientWidth + 1)).toBe(true);
    await expect(page.locator('#chart-area .scroll-hint')).toBeVisible();
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(
      '#chart-scroll, .horizon-panel:not([hidden]) .table-scroll',
    )].every(scroll => scroll.previousElementSibling.hidden === !(scroll.scrollWidth > scroll.clientWidth + 1)))).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 568 });
  const table = page.locator('.horizon-panel:not([hidden]) .table-scroll');
  await expect.poll(() => table.evaluate(node => node.scrollWidth > node.clientWidth + 1)).toBe(true);
  await expect(table.locator('xpath=preceding-sibling::*[1]')).toBeVisible();
});

test('short desktop sidebars scroll the final keyboard action into view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 320 });
  const sidebar = page.locator('.sidebar');
  expect(await sidebar.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.locator('.brand').focus();
  for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
  const repository = page.locator('.repository-link');
  await expect(repository).toBeFocused();
  await expect(repository).toBeInViewport();
  expect(await sidebar.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
});

test('the full packet editor opens at the beginning with actions visible on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.locator('#edit-json').click();
  await expect(page.locator('#close-editor')).toBeInViewport();
  await expect(page.locator('#apply-json')).toBeInViewport();
  expect(await page.locator('#packet-json').evaluate(node => ({
    selectionStart: node.selectionStart, scrollTop: node.scrollTop, scrollLeft: node.scrollLeft,
  }))).toEqual({ selectionStart: 0, scrollTop: 0, scrollLeft: 0 });
  expect(await page.locator('#editor-scroll').evaluate(node => node.scrollTop)).toBe(0);
});

test('short phone and landscape viewports keep the focused editor and complete footer visible', async ({ page }) => {
  for (const [width, height] of [[320, 320], [568, 320]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#edit-json').click();
    await expect(page.locator('#packet-json')).toBeFocused();
    await expect(page.locator('#close-editor')).toBeInViewport();
    await expect(page.locator('#apply-json')).toBeInViewport();
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector('#packet-editor').getBoundingClientRect();
      const scroll = document.querySelector('#editor-scroll').getBoundingClientRect();
      const textarea = document.querySelector('#packet-json').getBoundingClientRect();
      const footer = document.querySelector('.editor-footer').getBoundingClientRect();
      return {
        scrollHeight: scroll.height,
        textareaVisible: Math.min(textarea.bottom, scroll.bottom) - Math.max(textarea.top, scroll.top),
        footerContained: footer.top >= dialog.top && footer.bottom <= dialog.bottom + 1,
      };
    });
    expect(geometry.scrollHeight).toBeGreaterThan(40);
    expect(geometry.textareaVisible).toBeGreaterThan(20);
    expect(geometry.footerContained).toBe(true);
    await page.locator('#close-editor').click();
  }
  await page.setViewportSize({ width: 320, height: 320 });
  await page.locator('#edit-json').click();
  await page.setViewportSize({ width: 568, height: 320 });
  await expect.poll(() => page.evaluate(() => {
    const scroll = document.querySelector('#editor-scroll').getBoundingClientRect();
    const textarea = document.querySelector('#packet-json').getBoundingClientRect();
    return Math.min(textarea.bottom, scroll.bottom) - Math.max(textarea.top, scroll.top);
  })).toBeGreaterThan(20);
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

test('print styling reveals all horizons, and reduced motion keeps the controls usable', async ({ page, browserName }) => {
  const originalOpen = await page.locator('details').evaluateAll(nodes => nodes.map(node => node.open));
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print', reducedMotion: 'reduce' });
  for (const id of ['12h', '24h', '3d', '7d']) await expect(page.locator('#horizon-' + id)).toBeVisible();
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#assertion-record')).toBeVisible();
  await expect(page.locator('.source-item blockquote').first()).toBeVisible();
  await expect(page.locator('.driver-grid').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-print-identity', /RESEARCH ONLY · Provenance: SYNTHETIC EXAMPLE · Asset: DEMO — Demonstration asset/);
  await expect(page.locator('html')).toHaveAttribute('data-print-identity', /2026-08-20T09:00:00\.000Z/);
  for (const [index, source] of examplePacket().sources.entries()) {
    await expect(page.locator('.print-source-url').nth(index)).toBeVisible();
    await expect(page.locator('.print-source-url').nth(index)).toHaveText(new URL(source.url).href);
  }
  const printStyles = await page.evaluate(() => ({
    identityDisplay: getComputedStyle(document.querySelector('#print-identity')).display,
    identityPosition: getComputedStyle(document.querySelector('#print-identity')).position,
    marginMode: document.documentElement.classList.contains('page-margin-identity'),
    pageMarginIdentity: [...document.styleSheets].some(sheet => [...sheet.cssRules]
      .some(rule => rule.cssText.includes('@top-center') && rule.cssText.includes('attr(data-print-identity)'))),
    evidenceBreak: getComputedStyle(document.querySelector('#evidence')).breakBefore,
    sourceBreak: getComputedStyle(document.querySelector('.source-item')).breakInside,
    bodyFont: parseFloat(getComputedStyle(document.body).fontSize),
    tableFont: parseFloat(getComputedStyle(document.querySelector('table')).fontSize),
    sourceUrlFont: parseFloat(getComputedStyle(document.querySelector('.print-source-url')).fontSize),
  }));
  expect(printStyles.pageMarginIdentity).toBe(browserName === 'chromium');
  expect(printStyles.marginMode).toBe(browserName === 'chromium');
  expect(printStyles.identityDisplay).toBe(browserName === 'chromium' ? 'none' : 'block');
  if (browserName !== 'chromium') expect(printStyles.identityPosition).toBe('fixed');
  expect(printStyles.evidenceBreak).toBe('page');
  expect(['avoid', 'avoid-page']).toContain(printStyles.sourceBreak);
  expect(printStyles.bodyFont).toBeGreaterThanOrEqual(12);
  expect(printStyles.tableFont).toBeGreaterThanOrEqual(11);
  expect(printStyles.sourceUrlFont).toBeGreaterThanOrEqual(11);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect(await page.locator('details').evaluateAll(nodes => nodes.map(node => node.open))).toEqual(originalOpen);
  await page.emulateMedia({ media: 'screen', reducedMotion: 'reduce' });
  await page.locator('#tab-3d').click();
  await expect(page.locator('#horizon-3d')).toBeVisible();
});
