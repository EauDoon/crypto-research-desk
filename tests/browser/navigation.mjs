import assert from 'node:assert/strict';
import { HASHED_ASSET } from '../../tools/web-config.mjs';
import { PREVIEW_ORIGIN } from './origin.mjs';

const instrumented = new WeakSet();
function readyDocument(state) {
  return state?.origin === PREVIEW_ORIGIN && state.path === '/' && state.readyState === 'complete' &&
    typeof state.documentId === 'string' && state.documentId.length > 0 &&
    state.nativeEvents?.includes('domcontentloaded') && state.nativeEvents.includes('load') &&
    state.symbol === 'DEMO' && state.hasChart === true && state.assertionCount === 5 &&
    state.modulePath?.startsWith('/app.') && HASHED_ASSET.test(state.modulePath.slice(1)) &&
    state.stylesheets?.length === 1 && state.stylesheets[0].path.startsWith('/styles.') &&
    HASHED_ASSET.test(state.stylesheets[0].path.slice(1)) && state.stylesheets[0].rules > 0;
}

// Observed in CI with Playwright 1.62.1; see microsoft/playwright#42183.
export function isFirefoxStartupRace(evidence) {
  const { browserName, errorName, reload, documentState, responses, failures, pending, runtimeErrors, expectedAssets } = evidence;
  if (browserName !== 'firefox' || errorName !== 'TimeoutError' || reload || !readyDocument(documentState) ||
      failures.length || pending.length || runtimeErrors.length ||
      responses.some(response => response.status !== 200)) return false;
  const paths = new Set(responses.map(response => response.path));
  if (paths.size !== responses.length) return false;
  if (!paths.has('/') || !paths.has(documentState.modulePath) || !paths.has(documentState.stylesheets[0].path)) return false;
  // Every hashed asset emitted by the current build must be present. The caller
  // supplies that list; without it the navigation is never treated as recovered.
  if (!Array.isArray(expectedAssets) || !expectedAssets.length) return false;
  return expectedAssets.every(path => paths.has(path));
}

// Creates a context and page for one test and always closes the context, so a
// failing assertion cannot leak a browser context into later tests.
export async function withIsolatedPage(browser, options, run) {
  const context = await browser.newContext(options);
  try {
    return await run(await context.newPage(), context);
  } finally {
    await context.close();
  }
}

// A bounded navigation for pages the startup probe cannot inspect (JavaScript
// disabled, application module blocked) and for the live smoke. In Firefox a
// completed navigation can still time out (microsoft/playwright#42183), so a
// TimeoutError there is logged and retried exactly once; anything else throws.
export async function gotoOnce(page, path = '/', options = {}) {
  const attempt = () => page.goto(path, { timeout: 10000, ...options });
  let response;
  try {
    response = await attempt();
  } catch (error) {
    const browserName = page.context().browser()?.browserType().name();
    if (browserName !== 'firefox' || error.name !== 'TimeoutError') throw error;
    console.warn('Navigation diagnostics: ' + JSON.stringify({ browserName, errorName: error.name, path, url: page.url() }));
    console.warn('Retrying Firefox navigation once (microsoft/playwright#42183).');
    response = await attempt();
  }
  assert.equal(response?.status(), 200, 'navigation status for ' + path);
  return response;
}

async function snapshot(page) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(() => ({
        origin: location.origin, path: location.pathname, readyState: document.readyState,
        documentId: window.__crdNavigationProbe?.documentId,
        nativeEvents: window.__crdNavigationProbe?.events,
        symbol: document.querySelector('#asset-symbol')?.textContent,
        hasChart: Boolean(document.querySelector('#chart-area svg')),
        assertionCount: document.querySelectorAll('#assertion-record .assertion-summary').length,
        modulePath: new URL(document.querySelector('script[type="module"]').src).pathname,
        stylesheets: [...document.styleSheets].map(sheet => ({ path: new URL(sheet.href).pathname, rules: sheet.cssRules.length })),
      })).catch(() => ({ unavailable: true })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: true }), 1500); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Reads the startup probe until the document is ready or settleMs has passed.
// On a busy machine one bounded probe of a loaded document can time out; a
// document that never becomes ready still fails once the window closes.
async function settledSnapshot(page, settleMs) {
  const deadline = Date.now() + settleMs;
  let state = await snapshot(page);
  while (!readyDocument(state) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 250));
    state = await snapshot(page);
  }
  return state;
}

export async function navigate(page, { reload = false, expectedAssets, settleMs = 3000 } = {}) {
  if (!instrumented.has(page)) {
    await page.addInitScript(() => {
      const probe = { documentId: crypto.randomUUID(), events: [] };
      window.__crdNavigationProbe = probe;
      document.addEventListener('DOMContentLoaded', () => probe.events.push('domcontentloaded'), { once: true });
      window.addEventListener('load', () => probe.events.push('load'), { once: true });
    });
    instrumented.add(page);
  }
  const events = []; const pending = new Set(); const responses = []; const failures = []; const runtimeErrors = [];
  const listeners = {
    request: request => pending.add(request),
    requestfinished: request => pending.delete(request),
    requestfailed: request => {
      pending.delete(request);
      failures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText });
    },
    response: response => responses.push({ path: new URL(response.url()).pathname, status: response.status() }),
    domcontentloaded: () => events.push('domcontentloaded'),
    load: () => events.push('load'),
    pageerror: error => runtimeErrors.push(error.message),
  };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
  try {
    const response = await (reload ? page.reload({ timeout: 10000 }) : page.goto('/', { timeout: 10000 }));
    assert.equal(response?.status(), 200, 'workbench navigation status');
    assert.deepEqual(runtimeErrors, [], 'navigation runtime errors');
    assert.deepEqual(failures, [], 'navigation resource failures');
    assert.ok(responses.every(response => response.status === 200), 'navigation resource statuses');
    if (!reload) assert.ok(readyDocument(await settledSnapshot(page, settleMs)), 'workbench startup document');
  } catch (error) {
    const evidence = {
      browserName: page.context().browser()?.browserType().name(), errorName: error.name, reload, expectedAssets,
      events: [...events], responses: [...responses], failures: [...failures], runtimeErrors: [...runtimeErrors],
      pending: [...pending].map(request => new URL(request.url()).pathname),
    };
    evidence.documentState = await snapshot(page);
    console.warn('Navigation diagnostics: ' + JSON.stringify(evidence));
    if (!isFirefoxStartupRace(evidence)) throw error;
    console.warn('Recovering completed Firefox startup navigation once (microsoft/playwright#42183).');
    events.length = responses.length = failures.length = runtimeErrors.length = 0;
    pending.clear();
    const response = await page.goto('/', { timeout: 10000 });
    assert.equal(response?.status(), 200, 'recovered workbench navigation status');
    assert.deepEqual(runtimeErrors, [], 'recovered navigation runtime errors');
    assert.deepEqual(failures, [], 'recovered navigation resource failures');
    assert.ok(responses.every(response => response.status === 200), 'recovered navigation resource statuses');
    assert.equal(pending.size, 0, 'recovered navigation pending requests');
    // A cached asset may have no new network event. Verify the executed app and loaded CSS instead.
    const recovered = await settledSnapshot(page, settleMs);
    assert.ok(readyDocument(recovered), 'recovered navigation document');
    assert.notEqual(recovered.documentId, evidence.documentState.documentId, 'recovered navigation must create a new document');
    assert.equal(recovered.modulePath, evidence.documentState.modulePath, 'recovered navigation module identity');
    assert.equal(recovered.stylesheets[0].path, evidence.documentState.stylesheets[0].path, 'recovered navigation stylesheet identity');
  } finally {
    for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
  }
}
