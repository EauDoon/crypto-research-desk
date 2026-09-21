import { HORIZONS, REVIEW_ASSERTIONS } from './packet-constants.js';
import { validatePacket } from './packet-validate.js';
import { formatDate, formatPrice, safeSourceUrl, intervalLabel, returnLabel, chartThresholds, monitoringChecklist } from './packet-format.js';

// Collapse imported whitespace and escape every CommonMark ASCII punctuation
// character so packet prose cannot create blocks, links, HTML, or formatting.
const markdownText = value => String(value ?? 'UNKNOWN').replace(/\s+/gu, ' ').trim()
  .replace(/[!-/:-@[-`{-~]/g, character => '\\' + character);

export function exportMarkdown(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('Repair structural errors before exporting a brief.');
  const p = markdownText;
  const lines = [
    '# ' + p(packet.asset.symbol || 'Unnamed asset') + ' research brief', '',
    packet.kind === 'synthetic' ? '**SYNTHETIC EXAMPLE. All research values and review identities are fictional.**' : '**SUBMITTED RESEARCH. Evidence and review identity are unverified.**',
    '', 'Research only. No orders, allocation sizing, account access, or execution authority.',
    '', 'Structure: ' + (report.complete ? 'COMPLETE' : 'INCOMPLETE') + '. This is not a source or forecast certification.',
    'Asset name: ' + p(packet.asset.name || 'UNKNOWN') + '.',
    'Reference: ' + formatPrice(packet.reference.price) + ' ' + p(packet.asset.quoteCurrency) + '.',
    'Venue or composite: ' + p(packet.asset.venue || 'UNKNOWN') + '.',
    'Captured: ' + p(formatDate(packet.reference.capturedAt, packet.reference.timezone)) + '.',
    'Prepared by (self-reported): ' + p(packet.preparedBy || 'UNKNOWN') + '.',
    '', '## Thesis', '', p(packet.thesis || 'UNKNOWN'),
    '', '## Strongest disconfirming evidence', '', p(packet.disconfirmingEvidence || 'UNKNOWN'),
    '', '## Invalidation', '', p(packet.invalidation || 'UNKNOWN'),
    '', '## Liquidity and risk', '', p(packet.liquidity || 'UNKNOWN'), '',
    ...packet.risks.map(risk => '- ' + p(risk)), '',
    '## Method', '',
    ...Object.entries(packet.method).map(([key, value]) => '- ' + p(key) + ': ' + p(value ?? 'UNKNOWN')),
  ];
  for (const horizon of packet.horizons) {
    lines.push('', '## ' + HORIZONS.find(item => item.id === horizon.id).label, '',
      'Ends: ' + p(formatDate(horizon.endAt, packet.reference.timezone)) + '.', '');
    if (horizon.status === 'incomplete') {
      lines.push('| Status | Evidence gap |', '| --- | --- |', '| INCOMPLETE | ' + p(horizon.gapReason) + ' |');
      continue;
    }
    lines.push('| Scenario | Price interval | Probability | Implied return | Driver | Trigger | Invalidation | Confidence |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const scenario of horizon.scenarios) lines.push('| ' + [
      scenario.label, intervalLabel(scenario), scenario.probability + '%', returnLabel(scenario, packet.reference.price),
      scenario.driver, scenario.trigger, scenario.invalidation, scenario.confidence,
    ].map(p).join(' | ') + ' |');
    lines.push('', 'Total: 100%. Intervals include the lower bound and exclude the upper bound.');
  }
  lines.push('', '## Price target range by horizon', '');
  const thresholds = chartThresholds(packet, now);
  if (thresholds.length) {
    lines.push('This text export gives the thresholds below. Use the browser Print / PDF view for the chart.',
      'The chart follows the submitted review record; this application does not authenticate that record.', '',
      '| Horizon | Bear ceiling (exclusive) | Bull floor (inclusive) |', '| --- | --- | --- |');
    for (const threshold of thresholds) lines.push('| ' + threshold.id + ' | '
      + formatPrice(threshold.bearBaseBoundary) + ' | ' + formatPrice(threshold.baseBullBoundary) + ' |');
    lines.push('', 'Targets are scenario thresholds, not guaranteed closing prices.');
  } else lines.push('WITHHELD. A complete packet and an eligible independent review record are required.');
  lines.push('', '## Dated evidence', '');
  for (const source of packet.sources) {
    const url = safeSourceUrl(source.url);
    lines.push('- ' + p(source.id) + ': [' + p(source.title) + '](<' + url + '>) (' + p(source.type) + ')',
      '  Published: ' + p(formatDate(source.publishedAt)) + '. Captured: ' + p(formatDate(source.capturedAt)) + '.',
      '  Claim: ' + p(source.claim), '  Supplied excerpt: ' + p(source.excerpt));
  }
  lines.push('', '## Independent risk record', '', 'Disposition (self-reported): ' + p(packet.riskReview.status) + '.',
    'Reviewer (self-reported): ' + p(packet.riskReview.reviewer || 'UNKNOWN') + '.',
    'Reviewed source IDs: ' + (packet.riskReview.sourceIds.length ? packet.riskReview.sourceIds.map(p).join(', ') : 'NONE RECORDED') + '.',
    'Reviewed: ' + p(formatDate(packet.riskReview.reviewedAt)) + '.', p(packet.riskReview.notes || 'UNKNOWN'),
    '', '### Submitted review assertions', '',
    '| Assertion | Result | Evidence | Severity | Repair |', '| --- | --- | --- | --- | --- |',
    ...packet.riskReview.assertions.map(assertion => '| ' + [
      assertion.id, assertion.result, assertion.evidence || 'UNKNOWN', assertion.severity, assertion.repair || 'Not supplied',
    ].map(p).join(' | ') + ' |'),
    '', '## Unresolved unknowns and validation gaps', '');
  const unknowns = [...packet.unknowns, ...report.gaps.map(item => item.path + ': ' + item.message)];
  if (report.omittedIssueCounts.gaps) unknowns.push('validation gaps: ' + report.omittedIssueCounts.gaps
    + ' additional validation gaps omitted from this bounded list; ' + report.gapCount + ' total.');
  lines.push(...(unknowns.length ? unknowns.map(item => '- ' + p(item)) : ['No unknowns were supplied. This does not establish that none exist.']));
  lines.push('', 'Probabilities are not additive across horizons. The human operator owns all external actions.', '');
  return lines.join('\n');
}

function csvRows(rows) {
  const cell = value => {
    let text = String(value ?? 'UNKNOWN');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function exportScenarioCsv(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('CSV export requires a structurally valid packet.');
  const rows = [['kind', 'asset', 'quote_currency', 'reference_price', 'reference_cutoff', 'horizon', 'end_at', 'gate', 'scenario', 'lower_inclusive', 'upper_exclusive', 'probability_percent', 'trigger', 'invalidation']];
  for (const horizon of packet.horizons) {
    const prefix = [packet.kind, packet.asset.symbol, packet.asset.quoteCurrency, packet.reference.price, packet.reference.capturedAt, horizon.id, horizon.endAt];
    if (!report.chartEligible) rows.push([...prefix, 'WITHHELD', '', '', '', '', '', '']);
    else for (const scenario of horizon.scenarios) rows.push([...prefix, 'SUBMITTED_UNAUTHENTICATED', scenario.label, scenario.lower, scenario.upper === null ? 'UNBOUNDED' : scenario.upper, scenario.probability, scenario.trigger, scenario.invalidation]);
  }
  return csvRows(rows);
}

export function exportEvidenceCsv(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Evidence CSV requires a structurally valid packet.');
  const reviewed = new Set(packet.riskReview.sourceIds);
  const rows = [['kind', 'asset', 'reference_cutoff', 'source_id', 'title', 'url', 'type_as_recorded', 'published_at', 'captured_at', 'claim', 'excerpt', 'listed_in_submitted_review']];
  for (const source of packet.sources) rows.push([packet.kind, packet.asset.symbol, packet.reference.capturedAt,
    source.id, source.title, source.url, source.type, source.publishedAt, source.capturedAt, source.claim, source.excerpt, reviewed.has(source.id) ? 'SELF_REPORTED_YES' : 'NOT_LISTED']);
  return csvRows(rows);
}

export function exportMonitoringCsv(packet, now = Date.now()) {
  const checklist = monitoringChecklist(packet, now);
  return csvRows([['kind', 'asset', 'reference_cutoff', 'horizon', 'deadline', 'submitted_scenario', 'observe_manually', 'invalidation'],
    ...checklist.rows.map(row => [packet.kind, packet.asset.symbol, packet.reference.capturedAt, row.horizon, row.endAt, row.scenario, row.trigger, row.invalidation])]);
}

export function exportRiskWorksheetCsv(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Risk worksheet export requires a structurally valid packet.');
  const severity = { high: 0, medium: 1, low: 2 }, review = packet.riskReview;
  const assertions = [...review.assertions].sort((left, right) =>
    Number(left.result === 'PASS') - Number(right.result === 'PASS') || severity[left.severity] - severity[right.severity]
    || left.id.localeCompare(right.id));
  return csvRows([['authority', 'kind', 'asset', 'reference_cutoff', 'submitted_disposition', 'reviewer_alias_unverified',
    'reviewed_at', 'assertion_id', 'submitted_result', 'severity', 'submitted_evidence', 'repair', 'submitted_source_ids'],
    ...assertions.map(row => ['RESEARCH_ONLY', packet.kind, packet.asset.symbol, packet.reference.capturedAt,
      review.status, review.reviewer, review.reviewedAt, row.id, row.result, row.severity, row.evidence, row.repair, review.sourceIds.join('; ')])]);
}
