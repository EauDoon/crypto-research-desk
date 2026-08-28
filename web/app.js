import {
  MAX_PACKET_BYTES, HORIZONS, REVIEW_ASSERTIONS, parsePacket, validatePacket, blankPacket,
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
const editor = $('packet-editor');
const form = $('details-form');
const reviewLabels = { pending: 'Pending review', deliver: 'Deliver, as recorded', deliver_with_warning: 'Deliver with warning, as recorded', repair: 'Repair required', withhold: 'Withhold' };
const methodLabels = { basis: 'Probability basis', description: 'Method', sourceWindow: 'Source window',
  observationFrequency: 'Observation frequency', sampleSize: 'Sample size', transformations: 'Transformations',
  regimeAdjustment: 'Regime adjustment', eventAssumptions: 'Event assumptions', limitations: 'Calibration and limits' };

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
  return report.errors.map(issue => issue.path + ': ' + issue.message).join('\n');
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
function renderChart(report) {
  const container = $('chart-area');
  container.replaceChildren();
  const thresholds = chartThresholds(packet);
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
  const values = [packet.reference.price, ...thresholds.flatMap(item => [item.bear, item.bull])];
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const span = maximum - minimum || maximum || 1;
  const low = Math.max(0, minimum - span * .28), high = maximum + span * .28;
  const y = value => 310 - ((value - low) / (high - low)) * 240;
  const svg = svgNode('svg', { viewBox: '0 0 820 390', class: 'range-chart', role: 'img', 'aria-labelledby': 'plot-title plot-description' });
  svg.append(svgNode('title', { id: 'plot-title' }, 'Price target range by horizon'),
    svgNode('desc', { id: 'plot-description' }, (synthetic ? 'Fictional example. ' : 'Submitted review, not authenticated. ')
      + thresholds.map(item => item.id + ': bear ' + formatPrice(item.bear) + ', bull ' + formatPrice(item.bull)).join('; ')
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
    svg.append(svgNode('line', { x1: x, x2: x, y1: y(item.bear), y2: y(item.bull), class: 'range-line' }),
      svgNode('circle', { cx: x, cy: y(item.bull), r: 6.5, class: 'bull-marker' }),
      svgNode('circle', { cx: x, cy: y(item.bear), r: 6.5, class: 'bear-marker' }));
    for (const [label, value, offset, className] of [['Bull', item.bull, -17, 'bull-label'], ['Bear', item.bear, 25, 'bear-label']]) {
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
  container.append(scroll, element('p', synthetic
    ? 'Synthetic illustration. No real price, probability, source, or independent review is represented.'
    : 'The chart follows the submitted review record. This application does not authenticate that record.', 'small-copy'));
}
function renderScenarios() {
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
        meter.setAttribute('aria-label', scenario.label + ' probability');
        const probabilityValue = element('div', undefined, 'probability-cell');
        probabilityValue.append(element('span', scenario.probability + '%'), meter); probability.append(probabilityValue);
        row.append(name, element('td', intervalLabel(scenario)), probability,
          element('td', returnLabel(scenario, packet.reference.price)), element('td', scenario.confidence));
        body.append(row);
      }
      table.append(body);
      const scroll = element('div', undefined, 'table-scroll'); scroll.tabIndex = 0;
      scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', HORIZONS[index].label + ' scenario table');
      scroll.append(table); panel.append(scroll);
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
function refreshHorizonLabels() {
  for (const horizon of packet.horizons) {
    const ending = timestamp(horizon.endAt);
    const expired = packet.kind === 'research' && ending !== null && ending <= Date.now();
    $('tab-' + horizon.id).querySelector('small').textContent = expired ? 'ELAPSED' : horizon.status === 'complete' ? '100% within horizon' : 'INCOMPLETE';
    $('expiry-' + horizon.id).hidden = !expired;
  }
}
function renderSources() {
  $('source-list').replaceChildren();
  setText('source-count', packet.sources.length + ' SOURCE RECORD' + (packet.sources.length === 1 ? '' : 'S'));
  if (!packet.sources.length) $('source-list').append(element('p', 'UNKNOWN. No source records have been supplied.', 'small-copy'));
  for (const source of packet.sources) {
    const article = element('article', undefined, 'source-item'), content = element('div');
    const heading = element('div', undefined, 'source-title');
    const link = element('a', source.title + ' ↗');
    link.href = safeSourceUrl(source.url); link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.append(element('span', ' (opens in a new tab)', 'visually-hidden'));
    heading.append(link, element('span', source.type.toUpperCase(), 'tag'));
    const details = element('details'); details.append(element('summary', 'Supplied excerpt (' + source.id + ')'), element('blockquote', source.excerpt));
    content.append(heading, element('p', source.claim), details);
    const dates = element('dl', undefined, 'source-dates');
    for (const [key, label] of [['publishedAt', 'Published'], ['capturedAt', 'Captured']]) {
      const item = element('div'); item.append(element('dt', label), element('dd', formatDate(source[key]))); dates.append(item);
    }
    article.append(content, dates); $('source-list').append(article);
  }
}
function render(updateContent = true) {
  const report = validatePacket(packet);
  lastValidation = JSON.stringify([report.valid, report.gaps, report.errors, report.chartEligible]);
  const synthetic = packet.kind === 'synthetic';
  setText('provenance-tag', synthetic ? 'SYNTHETIC EXAMPLE' : 'UNVERIFIED RESEARCH');
  setText('provenance-text', synthetic
    ? 'Fictional inputs and a fictional review. This is an interface example, not a market forecast.'
    : origin + '. Supplied evidence and review identity have not been authenticated. This app does not fetch live data.');
  setText('asset-symbol', packet.asset.symbol || 'NEW');
  setText('asset-name', packet.asset.name || 'Untitled research packet');
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
  const gaps = [...report.errors, ...report.gaps];
  setText('gap-summary', gaps.length ? gaps.length + ' gap' + (gaps.length === 1 ? '' : 's') + ' to resolve' : 'What these checks do not prove');
  $('gap-details').open = gaps.length > 0;
  listInto('gap-list', gaps.map(issue => issue.path + ': ' + issue.message),
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
  renderChart(report);
  if (updateContent) { renderScenarios(); renderSources(); }
  refreshHorizonLabels();
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
function researchChanged(candidate) {
  const withoutReview = value => JSON.stringify(canonical(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'riskReview'))));
  return withoutReview(candidate) !== withoutReview(packet);
}
function applyPacket(candidate, label, localEdit = false) {
  let reviewReset = false;
  if (localEdit && researchChanged(candidate) && packet.riskReview.status !== 'pending') {
    if (JSON.stringify(canonical(candidate.riskReview)) !== JSON.stringify(canonical(packet.riskReview))) {
      throw new Error('Save research input changes separately from a new review. The current packet is unchanged; your editor contents are preserved.');
    }
    candidate.riskReview = blankPacket().riskReview;
    reviewReset = true;
  }
  const report = validatePacket(candidate);
  if (!report.valid) throw new Error(issuesMessage(report));
  importSequence++;
  $('app-error').hidden = true;
  dirty = localEdit ? dirty || JSON.stringify(canonical(candidate)) !== JSON.stringify(canonical(packet)) : false;
  packet = candidate; origin = label;
  render(); saveLocally();
  return reviewReset;
}
function confirmReplacement() {
  const meaningful = dirty || $('remember-packet').checked || (packet.kind === 'research'
    && JSON.stringify(canonical(packet)) !== JSON.stringify(canonical(blankPacket())));
  return !meaningful || window.confirm('Replace the open research packet? Export a copy first if you need to keep it.');
}
function field(name) { return form.elements.namedItem(name); }
function populateForm() {
  const values = { ...packet.asset, ...packet.reference, preparedBy: packet.preparedBy,
    thesis: packet.thesis, disconfirmingEvidence: packet.disconfirmingEvidence, invalidation: packet.invalidation,
    liquidity: packet.liquidity, risks: packet.risks.join('\n'), unknowns: packet.unknowns.join('\n'),
    reviewStatus: packet.riskReview.status, reviewer: packet.riskReview.reviewer,
    reviewedAt: packet.riskReview.reviewedAt, sourceIds: packet.riskReview.sourceIds.join(', '), reviewNotes: packet.riskReview.notes };
  for (const [name, value] of Object.entries(values)) if (field(name)) field(name).value = value ?? '';
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
function openEditor(mode) {
  editorOpener = document.activeElement;
  editorMode = mode;
  $('editor-error').hidden = true;
  $('details-form').hidden = mode === 'json'; $('json-editor-panel').hidden = mode !== 'json';
  setText('editor-heading', mode === 'json' ? 'Edit full research packet' : 'Edit research details');
  setText('editor-help', mode === 'json'
    ? 'Schema version 1. No credentials or confidential data. All content is treated as data. Local changes to research inputs reset the review record.'
    : 'Unknown fields may remain empty. Editing research inputs resets the review. Save inputs before recording a new independent review.');
  if (mode === 'json') $('packet-json').value = JSON.stringify(packet, null, 2);
  else populateForm();
  editorInitial = editorSnapshot();
  editor.showModal();
  (mode === 'json' ? $('packet-json') : field('symbol')).focus();
}
function closeEditor(event) {
  event?.preventDefault();
  if (editorSnapshot() !== editorInitial && !window.confirm('Discard the unapplied editor changes?')) { event?.preventDefault(); return; }
  editor.close();
}
function editorError(error) {
  $('editor-error').textContent = error.message;
  $('editor-error').hidden = false;
  $('editor-error').scrollIntoView({ block: 'nearest' });
}
function completeEdit(candidate) {
  const reset = applyPacket(candidate, 'Local draft', true);
  editor.close();
  announce(reset ? 'Research inputs changed. The previous review was reset to pending; record a new independent review before chart display.'
    : 'Packet updated. Structural checks are current; evidence and review identity remain unverified.');
}
function download(contents, type, suffix) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = element('a');
  const date = formatDate(packet.reference.capturedAt).slice(0, 10);
  const label = date === 'UNKNOWN' ? 'Undated' : date.replace(/-(\d{2})(\d{2})$/, '-$2');
  anchor.href = url;
  anchor.download = '(' + label + ')' + (packet.asset.symbol || 'Research') + ' ' + suffix;
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
    if (file.size > MAX_PACKET_BYTES) throw new Error('The JSON packet must be smaller than 256 KiB.');
    const candidate = parsePacket(await file.text());
    const report = validatePacket(candidate);
    if (!report.valid) throw new Error(issuesMessage(report));
    if (sequence !== importSequence || !confirmReplacement()) return;
    applyPacket(candidate, 'Imported packet');
    announce('Packet imported locally. No research data was sent to a server. ' + (report.complete ? 'Structure is complete.' : 'Review the listed data gaps.'));
  } catch (error) { if (sequence === importSequence) announce(error.message, true); }
  finally { event.target.value = ''; }
});
$('edit-details').addEventListener('click', () => openEditor('details'));
$('edit-json').addEventListener('click', () => openEditor('json'));
$('close-editor').addEventListener('click', closeEditor);
editor.addEventListener('cancel', closeEditor);
editor.addEventListener('close', () => { if (editorOpener?.isConnected) editorOpener.focus({ preventScroll: true }); });
form.addEventListener('submit', event => {
  event.preventDefault();
  if (editorSnapshot() === editorInitial) { editor.close(); announce('No changes were made.'); return; }
  try {
    const candidate = structuredClone(packet);
    const value = name => String(field(name).value);
    for (const name of ['symbol', 'name', 'quoteCurrency', 'venue']) candidate.asset[name] = value(name);
    candidate.reference = { price: value('price') === '' ? null : parsePacket('{"price":' + value('price') + '}').price, capturedAt: value('capturedAt'), timezone: value('timezone') };
    if (candidate.reference.capturedAt !== packet.reference.capturedAt) {
      candidate.horizons.forEach((horizon, index) => { horizon.endAt = endAt(candidate.reference.capturedAt, HORIZONS[index].hours); });
    }
    for (const name of ['preparedBy', 'thesis', 'disconfirmingEvidence', 'invalidation', 'liquidity']) candidate[name] = value(name);
    for (const name of ['risks', 'unknowns']) {
      if (value(name) !== packet[name].join('\n')) candidate[name] = value(name).split(/\r?\n/).map(item => item.trim()).filter(Boolean);
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
  try { completeEdit(parsePacket($('packet-json').value)); } catch (error) { editorError(error); }
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
      localStorage.removeItem(STORAGE_KEY);
      setText('storage-status', 'Saved draft removed. The open packet is still in memory; export it before closing.');
    } catch { announce('Saved draft removal failed. Storage is unavailable; a previous draft may remain.', true); }
  }
});
$('clear-saved').addEventListener('click', () => {
  if (!window.confirm('Remove this app’s saved browser draft? The open packet will stay in memory.')) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    $('remember-packet').checked = false;
    $('app-error').hidden = true;
    setText('storage-status', 'Saved draft removed. The open packet remains in memory. Other browser storage was not changed.');
    announce('This app’s saved draft was removed. Export the open packet if you need a backup.');
  } catch { announce('Saved draft removal failed. A previous draft may remain; check browser storage settings.', true); }
});
function selectHorizon(id, focus = false) {
  activeHorizon = id; renderScenarios(); refreshHorizonLabels();
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
  $('remember-packet').checked = false;
  setText('storage-status', 'Browser storage changed in another tab. Automatic saving is paused.');
  announce('Another tab changed the saved draft. Your open packet is unchanged. Export it before re-enabling local saving.');
});
window.addEventListener('beforeunload', event => {
  if (dirty && !$('remember-packet').checked) { event.preventDefault(); event.returnValue = ''; }
});
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) {
    const candidate = parsePacket(saved);
    if (!validatePacket(candidate).valid) throw new Error('Invalid saved packet.');
    packet = candidate; origin = 'Restored browser draft'; $('remember-packet').checked = true;
    setText('storage-status', 'Restored from this browser. Shared-device users can access the saved draft.');
  }
} catch {
  announce('The saved draft could not be loaded. It was not deleted or overwritten. A synthetic example is shown; local saving is off.', true);
}
render(); updateNavigation();
function refreshExpiry() {
  if (document.visibilityState !== 'visible') return;
  const report = validatePacket(packet);
  if (lastValidation === JSON.stringify([report.valid, report.gaps, report.errors, report.chartEligible])) return;
  const activeId = document.activeElement?.id;
  // Keep scenario controls and open editor fields intact when only time has changed.
  render(false);
  if (activeId && $(activeId)) $(activeId).focus({ preventScroll: true });
  announce('Time-sensitive checks changed. Review the current gaps before using or exporting this packet.');
}
setInterval(refreshExpiry, 60000);
document.addEventListener('visibilitychange', refreshExpiry);
