import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { examplePacket } from '../../web/example.js';
import { CSP, HASHED_ASSET } from '../../tools/web-config.mjs';

const origin = new URL(process.env.PRODUCTION_URL).origin;
const localManifest = JSON.parse(await readFile(new URL('../../dist/build-info.json', import.meta.url), 'utf8'));

test('production serves the reviewed artifact and complete local-only workflow', async ({ page, request }) => {
  const root = await request.get('/');
  expect(root.status()).toBe(200);
  expect(root.headers()).toMatchObject({
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-security-policy': CSP,
    'content-type': 'text/html; charset=utf-8',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  expect(root.headers()['strict-transport-security']).toMatch(/max-age=\d+/);

  const manifestResponse = await request.get('/build-info.json');
  expect(manifestResponse.status()).toBe(200);
  expect(await manifestResponse.json()).toEqual(localManifest);
  const asset = localManifest.files.find(name => name.startsWith('app.'));
  expect(HASHED_ASSET.test(asset)).toBe(true);
  const assetResponse = await request.get('/' + asset);
  expect(assetResponse.status()).toBe(200);
  expect(assetResponse.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  expect((await request.get('/package.json')).status()).toBe(404);

  const origins = new Set();
  const errors = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol)) origins.add(url.origin);
  });
  page.on('pageerror', error => errors.push(error.message));
  expect((await page.goto('/')).status()).toBe(200);
  await expect(page.locator('#asset-symbol')).toHaveText('DEMO');
  await expect(page.locator('#chart-area svg')).toBeVisible();
  await expect(page.locator('#assertion-record .assertion-summary')).toHaveCount(5);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.locator('#new-packet').click();
  await page.locator('#close-editor').click();
  await expect(page.locator('#reference-price')).toContainText('UNKNOWN');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);

  const packet = examplePacket();
  await page.locator('#packet-file').setInputFiles({
    name: 'packet.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(packet)),
  });
  await expect(page.locator('#notice')).toContainText('Packet imported locally');
  await expect(page.locator('#chart-area svg')).toBeVisible();

  await page.locator('#remember-packet').check();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).asset.symbol, 'crypto-research-desk.packet.v1')).toBe('DEMO');
  const pendingDownload = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await pendingDownload;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual(packet);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-saved').click();
  expect(await page.evaluate(key => localStorage.getItem(key), 'crypto-research-desk.packet.v1')).toBeNull();
  await page.locator('#edit-details').click();
  await expect(page.locator('textarea[name="method-description"]')).toHaveValue(packet.method.description);
  await expect(page.locator('#source-editor-list > fieldset')).toHaveCount(packet.sources.length);
  await expect(page.locator('#horizon-editor-list > details')).toHaveCount(4);
  await page.locator('textarea[name="method-description"]').fill('Production acceptance edit with fictional data.');
  await page.locator('input[name="horizon-0-bearCeiling"]').fill('93');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#notice')).toContainText('previous review was reset');
  await expect(page.locator('#chart-area svg')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 568 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('.horizon-panel').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display !== 'none'))).toBe(true);

  expect(errors).toEqual([]);
  expect([...origins]).toEqual([origin]);
});
