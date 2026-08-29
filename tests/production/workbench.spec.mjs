import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { examplePacket } from '../../web/example.js';
import { HASHED_ASSET, SECURITY_HEADERS } from '../../tools/web-config.mjs';

const origin = new URL(process.env.PRODUCTION_URL).origin;
const localManifestBytes = await readFile(new URL('../../dist/build-info.json', import.meta.url));
const localManifest = JSON.parse(localManifestBytes);
const STORAGE_KEY = 'crypto-research-desk.packet.v1';
const CONTENT_TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8',
};
const deployedSecurityHeaders = Object.fromEntries(Object.entries(SECURITY_HEADERS)
  .map(([key, value]) => [key.toLowerCase(), value]));
const expectedHeaders = (contentType, cacheControl = 'public, max-age=0, must-revalidate') => ({
  ...deployedSecurityHeaders, 'cache-control': cacheControl, 'content-type': contentType,
});
async function downloaded(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  const download = await pending;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}

test('production serves the reviewed artifact and complete local-only workflow', async ({ page, request }) => {
  const root = await request.get('/');
  expect(root.status()).toBe(200);
  expect(root.headers()).toMatchObject(expectedHeaders('text/html; charset=utf-8'));
  expect(root.headers()['strict-transport-security']).toMatch(/max-age=\d+/);

  const manifestResponse = await request.get('/build-info.json');
  expect(manifestResponse.status()).toBe(200);
  expect(manifestResponse.headers()).toMatchObject(expectedHeaders('application/json; charset=utf-8'));
  expect(await manifestResponse.body()).toEqual(localManifestBytes);
  for (const name of localManifest.files) {
    const deployed = await request.get('/' + name);
    expect(deployed.status(), name).toBe(200);
    expect(deployed.headers(), name).toMatchObject(expectedHeaders(
      CONTENT_TYPES[name.split('.').at(-1)], HASHED_ASSET.test(name)
        ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'));
    expect(await deployed.body(), name).toEqual(await readFile(new URL('../../dist/' + name, import.meta.url)));
  }
  const missing = await request.get('/package.json');
  expect(missing.status()).toBe(404);
  expect(missing.headers()).toMatchObject(expectedHeaders('text/html; charset=utf-8'));

  const origins = new Set();
  const errors = [];
  const watch = target => {
    target.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol)) origins.add(url.origin);
    });
    target.on('pageerror', error => errors.push(error.message));
  };
  watch(page);
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
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).asset.symbol, STORAGE_KEY)).toBe('DEMO');
  expect(JSON.parse((await downloaded(page, '#export-json')).text)).toEqual(packet);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#clear-saved').click();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
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

  const corrupt = '{"bad":true}';
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, corrupt]);
  const recoveryPage = await page.context().newPage(); watch(recoveryPage);
  await recoveryPage.goto('/');
  await expect(recoveryPage.locator('#remember-packet')).toBeDisabled();
  const recovery = await downloaded(recoveryPage, '#recover-saved');
  expect(recovery.name).toBe('Unparsed Saved Research Draft.json');
  expect(JSON.parse(recovery.text)).toEqual({ storageKey: STORAGE_KEY, rawValue: corrupt });
  recoveryPage.once('dialog', dialog => dialog.accept());
  await recoveryPage.locator('#clear-saved').click();
  await recoveryPage.close();
  await expect(page.locator('#remember-packet')).toBeDisabled();
  await expect(page.locator('#clear-saved')).toBeDisabled();

  expect(errors).toEqual([]);
  expect([...origins]).toEqual([origin]);
});
