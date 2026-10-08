import { readFileSync } from 'node:fs';
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { HASHED_ASSET } from '../../tools/web-config.mjs';
import { navigate as navigateWithEvidence } from './navigation.mjs';
import { PREVIEW_ORIGIN } from './origin.mjs';

export { gotoOnce, withIsolatedPage } from './navigation.mjs';

// The hashed assets of the build under test, read on first use. Only Playwright
// specs reach this; `npm run test:browser` always builds dist/ first, while unit
// tests import navigation.mjs, which never reads dist/.
let builtAssets;
function expectedAssets() {
  builtAssets ??= JSON.parse(readFileSync(new URL('../../dist/build-info.json', import.meta.url), 'utf8'))
    .files.filter(name => HASHED_ASSET.test(name)).map(name => '/' + name);
  return builtAssets;
}

// Startup navigation that may recover the Firefox race only when every hashed
// asset of this build was actually served.
export function navigate(page, options = {}) {
  return navigateWithEvidence(page, { ...options, expectedAssets: expectedAssets() });
}

// One accessibility bar for every spec, including the live production smoke.
export const ACCESSIBILITY_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// Every test's default `page` is guarded: no uncaught runtime error, no console
// warning or error, and no request outside the local preview origin or blob:
// downloads. The guard is automatic, so a spec cannot forget it. Tests that
// create their own browser contexts keep their own assertions for those pages.
export const test = base.extend({
  runtimeGuard: [async ({ page }, use) => {
    const runtimeErrors = [], consoleMessages = [], externalRequests = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (['warning', 'error'].includes(message.type())) consoleMessages.push(message.type() + ': ' + message.text());
    });
    page.on('request', request => {
      const url = request.url();
      if (!url.startsWith(PREVIEW_ORIGIN + '/') && !url.startsWith('blob:')) externalRequests.push(url);
    });
    await use();
    expect(runtimeErrors, 'browser runtime errors').toEqual([]);
    expect(consoleMessages, 'browser console warnings and errors').toEqual([]);
    expect(externalRequests, 'unexpected external network requests').toEqual([]);
  }, { auto: true }],
});

export { expect };

// label-content-name-mismatch (WCAG 2.5.3 Label in Name) is experimental in
// axe-core and off by default, so it is enabled explicitly. options() replaces
// every earlier option, so it must come before withTags() or the tag filter is lost.
export async function checkAccessibility(page) {
  const result = await new AxeBuilder({ page })
    .options({ rules: { 'label-content-name-mismatch': { enabled: true } } })
    .withTags(ACCESSIBILITY_TAGS).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}
