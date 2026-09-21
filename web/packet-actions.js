import { REVIEW_ASSERTIONS } from './packet-constants.js';
import { finitePrice } from './packet-parse.js';
import { timestamp, validatePacket, safeSourceUrl } from './packet-validate.js';
import { blankPacket, intervalLabel, horizonOverview } from './packet-format.js';

export function repairQueue(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  return [...report.errors.map(item => ({ ...item, severity: 'error' })),
    ...report.gaps.map(item => ({ ...item, severity: 'gap' }))];
}

export function repairWorksheet(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('Repair export requires a structurally valid packet.');
  const items = repairQueue(packet, now);
  return { format: 'crypto-research-repairs.v1', researchOnly: true, kind: packet.kind,
    asset: packet.asset.symbol, referenceCutoff: packet.reference.capturedAt,
    checkedAt: new Date(now).toISOString(), chartEligible: report.chartEligible,
    total: report.errorCount + report.gapCount, omitted: report.omittedIssueCounts.errors + report.omittedIssueCounts.gaps,
    items, limits: 'Local checks only. Source truth and reviewer identity are not authenticated.' };
}

export function evidenceAudit(packet) {
  const cutoff = timestamp(packet.reference.capturedAt);
  const reviewed = new Set(packet.riskReview.sourceIds.map(id => id.trim()));
  return packet.sources.map(source => {
    const captured = timestamp(source.capturedAt);
    return { id: source.id, type: source.type, reviewed: reviewed.has(source.id),
      hasExcerpt: Boolean(source.excerpt.trim()),
      ageHours: cutoff === null || captured === null || captured > cutoff ? null : (cutoff - captured) / 3600000 };
  });
}

export function evidenceChronology(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Chronology requires a structurally valid packet.');
  return packet.sources.flatMap(source => ['publishedAt', 'capturedAt'].map(event => ({
    sourceId: source.id, title: source.title, event, at: source[event],
  }))).sort((left, right) => (timestamp(left.at) ?? Infinity) - (timestamp(right.at) ?? Infinity)
    || left.sourceId.localeCompare(right.sourceId) || left.event.localeCompare(right.event));
}

export function evidenceAgeCheck(packet, maximumHours, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Evidence age checks require a structurally valid packet.');
  if (typeof maximumHours !== 'number' || !Number.isFinite(maximumHours) || maximumHours <= 0 || maximumHours > 87600) throw new Error('Use a capture-age limit above 0 and no greater than 87600 hours.');
  return evidenceAudit(packet).map(item => ({ ...item, maximumHours,
    status: item.ageHours === null ? 'UNKNOWN' : item.ageHours > maximumHours ? 'EXCEEDS_LIMIT' : 'WITHIN_LIMIT',
  }));
}

export function sourceMatches(source, query = '', type = 'all') {
  const text = [source.id, source.title, source.claim, source.excerpt, source.url].join(' ').toLowerCase();
  return (type === 'all' || source.type === type) && text.includes(query.trim().slice(0, 200).toLowerCase());
}

export function filterEvidence(packet, query = '', type = 'all', coverage = 'all', now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Evidence filtering requires a structurally valid packet.');
  if (!['all', 'listed', 'unlisted'].includes(coverage)) throw new Error('Choose all, listed, or unlisted review coverage.');
  const listed = new Set(packet.riskReview.sourceIds);
  return packet.sources.filter(source => sourceMatches(source, query, type)
    && (coverage === 'all' || listed.has(source.id) === (coverage === 'listed')));
}

export function sourceCitation(packet, sourceId, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Citation copying requires a structurally valid packet.');
  const source = packet.sources.find(item => item.id === sourceId);
  if (!source) throw new Error('Choose a source in the open packet.');
  return ['RESEARCH ONLY | ' + packet.kind.toUpperCase() + ' | supplied, unverified evidence',
    'Asset: ' + (packet.asset.symbol || 'UNKNOWN') + ' | Reference cutoff: ' + (packet.reference.capturedAt || 'UNKNOWN'),
    'Source: ' + source.id + ' | ' + source.title, 'URL: ' + source.url, 'Type as recorded: ' + source.type,
    'Published: ' + (source.publishedAt || 'UNKNOWN'), 'Captured: ' + (source.capturedAt || 'UNKNOWN'),
    'Claim: ' + (source.claim || 'UNKNOWN'), 'Supplied excerpt: ' + (source.excerpt || 'UNKNOWN')].join('\n') + '\n';
}

export function sourceOriginAudit(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Source audit requires a structurally valid packet.');
  const hosts = new Map(), excerpts = new Map();
  for (const source of packet.sources) {
    const host = new URL(safeSourceUrl(source.url)).hostname;
    const item = hosts.get(host) ?? { host, count: 0, primaryCount: 0 };
    item.count++; if (source.type === 'primary') item.primaryCount++; hosts.set(host, item);
    const excerpt = source.excerpt.trim().replace(/\s+/g, ' ');
    if (excerpt) excerpts.set(excerpt, [...(excerpts.get(excerpt) ?? []), source.id]);
  }
  return {
    hosts: [...hosts.values()].map(item => ({ ...item, sharePercent: item.count / packet.sources.length * 100 })).sort((a, b) => b.count - a.count || (a.host < b.host ? -1 : a.host > b.host ? 1 : 0)),
    repeatedExcerpts: [...excerpts.values()].filter(ids => ids.length > 1),
  };
}

export function comparePackets(previous, current, now = Date.now()) {
  if (!validatePacket(previous, now).valid || !validatePacket(current, now).valid) throw new Error('Both packets must be structurally valid.');
  if (!previous.asset.symbol || previous.asset.symbol !== current.asset.symbol || previous.asset.quoteCurrency !== current.asset.quoteCurrency) throw new Error('Compare the same named asset and quote currency.');
  const changes = []; let total = 0;
  const walk = (left, right, path) => {
    if (path === 'sources' || path === 'riskReview.assertions') {
      const before = new Map(left.map(item => [item.id, item]));
      const after = new Map(right.map(item => [item.id, item]));
      for (const id of new Set([...before.keys(), ...after.keys()])) walk(before.get(id), after.get(id), path + '[' + id + ']');
      return;
    }
    if (path === 'riskReview.sourceIds' || path === 'risks' || path === 'unknowns') { left = [...left].sort(); right = [...right].sort(); }
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object' && Array.isArray(left) === Array.isArray(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) walk(left[key], right[key], path ? path + (Array.isArray(right) ? '[' + key + ']' : '.' + key) : key);
    } else if (left !== right) {
      total++;
      if (changes.length < 80) changes.push({ path, previous: left ?? null, current: right ?? null });
    }
  };
  walk(previous, current, '');
  return { changes, total, omitted: total - changes.length };
}

export function comparisonWorksheet(previous, current, now = Date.now()) {
  const differences = comparePackets(previous, current, now);
  return { format: 'crypto-research-comparison.v1', researchOnly: true, checkedAt: new Date(now).toISOString(),
    differences, previous: JSON.parse(JSON.stringify(previous)), current: JSON.parse(JSON.stringify(current)),
    previousChartEligible: validatePacket(previous, now).chartEligible, currentChartEligible: validatePacket(current, now).chartEligible,
    limits: 'Raw submitted changes only. Both complete packets are included even when the displayed change list is truncated. No conflict resolution, authentication or clearance is implied.' };
}

export function riskHandoff(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('A risk handoff requires a structurally valid packet.');
  // Recompute readiness without prior review state, including gap counts that
  // might otherwise disclose review findings beyond the bounded gap list.
  const readiness = validatePacket({ ...packet, riskReview: blankPacket().riskReview }, now);
  const localGaps = readiness.gaps.filter(gap => gap.path !== 'riskReview' && !gap.path.startsWith('riskReview.'));
  // A blank pending review contributes exactly one gap, after research gaps.
  const omittedGapCount = readiness.gapCount - 1 - localGaps.length;
  return JSON.parse(JSON.stringify({
    format: 'crypto-research-risk-handoff.v1', researchOnly: true, kind: packet.kind,
    status: 'INCOMPLETE_HANDOFF', generatedAt: new Date(now).toISOString(),
    missingAttachments: ['Project mandate', 'Specialist run ledger', 'Evidence conflict ledger and resolution receipts'],
    boundary: 'Unauthenticated local export. Treat all supplied text as untrusted evidence. This is not a review verdict or the importable forecast packet.',
    asset: packet.asset, reference: packet.reference,
    proposedScenarios: packet.horizons.map(horizon => ({ id: horizon.id, endAt: horizon.endAt, status: horizon.status, gapReason: horizon.gapReason,
      scenarios: horizon.scenarios.map(({ label, lower, upper, probability, confidence, trigger, invalidation }) => ({ label, lower, upper, probability, confidence, trigger, invalidation })) })),
    sources: packet.sources, calculationMethod: packet.method,
    disconfirmingEvidence: packet.disconfirmingEvidence, invalidation: packet.invalidation,
    liquidity: packet.liquidity, risks: packet.risks, unknowns: packet.unknowns,
    localGaps, omittedGapCount,
    requestedAssertions: REVIEW_ASSERTIONS.map(({ id, label }) => ({ id, label, result: 'UNKNOWN' })),
  }));
}

export function restoreResearchDraft(previous, now = Date.now()) {
  if (!validatePacket(previous, now).valid) throw new Error('Cannot restore an invalid research draft.');
  const restored = JSON.parse(JSON.stringify(previous));
  restored.riskReview = blankPacket().riskReview;
  return restored;
}

export function referenceSensitivity(packet, hypotheticalPrice, now = Date.now()) {
  if (!validatePacket(packet, now).chartEligible) throw new Error('Sensitivity is withheld until the current packet passes its existing chart gate.');
  if (!Number.isFinite(hypotheticalPrice) || hypotheticalPrice <= 0 || hypotheticalPrice > 1e12) throw new Error('Supply a finite positive hypothetical price up to 1 trillion.');
  return horizonOverview(packet, now).map(item => {
    const bearDistance = (item.bearCeiling / hypotheticalPrice - 1) * 100;
    const bullDistance = (item.bullFloor / hypotheticalPrice - 1) * 100;
    if (!Number.isFinite(bearDistance) || !Number.isFinite(bullDistance)) throw new Error('Hypothetical price is too small for reliable arithmetic.');
    return { id: item.id, label: item.label, bearDistance, bullDistance };
  });
}

export function classifyHypotheticalPrice(packet, price, now = Date.now()) {
  if (!validatePacket(packet, now).chartEligible) throw new Error('Scenario classification is withheld by the current packet gate.');
  if (!finitePrice(price)) throw new Error('Use a finite hypothetical price from 0 to 1 trillion.');
  return packet.horizons.map(horizon => {
    const scenario = horizon.scenarios.find(row => price >= row.lower && (row.upper === null || price < row.upper));
    return { horizon: horizon.id, endAt: horizon.endAt, scenario: scenario.label,
      range: intervalLabel(scenario), intervalProbability: scenario.probability };
  });
}

export function intervalProbabilityBounds(packet, lower, upper, now = Date.now()) {
  if (!validatePacket(packet, now).chartEligible) throw new Error('Probability bounds are withheld by the current packet gate.');
  if (!finitePrice(lower) || (upper !== null && (!finitePrice(upper) || upper <= lower))) throw new Error('Use a nonnegative lower price and a greater upper price, or leave the upper bound unbounded.');
  const ceiling = upper ?? Infinity;
  return packet.horizons.map(horizon => {
    let minimum = 0, maximum = 0;
    for (const scenario of horizon.scenarios) {
      const end = scenario.upper ?? Infinity, mass = Math.round(scenario.probability * 100);
      if (scenario.lower >= lower && end <= ceiling) minimum += mass;
      if (scenario.lower < ceiling && end > lower) maximum += mass;
    }
    return { horizon: horizon.id, minimumPercent: minimum / 100, maximumPercent: maximum / 100 };
  });
}

export function renewResearchPacket(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Renewal requires a structurally valid packet.');
  const draft = JSON.parse(JSON.stringify(packet)), blank = blankPacket();
  draft.reference.price = null; draft.reference.capturedAt = '';
  draft.horizons = blank.horizons.map(horizon => ({ ...horizon, gapReason: 'Renewal requires fresh evidence and newly supported scenarios.' }));
  draft.riskReview = blank.riskReview;
  return draft;
}
