import {
  MAX_PACKET_BYTES, MAX_JSON_INPUT_BYTES, HORIZONS, SCENARIOS, REVIEW_ASSERTIONS, parsePacket, validatePacket, blankPacket,
  timestamp, endAt, formatDate, formatPrice, safeSourceUrl, intervalLabel, returnLabel, chartThresholds, exportMarkdown,
} from './packet.js';
import { examplePacket } from './example.js';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'crypto-research-desk.packet.v1';
let packet = examplePacket();
let activeHorizon = '12h';
let origin = 'Synthetic example';
let dirty = false;
let editorMode = 'details';
let editorInitial = '';
let importSequence = 0;
let lastValidation = '';
let editorOpener = null;
let printDetailsState = null;
let unreadableSavedDraft = null;
let chartOverflowCleanup = () => {};
let scenarioOverflowCleanups = [];
const editor = $('packet-editor');
const form = $('details-form');
const reviewLabels = { pending: 'Pending review', deliver: 'Deliver, as recorded', deliver_with_warning: 'Deliver with warning, as recorded', repair: 'Repair required', withhold: 'Withhold' };
const methodLabels = { basis: 'Probability basis', description: 'Method', sourceWindow: 'Source window',
  observationFrequency: 'Observation frequency', sampleSize: 'Sample size', transformations: 'Transformations',
  regimeAdjustment: 'Regime adjustment', eventAssumptions: 'Event assumptions', limitations: 'Calibration and limits' };
const sourceFields = [
  ['id', 'Source ID', 'input', 40], ['title', 'Title', 'input', 200], ['url', 'Public HTTPS URL', 'input', 2048],
  ['type', 'Source type', 'select'], ['publishedAt', 'Published at (ISO, with offset)', 'input', 35],
  ['capturedAt', 'Captured at (ISO, with offset)', 'input', 35], ['claim', 'Supported claim', 'textarea', 5000],
  ['excerpt', 'Supplied excerpt', 'textarea', 5000],
];
const scenarioFields = [
  ['probability', 'Probability (%)'], ['confidence', 'Confidence'], ['driver', 'Driver'],
  ['trigger', 'Observable trigger'], ['invalidation', 'Scenario invalidation'],
];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}
const display = value => value === null || value === undefined || value === '' ? 'UNKNOWN' : String(value);
function setText(id, value) { $(id).textContent = display(value); }
function announce(message, error = false) {
  const target = $(error ? 'app-error' : 'notice');
  if (error) $('notice').hidden = true;
  target.textContent = message;
  target.hidden = false;
}
function issuesMessage(report) {
  const errorCount = report.errorCount ?? report.errors.length;
  const gapCount = report.gapCount ?? report.gaps.length;
  const omitted = Math.max(0, errorCount - report.errors.length);
  const lines = [errorCount + ' structural error' + (errorCount === 1 ? '' : 's')
    + ' and ' + gapCount + ' evidence gap' + (gapCount === 1 ? '' : 's') + '.'];
  lines.push(...report.errors.map(issue => issue.path + ': ' + issue.message));
  if (omitted) lines.push(omitted + ' additional issue' + (omitted === 1 ? '' : 's') + ' omitted.');
  return lines.join('\n');
}
function validationError(report) {
  const error = new Error(issuesMessage(report));
  error.issuePaths = report.errors.map(issue => issue.path);
  return error;
}
function validationSignature(report) {
  return JSON.stringify([
    report.valid, report.complete, report.chartEligible,
    report.errorCount, report.gapCount, report.warningCount,
    report.omittedIssueCounts, report.errors, report.gaps, report.warnings,
  ]);
}
function supportsPageMarginIdentity() {
  try {
    return [...document.styleSheets].some(sheet => [...sheet.cssRules]
      .some(rule => rule.cssText.includes('@top-center') && rule.cssText.includes('attr(data-print-identity)')));
  } catch { return false; }
}
function listInto(id, entries, emptyText) {
  $(id).replaceChildren(...(entries.length ? entries : [emptyText]).map(entry => element('li', entry)));
}
function svgNode(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function monitorHorizontalOverflow(scroll, hint) {
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
function renderChart(now) {
  const container = $('chart-area');
  chartOverflowCleanup();
  chartOverflowCleanup = () => {};
  container.replaceChildren();
  const thresholds = chartThresholds(packet, now);
  const synthetic = packet.kind === 'synthetic';
  setText('chart-badge', thresholds.length === 4 ? (synthetic ? 'SAMPLE THRESHOLDS' : 'SUBMITTED THRESHOLDS') : 'WITHHELD');
  $('chart-badge').className = 'tag ' + (synthetic || thresholds.length !== 4 ? 'amber' : 'teal');
  setText('chart-reference', (packet.asset.symbol || 'UNKNOWN') + ' · Reference ' + formatPrice(packet.reference.price)
    + ' ' + packet.asset.quoteCurrency + ' · ' + formatDate(packet.reference.capturedAt, packet.reference.timezone));
  if (thresholds.length !== 4) {
    const empty = element('div', undefined, 'chart-empty');
    empty.append(element('h3', 'Chart withheld'), element('p',
      'Complete the evidence, four forecast horizons, and manual review assertions first. Missing inputs stay UNKNOWN; unsupported forecasts stay INCOMPLETE.'));
    container.append(empty);
    return;
  }
  const values = [packet.reference.price, ...thresholds.flatMap(item => [item.bearBaseBoundary, item.baseBullBoundary])];
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const span = maximum - minimum || maximum || 1;
  const low = Math.max(0, minimum - span * .28), high = maximum + span * .28;
  const y = value => 310 - ((value - low) / (high - low)) * 240;
  const svg = svgNode('svg', { viewBox: '0 0 820 390', class: 'range-chart', role: 'img', 'aria-labelledby': 'plot-title plot-description' });
  svg.append(svgNode('title', { id: 'plot-title' }, 'Price target range by horizon'),
    svgNode('desc', { id: 'plot-description' }, (synthetic ? 'Fictional example. ' : 'Submitted review, not authenticated. ')
      + thresholds.map(item => item.id + ': bear ceiling ' + formatPrice(item.bearBaseBoundary)
        + ', bull floor ' + formatPrice(item.baseBullBoundary)).join('; ')
      + '. Reference ' + formatPrice(packet.reference.price) + ' ' + packet.asset.quoteCurrency + '.'));
  for (let index = 0; index <= 4; index++) {
    const value = low + ((high - low) * index / 4);
    const tick = value >= 10000
      ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }).format(value)
      : value > 0 && value < .01 ? value.toExponential(2) : String(Number(value.toPrecision(4)));
    svg.append(svgNode('line', { x1: 80, x2: 745, y1: y(value), y2: y(value), class: 'grid-line' }),
      svgNode('text', { x: 65, y: y(value) + 4, 'text-anchor': 'end' }, tick));
  }
  const referenceLabel = 'Current ' + formatPrice(packet.reference.price);
  const referenceAttributes = { x: 798, y: y(packet.reference.price) - 10, 'text-anchor': 'end', class: 'reference-label' };
  if (referenceLabel.length > 18) { referenceAttributes.textLength = 140; referenceAttributes.lengthAdjust = 'spacingAndGlyphs'; }
  svg.append(svgNode('text', { x: 65, y: 33, 'text-anchor': 'end' }, packet.asset.quoteCurrency),
    svgNode('line', { x1: 80, x2: 745, y1: y(packet.reference.price), y2: y(packet.reference.price), class: 'reference-line' }),
    svgNode('text', referenceAttributes, referenceLabel));
  thresholds.forEach((item, index) => {
    const x = 135 + index * 150;
    svg.append(svgNode('line', { x1: x, x2: x, y1: y(item.bearBaseBoundary), y2: y(item.baseBullBoundary), class: 'range-line' }),
      svgNode('circle', { cx: x, cy: y(item.baseBullBoundary), r: 6.5, class: 'bull-marker' }),
      svgNode('circle', { cx: x, cy: y(item.bearBaseBoundary), r: 6.5, class: 'bear-marker' }));
    for (const [label, value, offset, className] of [
      ['Bull floor', item.baseBullBoundary, -17, 'bull-label'],
      ['Bear ceiling', item.bearBaseBoundary, 25, 'bear-label'],
    ]) {
      const text = label + ' ' + formatPrice(value);
      const attributes = { x, y: y(value) + offset, 'text-anchor': 'middle', class: className };
      if (text.length > 18) { attributes.textLength = 140; attributes.lengthAdjust = 'spacingAndGlyphs'; }
      svg.append(svgNode('text', attributes, text));
    }
    svg.append(svgNode('text', { x, y: 350, 'text-anchor': 'middle', class: 'horizon-label' }, item.id));
  });
  svg.append(svgNode('text', { x: 400, y: 378, 'text-anchor': 'middle' }, 'Forecast horizon'));
  const scroll = element('div', undefined, 'chart-scroll');
  scroll.id = 'chart-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Forecast range chart. Scroll horizontally on narrow screens.');
  scroll.append(svg);
  const hint = element('p', 'Scroll horizontally to inspect all four horizons.', 'scroll-hint');
  hint.hidden = true;
  container.append(hint, scroll, element('p', synthetic
    ? 'Synthetic illustration. No real price, probability, source, or independent review is represented.'
    : 'The chart follows the submitted review record. This application does not authenticate that record.', 'small-copy'));
  chartOverflowCleanup = monitorHorizontalOverflow(scroll, hint);
}
function renderScenarios() {
  for (const cleanup of scenarioOverflowCleanups) cleanup();
  scenarioOverflowCleanups = [];
  $('horizon-tabs').replaceChildren();
  $('horizon-panels').replaceChildren();
  packet.horizons.forEach((horizon, index) => {
    const tab = element('button', HORIZONS[index].label, 'horizon-tab');
    tab.type = 'button';
    tab.id = 'tab-' + horizon.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', 'horizon-' + horizon.id);
    tab.setAttribute('aria-selected', String(activeHorizon === horizon.id));
    tab.tabIndex = activeHorizon === horizon.id ? 0 : -1;
    tab.dataset.horizon = horizon.id;
    tab.append(element('small', horizon.status === 'complete' ? '100% within horizon' : 'INCOMPLETE'));
    $('horizon-tabs').append(tab);
    const panel = element('div', undefined, 'horizon-panel');
    panel.id = 'horizon-' + horizon.id;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.tabIndex = 0;
    panel.hidden = activeHorizon !== horizon.id;
    panel.append(element('p', HORIZONS[index].label + ' · Ends ' + formatDate(horizon.endAt, packet.reference.timezone)));
    const expiry = element('p', 'ELAPSED. This is a historical scenario record. Refresh the inputs and obtain a new review.', 'notice');
    expiry.id = 'expiry-' + horizon.id; expiry.hidden = true; panel.append(expiry);
    if (horizon.status === 'incomplete') {
      const empty = element('div', undefined, 'chart-empty');
      empty.append(element('h3', 'INCOMPLETE'), element('p', horizon.gapReason));
      panel.append(empty);
    } else {
      const table = element('table');
      table.append(element('caption', HORIZONS[index].label + ' scenarios, ' + packet.asset.quoteCurrency + '. Supplied probabilities; no forecast accuracy is established.'));
      const head = element('thead'), header = element('tr');
      for (const name of ['Scenario', 'Price interval', 'Probability', 'Approx. implied return', 'Confidence']) {
        const th = element('th', name); th.scope = 'col'; header.append(th);
      }
      head.append(header); table.append(head);
      const body = element('tbody');
      for (const scenario of horizon.scenarios) {
        const row = element('tr'), name = element('th', scenario.label, 'scenario-name'); name.scope = 'row';
        const probability = element('td'), meter = element('progress');
        meter.max = 100; meter.value = scenario.probability;
        meter.setAttribute('aria-hidden', 'true');
        const probabilityValue = element('div', undefined, 'probability-cell');
        probabilityValue.append(element('span', scenario.probability + '%'), meter); probability.append(probabilityValue);
        row.append(name, element('td', intervalLabel(scenario)), probability,
          element('td', returnLabel(scenario, packet.reference.price)), element('td', scenario.confidence));
        body.append(row);
      }
      table.append(body);
      const scroll = element('div', undefined, 'table-scroll'); scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', HORIZONS[index].label + ' scenario table');
      scroll.append(table);
      const hint = element('p', 'Scroll horizontally to inspect every scenario field.', 'scroll-hint');
      hint.hidden = true;
      panel.append(hint, scroll);
      scenarioOverflowCleanups.push(monitorHorizontalOverflow(scroll, hint));
      const details = element('details', undefined, 'scenario-notes');
      details.append(element('summary', 'Drivers, triggers, and invalidation'));
      const grid = element('div', undefined, 'driver-grid');
      for (const scenario of horizon.scenarios) {
        const article = element('article'); article.append(element('h3', scenario.label));
        for (const [key, label] of [['driver', 'Key driver'], ['trigger', 'Observable trigger'], ['invalidation', 'Invalidation']]) {
          article.append(element('strong', label), element('p', scenario[key]));
        }
        grid.append(article);
      }
      details.append(grid); panel.append(details);
    }
    $('horizon-panels').append(panel);
  });
}
function refreshHorizonLabels(now = Date.now()) {
  for (const horizon of packet.horizons) {
    const ending = timestamp(horizon.endAt);
    const expired = packet.kind === 'research' && ending !== null && ending <= now;
    $('tab-' + horizon.id).querySelector('small').textContent = expired ? 'ELAPSED' : horizon.status === 'complete' ? '100% within horizon' : 'INCOMPLETE';
    $('expiry-' + horizon.id).hidden = !expired;
  }
}
function renderSources() {
  $('source-list').replaceChildren();
  setText('source-count', packet.sources.length + ' SOURCE RECORD' + (packet.sources.length === 1 ? '' : 'S'));
  if (!packet.sources.length) $('source-list').append(element('p', 'UNKNOWN. No source records have been supplied.', 'small-copy'));
  for (const [index, source] of packet.sources.entries()) {
    const article = element('article', undefined, 'source-item'), content = element('div');
    const heading = element('div', undefined, 'source-title');
    const sourceUrl = safeSourceUrl(source.url);
    const link = element('a', source.title + ' ↗');
    link.href = sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(element('span', ' (opens in a new tab)', 'visually-hidden'));
    const title = element('h3');
    title.id = 'source-heading-' + index;
    const printUrl = element('span', sourceUrl, 'print-source-url');
    printUrl.setAttribute('aria-hidden', 'true');
    title.append(link, printUrl);
    article.setAttribute('aria-labelledby', title.id);
    heading.append(title, element('span', source.type.toUpperCase(), 'tag'),
      element('span', new URL(sourceUrl).hostname, 'source-host'));
    const details = element('details'); details.append(element('summary', 'Supplied excerpt (' + source.id + ')'), element('blockquote', source.excerpt));
    content.append(heading, element('p', source.claim), details);
    const dates = element('dl', undefined, 'source-dates');
    for (const [key, label] of [['publishedAt', 'Published'], ['capturedAt', 'Captured']]) {
      const item = element('div'); item.append(element('dt', label), element('dd', formatDate(source[key]))); dates.append(item);
    }
    article.append(content, dates); $('source-list').append(article);
  }
}
function render(updateContent = true, now = Date.now()) {
  const report = validatePacket(packet, now);
  lastValidation = validationSignature(report);
  const synthetic = packet.kind === 'synthetic';
  setText('provenance-tag', synthetic ? 'SYNTHETIC EXAMPLE' : 'UNVERIFIED RESEARCH');
  setText('provenance-text', synthetic
    ? 'Fictional inputs and a fictional review. This is an interface example, not a market forecast.'
    : origin + '. Supplied evidence and review identity have not been authenticated. This app does not fetch live data.');
  setText('asset-symbol', packet.asset.symbol || 'NEW');
  setText('asset-name', packet.asset.name || 'Untitled research packet');
  const cutoff = timestamp(packet.reference.capturedAt);
  const printIdentity = 'RESEARCH ONLY · Provenance: ' + (synthetic ? 'SYNTHETIC EXAMPLE' : 'UNVERIFIED RESEARCH')
    + ' · Asset: ' + (packet.asset.symbol || 'NEW') + ' — ' + (packet.asset.name || 'Untitled research packet')
    + ' · Reference cutoff: ' + (cutoff === null ? 'UNKNOWN' : new Date(cutoff).toISOString());
  setText('print-identity', printIdentity);
  document.documentElement.dataset.printIdentity = printIdentity;
  setText('venue', packet.asset.venue);
  setText('reference-price', formatPrice(packet.reference.price) + ' ' + packet.asset.quoteCurrency);
  setText('reference-time', formatDate(packet.reference.capturedAt, packet.reference.timezone));
  setText('probability-basis', packet.method.basis);
  setText('thesis', packet.thesis); setText('countercase', packet.disconfirmingEvidence);
  setText('invalidation', packet.invalidation); setText('liquidity', packet.liquidity);
  setText('structure-status', report.complete ? 'Structure complete' : 'INCOMPLETE');
  const completed = packet.horizons.filter(horizon => horizon.status === 'complete').length;
  const checks = [
    [report.valid, 'Schema and ranges', 'Strict field, timestamp, and interval checks'],
    [completed === 4, completed + ' of 4 horizons supplied', 'Each complete horizon totals exactly 100%'],
    [packet.sources.length > 0, packet.sources.length + ' dated source records', 'Source contents remain unverified'],
    [report.chartEligible, report.chartEligible ? 'Review record supplied' : 'Chart remains withheld', 'No identity or approval authentication'],
  ];
  $('gate-checks').replaceChildren(...checks.map(([ok, title, detail]) => {
    const li = element('li'), icon = element('span', ok ? '✓' : '!', 'check-icon' + (ok ? '' : ' warning'));
    icon.setAttribute('aria-hidden', 'true');
    const text = element('div', title); text.append(element('small', detail)); li.append(icon, text); return li;
  }));
  const issues = [...report.errors, ...report.gaps];
  const issueTotal = report.errorCount + report.gapCount;
  const omitted = report.omittedIssueCounts.errors + report.omittedIssueCounts.gaps;
  const issueItems = issues.map(issue => issue.path + ': ' + issue.message);
  if (omitted) issueItems.push(omitted + ' additional issue' + (omitted === 1 ? '' : 's') + ' omitted. ('
    + report.omittedIssueCounts.errors + ' structural errors; ' + report.omittedIssueCounts.gaps + ' evidence gaps.)');
  setText('gap-summary', issueTotal ? issueTotal + ' issue' + (issueTotal === 1 ? '' : 's') + ' to resolve ('
    + report.errorCount + ' structural error' + (report.errorCount === 1 ? '' : 's') + ', '
    + report.gapCount + ' evidence gap' + (report.gapCount === 1 ? '' : 's') + ')' : 'What these checks do not prove');
  $('gap-details').open = issueTotal > 0;
  listInto('gap-list', issueItems,
    'A complete structure does not establish evidence truth, reliable probabilities, or an authentic independent review.');
  setText('review-status', reviewLabels[packet.riskReview.status]);
  setText('reviewer', packet.riskReview.reviewer);
  setText('reviewed-at', formatDate(packet.riskReview.reviewedAt));
  setText('review-notes', packet.riskReview.notes);
  $('assertion-record').replaceChildren(...packet.riskReview.assertions.map(assertion => {
    const div = element('div', undefined, 'assertion-summary');
    const label = REVIEW_ASSERTIONS.find(item => item.id === assertion.id).label;
    div.append(element('strong', label + ': ' + assertion.result), element('p', assertion.evidence || 'UNKNOWN'),
      element('p', 'Severity: ' + assertion.severity + '. Repair: ' + (assertion.repair || 'Not supplied.')));
    return div;
  }));
  listInto('risk-list', packet.risks, 'UNKNOWN. No major risks have been supplied.');
  listInto('unknown-list', packet.unknowns, 'No unknowns were supplied. That does not establish that none exist.');
  $('method-list').replaceChildren(...Object.entries(methodLabels).map(([key, label]) => {
    const div = element('div'); div.append(element('dt', label), element('dd', display(packet.method[key]))); return div;
  }));
  renderChart(now);
  if (updateContent) { renderScenarios(); renderSources(); }
  refreshHorizonLabels(now);
}
function saveLocally() {
  if (!$('remember-packet').checked) return;
  try {
    const serialized = JSON.stringify(packet);
    if (new TextEncoder().encode(serialized).length > MAX_PACKET_BYTES) throw new Error('Too large.');
    localStorage.setItem(STORAGE_KEY, serialized);
    $('app-error').hidden = true;
    setText('storage-status', 'Saved in this browser only. Shared-device users can access this draft. Export a separate backup.');
  } catch {
    $('remember-packet').checked = false;
    setText('storage-status', 'Saving failed. A previous draft may remain. Export the open packet and clear saved data when storage is available.');
    announce('Browser storage is unavailable or full. Your open packet is unchanged; export a backup.', true);
  }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
function reviewSignature(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(canonical(value));
  const normalized = {
    ...value,
    sourceIds: Array.isArray(value.sourceIds) ? [...value.sourceIds].sort() : value.sourceIds,
    assertions: Array.isArray(value.assertions)
      ? [...value.assertions].sort((left, right) => String(left?.id).localeCompare(String(right?.id)))
      : value.assertions,
  };
  return JSON.stringify(canonical(normalized));
}
function researchChanged(candidate) {
  const withoutReview = value => JSON.stringify(canonical(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'riskReview'))));
  return withoutReview(candidate) !== withoutReview(packet);
}
function applyPacket(candidate, label, localEdit = false) {
  let reviewReset = false;
  if (localEdit && researchChanged(candidate)) {
    if (reviewSignature(candidate.riskReview) !== reviewSignature(packet.riskReview)) {
      const error = new Error('Save research input changes separately from a new review. The current packet is unchanged; your editor contents are preserved.');
      error.issuePaths = ['riskReview.status'];
      throw error;
    }
    const emptyReview = blankPacket().riskReview;
    reviewReset = reviewSignature(candidate.riskReview) !== reviewSignature(emptyReview);
    candidate.riskReview = emptyReview;
  }
  const now = Date.now();
  const report = validatePacket(candidate, now);
  if (!report.valid) throw validationError(report);
  importSequence++;
  $('app-error').hidden = true;
  dirty = localEdit ? dirty || JSON.stringify(canonical(candidate)) !== JSON.stringify(canonical(packet)) : false;
  packet = candidate; origin = label;
  render(true, now); saveLocally();
  return { reviewReset, report };
}
function confirmReplacement() {
  const current = JSON.stringify(canonical(packet));
  const meaningful = dirty || $('remember-packet').checked || (current !== JSON.stringify(canonical(blankPacket()))
    && current !== JSON.stringify(canonical(examplePacket())));
  return !meaningful || window.confirm('Replace the open research packet? Export a copy first if you need to keep it.');
}
function field(name) { return form.elements.namedItem(name); }
function editableFieldForPath(path) {
  const fields = {
    'asset.symbol': 'symbol', 'asset.name': 'name', 'asset.quoteCurrency': 'quoteCurrency', 'asset.venue': 'venue',
    'reference.price': 'price', 'reference.capturedAt': 'capturedAt', 'reference.timezone': 'timezone',
    preparedBy: 'preparedBy', thesis: 'thesis', disconfirmingEvidence: 'disconfirmingEvidence',
    invalidation: 'invalidation', liquidity: 'liquidity',
    'riskReview.status': 'reviewStatus', 'riskReview.reviewer': 'reviewer',
    'riskReview.reviewedAt': 'reviewedAt', 'riskReview.sourceIds': 'sourceIds', 'riskReview.notes': 'reviewNotes',
  };
  if (fields[path]) return field(fields[path]);
  const method = /^method\.(\w+)$/.exec(path);
  if (method) return field('method-' + method[1]);
  const source = /^sources(?:\[(\d+)\])?(?:\.(\w+))?$/.exec(path);
  if (source) return source[1] === undefined ? $('add-source')
    : field('source-' + source[1] + '-' + (source[2] ?? 'id'));
  const horizon = /^horizons(?:\[(\d+)\])?(?:\.(status|gapReason|endAt))?$/.exec(path);
  if (horizon) return horizon[2] === 'endAt' ? field('capturedAt')
    : field('horizon-' + (horizon[1] ?? '0') + '-' + (horizon[2] ?? 'status'));
  const scenario = /^horizons\[(\d+)\]\.scenarios(?:\[(\d+)\])?(?:\.(\w+))?$/.exec(path);
  if (scenario) {
    const [horizonIndex, scenarioIndex = '0', key = 'probability'] = scenario.slice(1);
    if (key === 'lower' || key === 'upper') {
      const threshold = scenarioIndex === '0' || (scenarioIndex === '1' && key === 'lower') ? 'bearCeiling' : 'bullFloor';
      return field('horizon-' + horizonIndex + '-' + threshold);
    }
    return field('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-' + key);
  }
  if (/^risks(?:\[|$)/.test(path)) return field('risks');
  if (/^unknowns(?:\[|$)/.test(path)) return field('unknowns');
  if (path === 'asset') return field('symbol');
  if (path === 'reference') return field('price');
  if (path === 'riskReview') return field('reviewStatus');
  const assertion = /^riskReview\.assertions(?:\[(\d+)\])?(?:\.(result|evidence|severity|repair))?$/.exec(path);
  if (assertion) return field('assertion-' + (assertion[1] ?? '0') + '-' + (assertion[2] ?? 'result'));
  return null;
}
function clearInvalidMarker(target) {
  target.removeAttribute('aria-invalid');
  const describedBy = (target.getAttribute('aria-describedby') || '').split(/\s+/)
    .filter(id => id && id !== 'editor-error');
  if (describedBy.length) target.setAttribute('aria-describedby', describedBy.join(' '));
  else target.removeAttribute('aria-describedby');
}
function clearEditorError() {
  for (const target of editor.querySelectorAll('[aria-invalid="true"]')) clearInvalidMarker(target);
  $('editor-error').textContent = '';
  $('editor-error').hidden = true;
}
function markInvalid(target) {
  target.setAttribute('aria-invalid', 'true');
  const describedBy = new Set((target.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  describedBy.add('editor-error');
  target.setAttribute('aria-describedby', [...describedBy].join(' '));
}
function sourceEditorValues() {
  return [...$('source-editor-list').children].map((_, index) => Object.fromEntries(
    sourceFields.map(([key]) => [key, String(field('source-' + index + '-' + key).value)]),
  ));
}
function renderSourceEditor(sources) {
  $('source-editor-empty').hidden = sources.length > 0;
  $('source-editor-list').replaceChildren(...sources.map((source, index) => {
    const group = element('fieldset', undefined, 'source-editor');
    group.append(element('legend', 'Source ' + (index + 1)));
    const remove = element('button', 'Remove source', 'button small subtle');
    remove.type = 'button'; remove.dataset.removeSource = String(index);
    remove.setAttribute('aria-label', 'Remove source ' + (index + 1));
    const grid = element('div', undefined, 'form-grid');
    for (const [key, label, tag, limit] of sourceFields) {
      const wrapper = element('label', label);
      if (key === 'claim' || key === 'excerpt') wrapper.className = 'span-two';
      const input = element(tag);
      input.name = 'source-' + index + '-' + key;
      if (key === 'type') for (const option of ['primary', 'secondary']) input.append(element('option', option));
      else {
        if (key === 'url') input.type = 'url';
        input.maxLength = limit;
        if (tag === 'textarea') input.rows = 2;
      }
      input.value = source[key] ?? '';
      wrapper.append(input); grid.append(wrapper);
    }
    group.append(remove, grid); return group;
  }));
  $('add-source').disabled = sources.length >= 32;
}
function showHorizonMode(details, complete) {
  details.querySelector('.horizon-gap').hidden = complete;
  details.querySelector('.horizon-scenarios').hidden = !complete;
  for (const control of details.querySelectorAll('.horizon-gap input, .horizon-gap textarea, .horizon-gap select')) control.disabled = complete;
  for (const control of details.querySelectorAll('.horizon-scenarios input, .horizon-scenarios textarea, .horizon-scenarios select')) control.disabled = !complete;
  details.querySelector('summary').textContent = details.dataset.label + ' · ' + (complete ? 'Complete' : 'Incomplete');
}
function renderHorizonEditor(horizons) {
  $('horizon-editor-list').replaceChildren(...HORIZONS.map((definition, horizonIndex) => {
    const horizon = horizons[horizonIndex];
    const details = element('details', undefined, 'horizon-editor');
    details.dataset.label = definition.label; details.open = horizonIndex === 0;
    details.append(element('summary'));
    const body = element('div', undefined, 'horizon-editor-body');
    const statusLabel = element('label', 'Forecast status');
    const status = element('select'); status.name = 'horizon-' + horizonIndex + '-status';
    for (const option of ['incomplete', 'complete']) status.append(element('option', option));
    status.value = horizon.status; statusLabel.append(status);
    const statusGrid = element('div', undefined, 'form-grid'); statusGrid.append(statusLabel);
    body.append(statusGrid);

    const gap = element('div', undefined, 'horizon-gap form-grid');
    const gapLabel = element('label', 'Evidence gap reason', 'span-two');
    const gapInput = element('textarea'); gapInput.name = 'horizon-' + horizonIndex + '-gapReason';
    gapInput.rows = 2; gapInput.maxLength = 5000; gapInput.value = horizon.gapReason;
    gapLabel.append(gapInput); gap.append(gapLabel); body.append(gap);

    const complete = element('div', undefined, 'horizon-scenarios');
    const thresholds = element('div', undefined, 'form-grid');
    for (const [key, label, value] of [
      ['bearCeiling', 'Bear ceiling / Base floor', horizon.scenarios[0]?.upper],
      ['bullFloor', 'Base ceiling / Bull floor', horizon.scenarios[1]?.upper],
    ]) {
      const wrapper = element('label', label); const input = element('input');
      input.name = 'horizon-' + horizonIndex + '-' + key; input.type = 'number'; input.step = 'any'; input.min = '0'; input.max = '1000000000000';
      input.value = value ?? ''; wrapper.append(input); thresholds.append(wrapper);
    }
    complete.append(element('p', 'Intervals are derived as [0, Bear ceiling), [Bear ceiling, Bull floor), and [Bull floor, unbounded).', 'small-copy'), thresholds);
    SCENARIOS.forEach((label, scenarioIndex) => {
      const scenario = horizon.scenarios[scenarioIndex] ?? { probability: '', confidence: 'low', driver: '', trigger: '', invalidation: '' };
      const group = element('fieldset', undefined, 'scenario-editor'); group.append(element('legend', label));
      const grid = element('div', undefined, 'form-grid');
      for (const [key, fieldLabel] of scenarioFields) {
        const wrapper = element('label', fieldLabel); const input = element(key === 'confidence' ? 'select' : key === 'probability' ? 'input' : 'textarea');
        input.name = 'horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-' + key;
        if (key === 'confidence') for (const option of ['low', 'medium', 'high']) input.append(element('option', option));
        else if (key === 'probability') { input.type = 'number'; input.min = '0'; input.max = '100'; input.step = '0.01'; }
        else { input.rows = 2; input.maxLength = 5000; wrapper.className = 'span-two'; }
        input.value = scenario[key] ?? ''; wrapper.append(input); grid.append(wrapper);
      }
      group.append(grid); complete.append(group);
    });
    body.append(complete); details.append(body);
    showHorizonMode(details, horizon.status === 'complete');
    return details;
  }));
}
function populateForm() {
  const values = { ...packet.asset, ...packet.reference, preparedBy: packet.preparedBy,
    thesis: packet.thesis, disconfirmingEvidence: packet.disconfirmingEvidence, invalidation: packet.invalidation,
    liquidity: packet.liquidity, risks: packet.risks.join('\n'), unknowns: packet.unknowns.join('\n'),
    reviewStatus: packet.riskReview.status, reviewer: packet.riskReview.reviewer,
    reviewedAt: packet.riskReview.reviewedAt, sourceIds: packet.riskReview.sourceIds.join(', '), reviewNotes: packet.riskReview.notes };
  for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value ?? '';
  for (const [key, value] of Object.entries(packet.method)) field('method-' + key).value = value ?? '';
  renderSourceEditor(packet.sources);
  renderHorizonEditor(packet.horizons);
  $('review-assertions').replaceChildren();
  REVIEW_ASSERTIONS.forEach((definition, index) => {
    const assertion = packet.riskReview.assertions.find(item => item.id === definition.id)
      ?? { result: 'UNKNOWN', evidence: '', severity: 'high', repair: '' };
    const group = element('fieldset'); group.append(element('legend', definition.label));
    const grid = element('div', undefined, 'form-grid');
    for (const [key, label, options] of [
      ['result', 'Result', ['UNKNOWN', 'PASS', 'WARN', 'FAIL']],
      ['severity', 'Severity', ['low', 'medium', 'high']],
      ['evidence', 'Review evidence', null], ['repair', 'Repair or remaining work', null],
    ]) {
      const wrapper = element('label', label);
      const input = element(options ? 'select' : 'textarea');
      input.name = 'assertion-' + index + '-' + key;
      if (options) for (const option of options) input.append(element('option', option));
      else { input.rows = 2; input.maxLength = 5000; }
      input.value = assertion[key]; wrapper.append(input); grid.append(wrapper);
    }
    group.append(grid); $('review-assertions').append(group);
  });
}
function editorSnapshot() {
  return editorMode === 'json' ? $('packet-json').value : JSON.stringify([...new FormData(form).entries()]);
}
function revealEditorTarget(target) {
  target.closest('details')?.setAttribute('open', '');
  const scrollBounds = $('editor-scroll').getBoundingClientRect();
  const targetBounds = target.getBoundingClientRect();
  const errorHeight = $('editor-error').hidden ? 0 : $('editor-error').getBoundingClientRect().height + 8;
  const visibleTop = scrollBounds.top + errorHeight;
  if (targetBounds.top < visibleTop
    || targetBounds.top + Math.min(targetBounds.height, 44) > scrollBounds.bottom) {
    $('editor-scroll').scrollTop += targetBounds.top - visibleTop;
  }
}
function openEditor(mode) {
  importSequence++;
  editorOpener = document.activeElement;
  editorMode = mode;
  clearEditorError();
  $('details-form').hidden = mode === 'json'; $('json-editor-panel').hidden = mode !== 'json';
  $('details-actions').hidden = mode === 'json'; $('json-actions').hidden = mode !== 'json';
  setText('editor-heading', mode === 'json' ? 'Edit full research packet' : 'Edit research details');
  setText('editor-help', mode === 'json'
    ? 'Schema version 1. No credentials or confidential data. All content is treated as data. Local changes to research inputs reset the review record.'
    : 'Unknown fields may remain empty. Editing research inputs resets the review. Save inputs before recording a new independent review.');
  if (mode === 'json') $('packet-json').value = JSON.stringify(packet, null, 2);
  else populateForm();
  editorInitial = editorSnapshot();
  const target = mode === 'json' ? $('packet-json') : field('symbol');
  if (mode === 'json') { target.setSelectionRange(0, 0); target.scrollTop = 0; target.scrollLeft = 0; }
  editor.showModal();
  $('editor-scroll').scrollTop = 0;
  target.focus({ preventScroll: true });
  if (mode === 'json') { target.setSelectionRange(0, 0); target.scrollTop = 0; target.scrollLeft = 0; }
  revealEditorTarget(target);
}
function closeEditor(event) {
  event?.preventDefault();
  if (editorSnapshot() !== editorInitial && !window.confirm('Discard the unapplied editor changes?')) { event?.preventDefault(); return; }
  editor.close();
}
function editorError(error, explicitTarget = null) {
  clearEditorError();
  $('editor-error').textContent = error.message;
  $('editor-error').hidden = false;
  const paths = Array.isArray(error.issuePaths) ? error.issuePaths : error.issuePath ? [error.issuePath] : [];
  const target = explicitTarget ?? (editorMode === 'json' ? $('packet-json') : paths.map(editableFieldForPath).find(Boolean));
  if (target) {
    markInvalid(target);
    target.focus({ preventScroll: true });
    revealEditorTarget(target);
  } else {
    $('editor-error').focus({ preventScroll: true });
    $('editor-error').scrollIntoView({ block: 'nearest' });
  }
}
function completeEdit(candidate) {
  const { reviewReset } = applyPacket(candidate, 'Local draft', true);
  editor.close();
  announce(reviewReset ? 'Research inputs changed. The previous review was reset to pending; record a new independent review before chart display.'
    : 'Packet updated. Structural checks are current; evidence and review identity remain unverified.');
}
function download(contents, type, suffix, filename = null) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = element('a');
  const instant = timestamp(packet.reference.capturedAt);
  const label = instant === null ? 'Undated' : packet.reference.capturedAt.slice(0, 10);
  anchor.href = url;
  anchor.download = filename ?? '(' + label + ')' + (packet.asset.symbol ? packet.asset.symbol + ' ' : '') + suffix;
  anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

$('load-demo').addEventListener('click', () => {
  if (!confirmReplacement()) return;
  applyPacket(examplePacket(), 'Synthetic example');
  announce('Synthetic example loaded. Every price, probability, source, and review is fictional.');
});
$('new-packet').addEventListener('click', () => {
  if (!confirmReplacement()) return;
  applyPacket(blankPacket(), 'Local draft');
  announce('Blank research packet created. Unsupported forecasts remain incomplete.');
  openEditor('details');
});
$('import-packet').addEventListener('click', () => $('packet-file').click());
$('packet-file').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  const sequence = ++importSequence;
  if (!file) return;
  try {
    if (file.size > MAX_JSON_INPUT_BYTES) throw new Error('The JSON file must be no larger than 320 KiB.');
    let imported;
    try { imported = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error('The packet must be valid UTF-8 JSON without replacement-decoded bytes.'); }
    const candidate = parsePacket(imported);
    const report = validatePacket(candidate);
    if (!report.valid) throw validationError(report);
    if (sequence !== importSequence || !confirmReplacement()) return;
    const applied = applyPacket(candidate, 'Imported packet');
    announce('Packet imported locally. No research data was sent to a server. ' + (applied.report.complete ? 'Structure is complete.' : 'Review the listed data gaps.'));
  } catch (error) { if (sequence === importSequence) announce(error.message, true); }
  finally { event.target.value = ''; }
});
$('edit-details').addEventListener('click', () => openEditor('details'));
$('edit-json').addEventListener('click', () => openEditor('json'));
$('add-source').addEventListener('click', () => {
  const sources = sourceEditorValues();
  if (sources.length >= 32) return;
  sources.push({ id: '', title: '', url: '', type: 'primary', publishedAt: '', capturedAt: '', claim: '', excerpt: '' });
  clearEditorError(); renderSourceEditor(sources);
  field('source-' + (sources.length - 1) + '-id').focus();
});
$('source-editor-list').addEventListener('click', event => {
  const remove = event.target.closest('button[data-remove-source]');
  if (!remove) return;
  const sources = sourceEditorValues();
  sources.splice(Number(remove.dataset.removeSource), 1);
  clearEditorError(); renderSourceEditor(sources);
  (sources.length ? field('source-' + Math.min(Number(remove.dataset.removeSource), sources.length - 1) + '-id') : $('add-source')).focus();
});
$('horizon-editor-list').addEventListener('change', event => {
  if (!event.target.name?.endsWith('-status')) return;
  clearEditorError();
  showHorizonMode(event.target.closest('details'), event.target.value === 'complete');
});
$('close-editor').addEventListener('click', closeEditor);
editor.addEventListener('cancel', closeEditor);
editor.addEventListener('close', () => { if (editorOpener?.isConnected) editorOpener.focus({ preventScroll: true }); });
editor.addEventListener('input', event => { if (event.target.matches?.('[aria-invalid="true"]')) clearEditorError(); });
editor.addEventListener('change', event => { if (event.target.matches?.('[aria-invalid="true"]')) clearEditorError(); });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (editorSnapshot() === editorInitial) { editor.close(); announce('No changes were made.'); return; }
  try {
    const candidate = structuredClone(packet);
    const value = name => String(field(name).value);
    const number = (name, path) => {
      if (value(name) === '') return null;
      try { return parsePacket('{"value":' + value(name) + '}').value; }
      catch (error) { error.issuePaths = [path]; throw error; }
    };
    for (const name of ['symbol', 'name', 'quoteCurrency', 'venue']) candidate.asset[name] = value(name);
    candidate.reference = { price: number('price', 'reference.price'), capturedAt: value('capturedAt'), timezone: value('timezone') };
    for (const name of ['preparedBy', 'thesis', 'disconfirmingEvidence', 'invalidation', 'liquidity']) candidate[name] = value(name);
    candidate.method = Object.fromEntries(Object.keys(methodLabels).map(key => [key, value('method-' + key)]));
    candidate.method.sampleSize = number('method-sampleSize', 'method.sampleSize');
    candidate.sources = sourceEditorValues();
    candidate.horizons = HORIZONS.map((definition, horizonIndex) => {
      const status = value('horizon-' + horizonIndex + '-status');
      const horizon = { id: definition.id, endAt: candidate.reference.capturedAt === packet.reference.capturedAt
        ? packet.horizons[horizonIndex].endAt : endAt(candidate.reference.capturedAt, definition.hours), status,
        gapReason: status === 'incomplete' ? value('horizon-' + horizonIndex + '-gapReason') : '', scenarios: [] };
      if (status === 'complete') {
        const bearCeiling = number('horizon-' + horizonIndex + '-bearCeiling', 'horizons[' + horizonIndex + '].scenarios[0].upper');
        const bullFloor = number('horizon-' + horizonIndex + '-bullFloor', 'horizons[' + horizonIndex + '].scenarios[1].upper');
        horizon.scenarios = SCENARIOS.map((label, scenarioIndex) => ({
          label, lower: [0, bearCeiling, bullFloor][scenarioIndex], upper: [bearCeiling, bullFloor, null][scenarioIndex],
          probability: number('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-probability',
            'horizons[' + horizonIndex + '].scenarios[' + scenarioIndex + '].probability'),
          driver: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-driver'),
          trigger: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-trigger'),
          invalidation: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-invalidation'),
          confidence: value('horizon-' + horizonIndex + '-scenario-' + scenarioIndex + '-confidence'),
        }));
      }
      return horizon;
    });
    for (const name of ['risks', 'unknowns']) {
      if (value(name) !== packet[name].join('\n')) {
        if (packet[name].some(item => /[\r\n]/.test(item))) {
          const error = new Error('The existing ' + name + ' list contains a multiline entry. Edit that list in the full packet editor to preserve its structure.');
          error.issuePaths = [name];
          throw error;
        }
        candidate[name] = value(name).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
      }
    }
    candidate.riskReview = {
      status: value('reviewStatus'), reviewer: value('reviewer'), reviewedAt: value('reviewedAt'),
      notes: value('reviewNotes'), sourceIds: value('sourceIds').split(',').map(item => item.trim()).filter(Boolean),
      assertions: REVIEW_ASSERTIONS.map((definition, index) => ({
        id: definition.id, ...Object.fromEntries(['result', 'evidence', 'severity', 'repair'].map(key => [key, value('assertion-' + index + '-' + key)])),
      })),
    };
    completeEdit(candidate);
  } catch (error) { editorError(error); }
});
$('apply-json').addEventListener('click', () => {
  try { completeEdit(parsePacket($('packet-json').value)); } catch (error) { editorError(error, $('packet-json')); }
});
$('export-json').addEventListener('click', () => {
  download(JSON.stringify(packet, null, 2) + '\n', 'application/json', 'Research Packet.json');
  announce('JSON export prepared. Keep the downloaded file as your portable research record.');
});
$('export-brief').addEventListener('click', () => {
  try {
    download(exportMarkdown(packet), 'text/markdown; charset=utf-8', 'Research Brief.md');
    announce('Brief export prepared, including unresolved gaps. Use Print / PDF for the chart.');
  } catch (error) { announce(error.message, true); }
});
window.addEventListener('beforeprint', () => {
  if (printDetailsState) return;
  printDetailsState = [...document.querySelectorAll('details')].map(node => [node, node.open]);
  render(false);
  for (const [node] of printDetailsState) node.open = true;
});
window.addEventListener('afterprint', () => {
  if (!printDetailsState) return;
  for (const [node, open] of printDetailsState) if (node.isConnected) node.open = open;
  printDetailsState = null;
});
$('print-packet').addEventListener('click', () => window.print());
$('remember-packet').addEventListener('change', () => {
  if ($('remember-packet').checked) saveLocally();
  else {
    try {
      const hadSavedDraft = localStorage.getItem(STORAGE_KEY) !== null;
      localStorage.removeItem(STORAGE_KEY);
      if (hadSavedDraft) dirty = true;
      setText('storage-status', hadSavedDraft
        ? 'Saved draft removed. The open packet is still in memory; export it before closing.'
        : 'No saved draft was present. The open packet is unchanged.');
    } catch {
      $('remember-packet').checked = true;
      announce('Saved draft removal failed. Storage is unavailable; a previous draft may remain.', true);
    }
  }
});
$('recover-saved').addEventListener('click', () => {
  if (unreadableSavedDraft === null) return;
  download(JSON.stringify({ storageKey: STORAGE_KEY, rawValue: unreadableSavedDraft }, null, 2) + '\n',
    'application/json; charset=utf-8', '', 'Unparsed Saved Research Draft.json');
  announce('A recovery wrapper containing the raw saved value was downloaded without changing browser storage. Treat it as untrusted data.');
});
$('clear-saved').addEventListener('click', () => {
  const prompt = unreadableSavedDraft === null ? 'Remove this app’s saved browser draft? The open packet will stay in memory.'
    : 'Permanently remove the unreadable saved draft? Download its raw data first if you may need to recover it.';
  if (!window.confirm(prompt)) return;
  try {
    const openPacketWasRemembered = $('remember-packet').checked;
    const hadSavedDraft = localStorage.getItem(STORAGE_KEY) !== null;
    localStorage.removeItem(STORAGE_KEY);
    unreadableSavedDraft = null;
    if (openPacketWasRemembered) dirty = true;
    $('remember-packet').checked = false;
    $('remember-packet').disabled = false;
    $('recover-saved').hidden = true;
    $('app-error').hidden = true;
    setText('storage-status', hadSavedDraft
      ? 'Saved draft removed. The open packet remains in memory. Other browser storage was not changed.'
      : 'No saved draft was present. The open packet and other browser storage were not changed.');
    announce(hadSavedDraft
      ? 'This app’s saved draft was removed. Export the open packet if you need a backup.'
      : 'There was no saved draft to remove. The open packet is unchanged.');
  } catch { announce('Saved draft removal failed. A previous draft may remain; check browser storage settings.', true); }
});
window.addEventListener('resize', () => {
  if (!editor.open) return;
  requestAnimationFrame(() => {
    const target = editorMode === 'json' ? $('packet-json') : document.activeElement;
    if (target instanceof HTMLElement && $('editor-scroll').contains(target)) revealEditorTarget(target);
  });
});
function selectHorizon(id, focus = false) {
  activeHorizon = id;
  const now = refreshExpiry();
  renderScenarios(); refreshHorizonLabels(now);
  if (focus) $('tab-' + id).focus();
}
$('horizon-tabs').addEventListener('click', event => {
  const tab = event.target.closest('button[data-horizon]');
  if (tab) selectHorizon(tab.dataset.horizon, true);
});
$('horizon-tabs').addEventListener('keydown', event => {
  const index = HORIZONS.findIndex(item => item.id === activeHorizon);
  const next = { ArrowRight: (index + 1) % 4, ArrowLeft: (index + 3) % 4, Home: 0, End: 3 }[event.key];
  if (next !== undefined) { event.preventDefault(); selectHorizon(HORIZONS[next].id, true); }
});
function updateNavigation() {
  const hash = window.location.hash || '#workspace';
  for (const link of document.querySelectorAll('.sidebar nav a')) {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}
window.addEventListener('hashchange', updateNavigation);
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  dirty = true;
  $('remember-packet').checked = false;
  $('remember-packet').disabled = true;
  $('clear-saved').disabled = true;
  setText('storage-status', 'Browser storage changed in another tab. Saving and clearing are locked until reload.');
  announce('Another tab changed the saved draft. Your open packet is unchanged. Export it, then reload before saving or clearing.');
});
window.addEventListener('beforeunload', event => {
  if ((dirty && !$('remember-packet').checked) || (editor.open && editorSnapshot() !== editorInitial)) {
    event.preventDefault(); event.returnValue = '';
  }
});
try {
  unreadableSavedDraft = localStorage.getItem(STORAGE_KEY);
  const saved = unreadableSavedDraft;
  if (saved !== null) {
    const candidate = parsePacket(saved);
    if (!validatePacket(candidate).valid) throw new Error('Invalid saved packet.');
    packet = candidate; origin = 'Restored browser draft'; $('remember-packet').checked = true;
    setText('storage-status', 'Restored from this browser. Shared-device users can access the saved draft.');
    unreadableSavedDraft = null;
  }
} catch {
  $('remember-packet').disabled = true;
  $('recover-saved').hidden = unreadableSavedDraft === null;
  setText('storage-status', unreadableSavedDraft === null
    ? 'Browser storage is unavailable. Local saving is disabled.'
    : 'Saving is locked to protect the unreadable draft. Download its raw data before clearing it.');
  announce('The saved draft could not be loaded. It was not deleted or overwritten. A synthetic example is shown; local saving is locked.', true);
}
render(); updateNavigation();
document.documentElement.classList.toggle('page-margin-identity', supportsPageMarginIdentity());
$('startup-status').hidden = true;
document.documentElement.classList.remove('app-unavailable');
function refreshExpiry() {
  const now = Date.now();
  if (document.visibilityState !== 'visible') return now;
  const report = validatePacket(packet, now);
  if (lastValidation === validationSignature(report)) return now;
  const activeId = document.activeElement?.id;
  // Keep scenario controls and open editor fields intact when only time has changed.
  render(false, now);
  const focusTarget = activeId ? $(activeId) ?? (activeId === 'chart-scroll' ? $('chart-heading') : null) : null;
  focusTarget?.focus({ preventScroll: true });
  announce('Time-sensitive checks changed. Review the current gaps before using or exporting this packet.');
  return now;
}
setInterval(refreshExpiry, 60000);
document.addEventListener('visibilitychange', refreshExpiry);
