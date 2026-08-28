import assert from 'node:assert/strict';
import { HASHED_ASSET } from '../../tools/web-config.mjs';

const instrumented = new WeakSet();
function readyDocument(state) {
  return state?.origin === 'http://127.0.0.1:4173' && state.path === '/' && state.readyState === 'complete' &&
    typeof state.documentId === 'string' && state.documentId.length > 0 &&
    state.nativeEvents?.includes('domcontentloaded') && state.nativeEvents.includes('load') &&
    state.symbol === 'DEMO' && state.hasChart === true && state.assertionCount === 5 &&
    state.modulePath?.startsWith('/app.') && HASHED_ASSET.test(state.modulePath.slice(1)) &&
    state.stylesheets?.length === 1 && state.stylesheets[0].path.startsWith('/styles.') &&
    HASHED_ASSET.test(state.stylesheets[0].path.slice(1)) && state.stylesheets[0].rules > 0;
}

// Observed in CI with Playwright 1.62.1; see microsoft/playwright#42183.
export function isFirefoxStartupRace(evidence) {
  const { browserName, errorName, reload, documentState, responses, failures, pending, runtimeErrors } = evidence;
  if (browserName !== 'firefox' || errorName !== 'TimeoutError' || reload || !readyDocument(documentState) ||
      failures.length || pending.length || runtimeErrors.length || responses.length !== 6 ||
      responses.some(response => response.status !== 200)) return false;
  const paths = new Set(responses.map(response => response.path));
  return paths.size === 6 && paths.has('/') && paths.has(documentState.modulePath) &&
    paths.has(documentState.stylesheets[0].path) &&
    ['app', 'packet', 'example', 'styles', 'favicon'].every(name =>
      [...paths].some(path => path.startsWith('/' + name + '.') && HASHED_ASSET.test(path.slice(1))));
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

export async function navigate(page, { reload = false } = {}) {
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
    if (!reload) assert.ok(readyDocument(await snapshot(page)), 'workbench startup document');
  } catch (error) {
    const evidence = {
      browserName: page.context().browser()?.browserType().name(), errorName: error.name, reload,
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
    const recovered = await snapshot(page);
    assert.ok(readyDocument(recovered), 'recovered navigation document');
    assert.notEqual(recovered.documentId, evidence.documentState.documentId, 'recovered navigation must create a new document');
    assert.equal(recovered.modulePath, evidence.documentState.modulePath, 'recovered navigation module identity');
    assert.equal(recovered.stylesheets[0].path, evidence.documentState.stylesheets[0].path, 'recovered navigation stylesheet identity');
  } finally {
    for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
  }
}
