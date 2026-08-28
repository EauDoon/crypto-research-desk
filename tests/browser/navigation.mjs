import assert from 'node:assert/strict';
import { HASHED_ASSET } from '../../tools/web-config.mjs';

// Observed in CI with Playwright 1.62.1; see microsoft/playwright#42183.
export function isFirefoxStartupRace(evidence) {
  const { browserName, errorName, reload, documentState, events, responses, failures, pending, runtimeErrors } = evidence;
  if (browserName !== 'firefox' || errorName !== 'TimeoutError' || reload ||
      documentState.origin !== 'http://127.0.0.1:4173' || documentState.path !== '/' ||
      documentState.readyState !== 'complete' || documentState.symbol !== 'DEMO' || documentState.stylesheets !== 1 ||
      !events.includes('domcontentloaded') || !events.includes('load') ||
      failures.length || pending.length || runtimeErrors.length || responses.length !== 6 ||
      responses.some(response => response.status !== 200)) return false;
  const paths = new Set(responses.map(response => response.path));
  return paths.size === 6 && paths.has('/') &&
    ['app', 'packet', 'example', 'styles', 'favicon'].every(name =>
      [...paths].some(path => path.startsWith('/' + name + '.') && HASHED_ASSET.test(path.slice(1))));
}

async function snapshot(page) {
  let timer;
  try {
    return await Promise.race([
      page.evaluate(() => ({
        origin: location.origin, path: location.pathname, readyState: document.readyState,
        symbol: document.querySelector('#asset-symbol')?.textContent,
        stylesheets: document.styleSheets.length,
      })).catch(() => ({ unavailable: true })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ unavailable: true }), 1500); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function navigate(page, { reload = false } = {}) {
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
  } catch (error) {
    const evidence = {
      browserName: page.context().browser()?.browserType().name(), errorName: error.name, reload,
      documentState: await snapshot(page), events, responses, failures, runtimeErrors,
      pending: [...pending].map(request => new URL(request.url()).pathname),
    };
    console.warn('Navigation diagnostics: ' + JSON.stringify(evidence));
    if (!isFirefoxStartupRace(evidence)) throw error;
    // One fresh navigation releases this driver race. Reload tests and app failures stay fatal.
    console.warn('Recovering completed Firefox startup navigation once (microsoft/playwright#42183).');
    const response = await page.goto('/', { timeout: 10000 });
    assert.equal(response?.status(), 200, 'recovered workbench navigation status');
    assert.deepEqual(runtimeErrors, [], 'recovered navigation runtime errors');
    assert.deepEqual(failures, [], 'recovered navigation resource failures');
    assert.ok(responses.every(response => response.status === 200), 'recovered navigation resource statuses');
  } finally {
    for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
  }
}
