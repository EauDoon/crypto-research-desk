import {
  HORIZONS, REVIEW_ASSERTIONS, timestamp, endAt, formatDate, formatPrice, safeSourceUrl, intervalLabel,
  returnLabel, chartThresholds, exportMarkdown, repairQueue, evidenceAudit, sourceMatches, filterEvidence,
  horizonOverview, exportScenarioCsv, comparePackets, riskHandoff, restoreResearchDraft, referenceSensitivity,
  validationReceipt, sourceOriginAudit, exportEvidenceCsv, verifyReceipt, exportResearchBundle,
  readResearchBundle, monitoringChecklist, exportMonitoringCsv, renewResearchPacket,
  repairWorksheet, evidenceChronology, evidenceAgeCheck, sourceCitation,
  classifyHypotheticalPrice, intervalProbabilityBounds, comparisonWorksheet, exportRiskWorksheetCsv,
  validatePacket, blankPacket,
} from './packet.js';
import {
  packet, activeHorizon, origin, dirty, undoHistory, pinnedBaseline, comparisonBaseline,
  baselineImportSequence, receiptCheckSequence, editorMode, editorInitial, importSequence,
  lastValidation, editorOpener, printDetailsState, unreadableSavedDraft, chartOverflowCleanup,
  scenarioOverflowCleanups, editor, form, reviewLabels, methodLabels, sourceFields, scenarioFields,
  setPinnedBaseline, setComparisonBaseline, incrementBaselineImportSequence, setDirty, setUndoHistory,
  popUndo, setChartOverflowCleanup, setScenarioOverflowCleanups, setEditorMode, setEditorInitial,
  setActiveHorizon, setEditorOpener, setLastValidation, setPrintDetailsState, setUnreadableSavedDraft,
  setReceiptCheckSequence, setOnClearComparison, setOnRenderPinnedBaseline, setOnClearSensitivity,
  setOnClearReceiptCheck, setOnRender, sourceEditorValues, applyPacket, editableFieldForPath,
  field, numericInput,
} from './app-state.js';
import {
  $, element, setText, announce, issuesMessage, validationError, validationSignature,
  supportsPageMarginIdentity, listInto, svgNode, monitorHorizontalOverflow, display,
} from './app-utils.js';

export function renderChart(now) {
  const container = $('chart-area');
  chartOverflowCleanup();
  setChartOverflowCleanup(() => {});
  container.replaceChildren();
  const thresholds = chartThresholds(packet, now);
  const synthetic = packet.kind === 'synthetic';
  // Derive the chart-badge state once. The text and the class are
  // independent today: a synthetic-but-complete packet reads
  // "SAMPLE THRESHOLDS" with the amber class, while a non-synthetic and
  // complete packet reads "SUBMITTED THRESHOLDS" with the teal class.
  // Branch on the same condition in both places so a future maintainer
  // cannot drift the two.
  const chartState = thresholds.length === 4
    ? (synthetic ? 'sample' : 'submitted')
    : 'withheld';
  setText('chart-badge',
    chartState === 'sample' ? 'SAMPLE THRESHOLDS'
    : chartState === 'submitted' ? 'SUBMITTED THRESHOLDS'
    : 'WITHHELD');
  $('chart-badge').className = 'tag ' + (chartState === 'withheld' || chartState === 'sample' ? 'amber' : 'teal');
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
    // Pick one notation strategy per chart and use it for every gridline.
    // The previous logic mixed compact (>= 10k), exponential (< 0.01), and
    // fixed (everything else) within the same chart, which could make the
    // labels jump notation across one gridline.
    const tick = high >= 10000
      ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumSignificantDigits: 3 }).format(value)
      : high < 0.01
        ? value.toExponential(2)
        : String(Number(value.toPrecision(4)));
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
  setChartOverflowCleanup(monitorHorizontalOverflow(scroll, hint));
}
export function renderScenarios() {
  for (const cleanup of scenarioOverflowCleanups) cleanup();
  setScenarioOverflowCleanups([]);
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
export function refreshHorizonLabels(now = Date.now()) {
  for (const horizon of packet.horizons) {
    const ending = timestamp(horizon.endAt);
    const expired = packet.kind === 'research' && ending !== null && ending <= now;
    $('tab-' + horizon.id).querySelector('small').textContent = expired ? 'ELAPSED' : horizon.status === 'complete' ? '100% within horizon' : 'INCOMPLETE';
    $('expiry-' + horizon.id).hidden = !expired;
  }
}
export function renderSources() {
  const visible = new Set(filterEvidence(packet, $('source-search').value, $('source-type').value, $('source-coverage').value).map(source => source.id));
  const count = visible.size;
  setText('source-results', count + ' of ' + packet.sources.length + ' sources match. Exports and printing retain all sources.');
  $('source-list').replaceChildren();
  setText('source-count', packet.sources.length + ' SOURCE RECORD' + (packet.sources.length === 1 ? '' : 'S'));
  if (!packet.sources.length) $('source-list').append(element('p', 'UNKNOWN. No source records have been supplied.', 'small-copy'));
  for (const [index, source] of packet.sources.entries()) {
    const article = element('article', undefined, 'source-item'), content = element('div');
    article.classList.toggle('source-filtered', !visible.has(source.id));
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
    const editSource = element('button', 'Edit this source', 'button small subtle');
    editSource.type = 'button'; editSource.id = 'edit-source-' + source.id;
    editSource.setAttribute('aria-label', 'Edit source ' + source.id);
    editSource.addEventListener('click', () => {
      openEditor('details');
      const target = field('source-' + index + '-claim');
      target.focus({ preventScroll: true }); revealEditorTarget(target);
    });
    const copyCitation = element('button', 'Copy source citation', 'button small subtle');
    copyCitation.type = 'button'; copyCitation.setAttribute('aria-label', 'Copy citation for ' + source.id);
    copyCitation.addEventListener('click', async () => {
      copyCitation.disabled = true;
      try { await navigator.clipboard.writeText(sourceCitation(packet, source.id)); announce('Source citation copied with raw dates, claim, excerpt and research provenance.'); }
      catch { announce('Clipboard unavailable. Export complete evidence CSV to retain this source and its provenance.', true); }
      finally { copyCitation.disabled = false; }
    });
    content.append(heading, element('p', source.claim), details, editSource, copyCitation);
    const dates = element('dl', undefined, 'source-dates');
    for (const [key, label] of [['publishedAt', 'Published'], ['capturedAt', 'Captured']]) {
      const item = element('div'); item.append(element('dt', label), element('dd', formatDate(source[key]))); dates.append(item);
    }
    article.append(content, dates); $('source-list').append(article);
  }
}

import { openEditor, revealEditorTarget } from './app-editor.js';

export function render(updateContent = true, now = Date.now()) {
  $('undo-edit').disabled = undoHistory.length === 0;
  $('undo-edit').textContent = 'Undo saved edit' + (undoHistory.length ? ' (' + undoHistory.length + ')' : '');
  renderRepairs(now);
  renderEvidenceAudit(now);
  renderOverview(now);
  renderMonitoring(now);
  if (!validatePacket(packet, now).chartEligible) clearSensitivity();
  const report = validatePacket(packet, now);
  setLastValidation(validationSignature(report));
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

export function renderRepairs(now) {
  const queue = repairQueue(packet, now);
  $('repair-list').replaceChildren(...queue.map(item => {
    const li = element('li');
    const button = element('button', item.path + ': ' + item.message, 'button small subtle repair-action');
    button.type = 'button';
    button.addEventListener('click', () => {
      openEditor('details');
      const elapsedHorizon = /^horizons\[\d+\]$/.test(item.path) && item.message === 'This forecast horizon has elapsed. Refresh the packet.';
      const target = elapsedHorizon ? field('capturedAt') : editableFieldForPath(item.path);
      if (elapsedHorizon) setText('editor-help', 'Refresh the reference price, capture time, and supporting research together. Changing the cutoff alone does not refresh evidence or recalibrate probabilities. Saving research edits resets the review.');
      if (item.path === 'sources' && packet.sources.length) setText('editor-help', 'Inspect the existing source record and replace it with actual primary evidence when needed. Changing the source type label alone does not verify evidence. Saving research edits resets the review.');
      if (target) { target.focus({ preventScroll: true }); revealEditorTarget(target); }
    });
    li.append(button); return li;
  }));
  if (!queue.length) $('repair-list').append(element('li', 'No structural repairs recorded. Source truth and reviewer identity still require human verification.'));
}

export function renderEvidenceAudit(now = Date.now()) {
  renderEvidenceAge(now);
  listInto('evidence-chronology', evidenceChronology(packet, now).map(item =>
    formatDate(item.at) + ': ' + item.sourceId + ' ' + (item.event === 'publishedAt' ? 'published' : 'captured') + ' (' + item.title + ')'), 'No source events recorded.');
  const origins = sourceOriginAudit(packet, now);
  listInto('source-origin-audit', [
    ...origins.hosts.map(item => item.host + ': ' + item.count + ' of ' + packet.sources.length + ' records (' + item.sharePercent.toFixed(1) + '%); ' + item.primaryCount + ' labeled primary'),
    ...origins.repeatedExcerpts.map(ids => 'Matching excerpt after whitespace normalization: ' + ids.join(', ')),
  ], 'No source records to inspect.');
  const audit = evidenceAudit(packet);
  listInto('evidence-audit', audit.map(item => item.id + ': ' + item.type + '; ' +
    (item.ageHours === null ? 'UNKNOWN capture age' : item.ageHours.toFixed(2) + ' hours before cutoff') +
    '; ' + (item.reviewed ? 'listed in submitted review' : 'not listed in submitted review') +
    '; ' + (item.hasExcerpt ? 'excerpt supplied' : 'excerpt UNKNOWN')), 'No source records to audit.');
}

export function renderEvidenceAge(now = Date.now()) {
  try {
    if (!$('evidence-age-limit').value.trim()) throw new Error('Use a capture-age limit above 0 and no greater than 87600 hours.');
    listInto('evidence-age-results', evidenceAgeCheck(packet, numericInput('evidence-age-limit'), now).map(item =>
      item.id + ': ' + item.status + (item.ageHours === null ? '' : ' (' + item.ageHours.toFixed(2) + ' hours before cutoff)')), 'No sources to check.');
  } catch (error) { listInto('evidence-age-results', [error.message], ''); }
}

export function renderOverview(now) {
  const table = element('table'), head = element('thead'), tr = element('tr');
  for (const label of ['Horizon', 'Timing', 'Bear ceiling', 'Bull floor', 'Base probability']) {
    const th = element('th', label); th.scope = 'col'; tr.append(th);
  }
  head.append(tr); table.append(head);
  const body = element('tbody');
  for (const item of horizonOverview(packet, now)) {
    const row = element('tr');
    for (const value of [item.label, item.timing, formatPrice(item.bearCeiling), formatPrice(item.bullFloor), item.baseProbability === null ? 'WITHHELD' : item.baseProbability + '%']) row.append(element('td', value));
    body.append(row);
  }
  table.append(body); $('horizon-overview').replaceChildren(table);
}

export function clearComparison() {
  setComparisonBaseline(null); $('export-comparison').disabled = true;
  $('comparison-json').value = ''; $('comparison-results').replaceChildren(); $('comparison-status').textContent = '';
}

export function showComparison(previous) {
  setComparisonBaseline(null); $('export-comparison').disabled = true;
  try {
    const result = comparePackets(previous, packet);
    setComparisonBaseline(structuredClone(previous)); $('export-comparison').disabled = false;
    const summary = value => JSON.stringify(value).slice(0, 240);
    listInto('comparison-results', result.changes.map(item => item.path + ': ' + summary(item.previous) + ' → ' + summary(item.current)), 'No submitted fields changed.');
    setText('comparison-status', result.total + ' changed fields; ' + result.omitted + ' omitted. Long values are shortened. Sources and review assertions are matched by ID. Open raw JSON for full evidence.');
  } catch (error) { $('comparison-results').replaceChildren(); setText('comparison-status', error.message); }
}

export function clearSensitivity() {
  $('probability-lower').value = ''; $('probability-upper').value = ''; $('probability-results').replaceChildren(); $('probability-status').textContent = '';
  $('classification-price').value = ''; $('classification-results').replaceChildren(); $('classification-status').textContent = '';
  $('sensitivity-price').value = ''; $('sensitivity-status').textContent = ''; $('sensitivity-results').replaceChildren();
}

export function clearReceiptCheck() {
  setReceiptCheckSequence(receiptCheckSequence + 1); $('receipt-json').value = ''; $('receipt-result').textContent = ''; $('verify-receipt').disabled = false;
}

export function renderPinnedBaseline() {
  $('clear-baseline').disabled = !pinnedBaseline;
  $('export-baseline').disabled = !pinnedBaseline;
  setText('baseline-status', pinnedBaseline ? 'Pinned ' + pinnedBaseline.asset.symbol + ' at ' + (pinnedBaseline.reference.capturedAt || 'UNKNOWN cutoff') + '. Local edits compare automatically; reload forgets this snapshot.' : 'No baseline pinned. A pinned snapshot stays in page memory only.');
  if (pinnedBaseline) showComparison(pinnedBaseline);
}

export function renderMonitoring(now) {
  const checklist = monitoringChecklist(packet, now);
  if (!checklist.eligible) { listInto('monitoring-checklist', [], 'Monitoring scenarios are WITHHELD by the current packet gate.'); return; }
  const groups = new Map();
  for (const row of checklist.rows) groups.set(row.trigger, [...(groups.get(row.trigger) ?? []), row]);
  $('monitoring-checklist').replaceChildren(...[...groups].map(([trigger, rows]) => {
    const item = element('li'); item.append(element('strong', trigger));
    const contexts = element('ul');
    for (const row of rows) contexts.append(element('li', row.horizon + ' ' + row.scenario + ', ending ' + formatDate(row.endAt) + '. Invalidation: ' + row.invalidation));
    item.append(contexts); return item;
  }));
}

// Wire post-apply hooks into the state module so applyPacket can re-render
// the live UI without creating a circular import at module-evaluation time.
setOnClearComparison(clearComparison);
setOnRenderPinnedBaseline(renderPinnedBaseline);
setOnClearSensitivity(clearSensitivity);
setOnClearReceiptCheck(clearReceiptCheck);
setOnRender(render);
