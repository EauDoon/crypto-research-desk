import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PREVIEW_ORIGIN } from './origin.mjs';

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

export async function checkAccessibility(page) {
  const result = await new AxeBuilder({ page }).withTags(ACCESSIBILITY_TAGS).analyze();
  expect(result.violations.map(item => ({ id: item.id, impact: item.impact, targets: item.nodes.map(node => node.target) }))).toEqual([]);
}
