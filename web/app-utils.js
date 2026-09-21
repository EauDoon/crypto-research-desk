export const $ = id => document.getElementById(id);

export function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
export const display = value => value === null || value === undefined || value === '' ? 'UNKNOWN' : String(value);
export function setText(id, value) { $(id).textContent = display(value); }
export function announce(message, error = false) {
  const target = $(error ? 'app-error' : 'notice');
  if (error) $('notice').hidden = true;
  target.textContent = message;
  target.hidden = false;
}
export function issuesMessage(report) {
  const errorCount = report.errorCount ?? report.errors.length;
  const gapCount = report.gapCount ?? report.gaps.length;
  const omitted = Math.max(0, errorCount - report.errors.length);
  const lines = [errorCount + ' structural error' + (errorCount === 1 ? '' : 's')
    + ' and ' + gapCount + ' evidence gap' + (gapCount === 1 ? '' : 's') + '.'];
  lines.push(...report.errors.map(issue => issue.path + ': ' + issue.message));
  if (omitted) lines.push(omitted + ' additional issue' + (omitted === 1 ? '' : 's') + ' omitted.');
  return lines.join('\n');
}
export function validationError(report) {
  const error = new Error(issuesMessage(report));
  error.issuePaths = report.errors.map(issue => issue.path);
  return error;
}
export function validationSignature(report) {
  return JSON.stringify([
    report.valid, report.complete, report.chartEligible,
    report.errorCount, report.gapCount, report.warningCount,
    report.omittedIssueCounts, report.errors, report.gaps, report.warnings,
  ]);
}
export function supportsPageMarginIdentity() {
  try {
    return [...document.styleSheets].some(sheet => [...sheet.cssRules]
      .some(rule => rule.cssText.includes('@top-center') && rule.cssText.includes('attr(data-print-identity)')));
  } catch { return false; }
}
export function listInto(id, entries, emptyText) {
  $(id).replaceChildren(...(entries.length ? entries : [emptyText]).map(entry => element('li', entry)));
}
export function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
export function monitorHorizontalOverflow(scroll, hint) {
  let frame = 0;
  const update = () => {
    frame = 0;
    if (!scroll.isConnected) return;
    const overflowing = scroll.scrollWidth > scroll.clientWidth + 1;
    hint.hidden = !overflowing;
    scroll.classList.toggle('is-overflowing', overflowing);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(scroll);
  if (scroll.firstElementChild) observer?.observe(scroll.firstElementChild);
  schedule();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    observer?.disconnect();
  };
}
