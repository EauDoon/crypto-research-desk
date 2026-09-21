import { HORIZONS } from './packet-constants.js';
import { finitePrice } from './packet-parse.js';
import { timestamp, safeSourceUrl, validatePacket } from './packet-validate.js';

export { timestamp, safeSourceUrl };

export function formatDate(value, timezone = 'UTC') {
  const instant = timestamp(value);
  if (instant === null) return 'UNKNOWN';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const item = name => parts.find(part => part.type === name)?.value;
    const wallClock = Date.UTC(Number(item('year')), Number(item('month')) - 1, Number(item('day')),
      Number(item('hour')), Number(item('minute')), Number(item('second')));
    const offsetSeconds = (wallClock - Math.floor(instant / 1000) * 1000) / 1000;
    if (!Number.isInteger(offsetSeconds) || Math.abs(offsetSeconds) > 24 * 3600) return 'UNKNOWN';
    const absoluteOffset = Math.abs(offsetSeconds);
    const offset = (offsetSeconds < 0 ? '-' : '+')
      + String(Math.floor(absoluteOffset / 3600)).padStart(2, '0') + ':'
      + String(Math.floor(absoluteOffset % 3600 / 60)).padStart(2, '0')
      + (absoluteOffset % 60 ? ':' + String(absoluteOffset % 60).padStart(2, '0') : '');
    return item('day') + '-' + item('month') + '-' + item('year') + ' '
      + item('hour') + ':' + item('minute') + ':' + item('second') + ' ' + timezone
      + ' (UTC' + offset + '; ' + new Date(instant).toISOString() + ')';
  } catch { return 'UNKNOWN'; }
}

export function formatPrice(value) {
  if (!finitePrice(value)) return 'UNKNOWN';
  const raw = String(value);
  if (raw.includes('e')) return raw;
  const [integer, fraction] = raw.split('.');
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
}

export function endAt(capturedAt, hours) {
  const instant = timestamp(capturedAt);
  return instant === null ? '' : new Date(instant + hours * 3600000).toISOString();
}

export function blankPacket() {
  return {
    schemaVersion: 1, kind: 'research', preparedBy: '',
    asset: { symbol: '', name: '', quoteCurrency: 'USD', venue: '' },
    reference: { price: null, capturedAt: '', timezone: 'UTC' },
    thesis: '', disconfirmingEvidence: '', invalidation: '', liquidity: '', risks: [], unknowns: [],
    method: {
      basis: 'judgmental', description: '', sourceWindow: '', observationFrequency: '',
      sampleSize: null, transformations: '', regimeAdjustment: '', eventAssumptions: '', limitations: '',
    },
    sources: [],
    horizons: HORIZONS.map(horizon => ({
      id: horizon.id, endAt: '', status: 'incomplete',
      gapReason: 'No evidence-backed forecast supplied.', scenarios: [],
    })),
    riskReview: {
      status: 'pending', reviewer: '', reviewedAt: '', notes: '', sourceIds: [],
      assertions: REVIEW_ASSERTIONS.map(assertion => ({ id: assertion.id, result: 'UNKNOWN', evidence: '', severity: 'high', repair: '' })),
    },
  };
}

import { REVIEW_ASSERTIONS } from './packet-constants.js';

export function intervalLabel(scenario) {
  return formatPrice(scenario.lower) + ' \u2264 price'
    + (scenario.upper === null ? '' : ' < ' + formatPrice(scenario.upper));
}

export function returnLabel(scenario, referencePrice) {
  if (!finitePrice(referencePrice) || referencePrice === 0) return 'UNKNOWN';
  if (![scenario.lower, ...(scenario.upper === null ? [] : [scenario.upper])]
    .every(price => Number.isFinite((price / referencePrice - 1) * 100))) return 'UNKNOWN (numeric overflow)';
  const percent = price => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })
    .format((price / referencePrice - 1) * 100) + '%';
  return '≈ ' + percent(scenario.lower) + (scenario.upper === null ? ' or higher' : ' to below ' + percent(scenario.upper));
}

export function chartThresholds(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.chartEligible) return [];
  return packet.horizons.map(horizon => ({
    id: horizon.id,
    bearBaseBoundary: horizon.scenarios[0].upper,
    baseBullBoundary: horizon.scenarios[2].lower,
  }));
}

export function horizonOverview(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  return HORIZONS.map((definition, index) => {
    const horizon = packet.horizons?.[index];
    const ending = timestamp(horizon?.endAt);
    const visible = report.chartEligible;
    return { id: definition.id, label: definition.label,
      timing: packet.kind === 'synthetic' ? 'Synthetic timeline' : ending === null ? 'UNKNOWN' : ending <= now ? 'Elapsed' : ((ending - now) / 3600000).toFixed(1) + ' hours remaining',
      bearCeiling: visible ? horizon.scenarios[0].upper : null,
      bullFloor: visible ? horizon.scenarios[2].lower : null,
      baseProbability: visible ? horizon.scenarios[1].probability : null };
  });
}

export function monitoringChecklist(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('Monitoring requires a structurally valid packet.');
  return { eligible: report.chartEligible, rows: packet.horizons.flatMap(horizon => report.chartEligible
    ? horizon.scenarios.map(scenario => ({ horizon: horizon.id, endAt: horizon.endAt, scenario: scenario.label, trigger: scenario.trigger, invalidation: scenario.invalidation }))
    : [{ horizon: horizon.id, endAt: horizon.endAt, scenario: 'WITHHELD', trigger: '', invalidation: '' }]) };
}
