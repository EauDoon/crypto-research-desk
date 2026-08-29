export const MAX_PACKET_BYTES = 256 * 1024;
export const HORIZONS = Object.freeze([
  { id: '12h', label: '12 hours', hours: 12 },
  { id: '24h', label: '24 hours', hours: 24 },
  { id: '3d', label: '3 days', hours: 72 },
  { id: '7d', label: '7 days', hours: 168 },
]);
export const SCENARIOS = Object.freeze(['Bear', 'Base', 'Bull']);
export const REVIEW_ASSERTIONS = Object.freeze([
  { id: 'authority', label: 'Research-only authority boundary' },
  { id: 'evidence', label: 'Source provenance and cutoff' },
  { id: 'scenarios', label: 'Scenario math and method' },
  { id: 'liquidity', label: 'Liquidity and permanent-loss risk' },
  { id: 'invalidation', label: 'Countercase and invalidation' },
]);
const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const present = value => typeof value === 'string' && value.trim().length > 0;
const aliasKey = value => value.normalize('NFKC').replace(/\p{White_Space}+/gu, ' ').trim().toLocaleLowerCase('en-US');
const finitePrice = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12;
function wellFormed(value) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(++index);
      if (next < 0xdc00 || next > 0xdfff) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
function portableJson(value) {
  const seen = new WeakSet();
  let nodes = 0;
  function visit(current, depth) {
    if (++nodes > 10000 || depth > 16) return false;
    if (current === null || typeof current === 'boolean') return true;
    if (typeof current === 'string') return wellFormed(current);
    if (typeof current === 'number') return Number.isFinite(current);
    if (typeof current !== 'object' || seen.has(current)) return false;
    seen.add(current);
    try {
      const prototype = Object.getPrototypeOf(current);
      const keys = Reflect.ownKeys(current);
      if (Array.isArray(current)) {
        if (prototype !== Array.prototype) return false;
        const length = Object.getOwnPropertyDescriptor(current, 'length');
        if (!length || !own(length, 'value') || !Number.isSafeInteger(length.value)
          || length.value < 0 || length.value > 128 || keys.length !== length.value + 1) return false;
        for (let index = 0; index < length.value; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(current, String(index));
          if (!descriptor?.enumerable || !own(descriptor, 'value') || !visit(descriptor.value, depth + 1)) return false;
        }
        return keys.every(key => key === 'length'
          || (typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key) && Number(key) < length.value));
      }
      if (![Object.prototype, null].includes(prototype)) return false;
      for (const key of keys) {
        if (typeof key !== 'string' || !wellFormed(key) || forbiddenKeys.has(key)) return false;
        const descriptor = Object.getOwnPropertyDescriptor(current, key);
        if (!descriptor?.enumerable || !own(descriptor, 'value') || !visit(descriptor.value, depth + 1)) return false;
      }
      return true;
    } catch { return false; }
  }
  return visit(value, 0);
}
function decimalKey(token) {
  const negative = token.startsWith('-');
  const [mantissa, power = '0'] = token.replace(/^-/, '').toLowerCase().split('e');
  const fraction = mantissa.split('.')[1] ?? '';
  let digits = mantissa.replace('.', '').replace(/^0+/, '');
  if (!digits) return '0';
  let exponent = Number(power) - fraction.length;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent++; }
  return (negative ? '-' : '') + digits + 'e' + exponent;
}

// A bounded JSON reader rejects duplicate keys before information is lost by JSON.parse.
export function parsePacket(text) {
  if (typeof text !== 'string' || text.length > MAX_PACKET_BYTES
    || new TextEncoder().encode(text).length > MAX_PACKET_BYTES) {
    throw new Error('Use a UTF-8 JSON packet smaller than 256 KiB.');
  }
  if (!wellFormed(text)) throw new Error('Use well-formed Unicode without unpaired surrogate code units.');
  let position = 0;
  let nodes = 0;
  const fail = message => { throw new Error(message + ' At character ' + (position + 1) + '.'); };
  const space = () => { while (/[ \t\r\n]/.test(text[position] ?? '') && position < text.length) position++; };
  function string() {
    const start = position++;
    while (position < text.length) {
      const character = text[position++];
      if (character === '\\') { position++; continue; }
      if (character === '"') {
        try {
          const result = JSON.parse(text.slice(start, position));
          if (!wellFormed(result)) fail('Ill-formed Unicode is not allowed.');
          return result;
        } catch (error) {
          if (error?.message?.includes('Ill-formed Unicode')) throw error;
          fail('Invalid JSON string.');
        }
      }
    }
    fail('Unterminated JSON string.');
  }
  function value(depth) {
    space();
    if (++nodes > 10000 || depth > 16) fail('Packet is too complex.');
    if (text[position] === '"') return string();
    if (text[position] === '{') {
      position++;
      const result = Object.create(null);
      space();
      if (text[position] === '}') { position++; return result; }
      while (position < text.length) {
        space();
        if (text[position] !== '"') fail('Expected a quoted object key.');
        const key = string();
        if (forbiddenKeys.has(key)) fail('Reserved object key is not allowed.');
        if (own(result, key)) fail('Duplicate object key is not allowed.');
        space();
        if (text[position++] !== ':') fail('Expected a colon.');
        result[key] = value(depth + 1);
        space();
        if (text[position] === '}') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma.');
      }
      fail('Unterminated object.');
    }
    if (text[position] === '[') {
      position++;
      const result = [];
      space();
      if (text[position] === ']') { position++; return result; }
      while (position < text.length) {
        if (result.length >= 128) fail('An array exceeds 128 entries.');
        result.push(value(depth + 1));
        space();
        if (text[position] === ']') { position++; return result; }
        if (text[position++] !== ',') fail('Expected a comma.');
      }
      fail('Unterminated array.');
    }
    for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(token, position)) { position += token.length; return result; }
    }
    const match = text.slice(position).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) fail('Expected a JSON value.');
    position += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('Non-finite numbers are not allowed.');
    if (decimalKey(match[0]) !== decimalKey(String(number))) fail('Numeric precision would be lost. Use a representable value.');
    return number;
  }
  const result = value(0);
  space();
  if (position !== text.length) fail('Unexpected content after the packet.');
  if (!record(result)) fail('The packet must be a JSON object.');
  return result;
}

export function timestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, offset] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1970 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (offset === '-00:00') return null;
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 14 || Number(offset.slice(4)) > 59
    || (Number(offset.slice(1, 3)) === 14 && Number(offset.slice(4)) !== 0))) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}

export function safeSourceUrl(value) {
  if (typeof value !== 'string' || !wellFormed(value) || value.length > 2048
    || /[\u0000-\u0020\u007f-\u009f]|\p{Cf}/u.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(host)
      || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|alt|home\.arpa)$/.test(host)) return null;
    if (host.length > 253 || host.split('.').some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    return url.href;
  } catch { return null; }
}

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

export function validatePacket(packet, now = Date.now()) {
  const errors = [], gaps = [], warnings = [];
  const issueCounts = { errors: 0, gaps: 0, warnings: 0 };
  const add = (list, kind, path, message) => {
    issueCounts[kind]++;
    if (list.length < 80) list.push({ path, message });
  };
  const error = (path, message) => add(errors, 'errors', path, message);
  const gap = (path, message) => add(gaps, 'gaps', path, message);
  const warning = (path, message) => add(warnings, 'warnings', path, message);
  const finish = (horizonChecks = [], reviewRecorded = false) => {
    const omittedIssueCounts = {
      errors: issueCounts.errors - errors.length,
      gaps: issueCounts.gaps - gaps.length,
      warnings: issueCounts.warnings - warnings.length,
    };
    const valid = issueCounts.errors === 0;
    const complete = valid && issueCounts.gaps === 0;
    return {
      valid, complete, chartEligible: complete && reviewRecorded,
      errors, gaps, warnings,
      errorCount: issueCounts.errors, gapCount: issueCounts.gaps, warningCount: issueCounts.warnings,
      omittedIssueCounts, issuesTruncated: Object.values(omittedIssueCounts).some(count => count > 0),
      horizonChecks,
    };
  };
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    error('validationTime', 'A finite validation time is required.');
    return finish();
  }
  if (!portableJson(packet)) {
    error('packet', 'Use plain JSON data with enumerable data properties; accessors, symbols, hidden fields, shared references, and unsupported values are not allowed.');
    return finish();
  }
  try {
    if (new TextEncoder().encode(JSON.stringify(packet)).length > MAX_PACKET_BYTES) error('packet', 'The complete packet exceeds 256 KiB.');
  } catch { error('packet', 'Only serializable JSON data is supported.'); }
  function object(value, path, keys) {
    if (!record(value)) { error(path, 'Expected an object.'); return false; }
    if (Object.keys(value).some(key => !keys.includes(key))) error(path, 'Unexpected fields are not supported.');
    for (const key of keys) if (!own(value, key)) error(path + '.' + key, 'Required field is missing.');
    return true;
  }
  function text(value, path, required = true, limit = 5000) {
    if (typeof value !== 'string' || !wellFormed(value) || value.length > limit
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]|\p{Cf}/u.test(value ?? '')) {
      error(path, 'Use bounded visible plain text without hidden formatting controls.'); return false;
    }
    if (required && !value.trim()) gap(path, 'Information is UNKNOWN.');
    return true;
  }
  function list(value, path, maximum = 32) {
    if (!Array.isArray(value) || value.length > maximum) { error(path, 'Expected a bounded list.'); return false; }
    if (Object.keys(value).length !== value.length || Array.from({ length: value.length }, (_, index) => index).some(index => !own(value, index))) {
      error(path, 'Lists must contain every entry without holes or extra properties.'); return false;
    }
    return true;
  }
  function date(value, path, required = true) {
    if (value === '' && !required) return null;
    if (value === '') { gap(path, 'Capture time is UNKNOWN.'); return null; }
    const instant = timestamp(value);
    if (instant === null) error(path, 'Use a real ISO timestamp with seconds and an explicit UTC offset.');
    else if (instant > now + 300000) error(path, 'Timestamp is in the future.');
    return instant;
  }
  const rootKeys = ['schemaVersion', 'kind', 'preparedBy', 'asset', 'reference', 'thesis',
    'disconfirmingEvidence', 'invalidation', 'liquidity', 'risks', 'unknowns', 'method', 'sources', 'horizons', 'riskReview'];
  if (!object(packet, 'packet', rootKeys)) return finish();
  if (packet.schemaVersion !== 1) error('schemaVersion', 'Only packet schema version 1 is supported.');
  if (!['research', 'synthetic'].includes(packet.kind)) error('kind', 'Choose research or synthetic.');
  text(packet.preparedBy, 'preparedBy', true, 100);
  if (object(packet.asset, 'asset', ['symbol', 'name', 'quoteCurrency', 'venue'])) {
    for (const key of ['symbol', 'name', 'quoteCurrency', 'venue']) text(packet.asset[key], 'asset.' + key, true, 120);
    if (present(packet.asset.symbol) && !/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(packet.asset.symbol)) error('asset.symbol', 'Use 1 to 20 uppercase letters, numbers, periods, or hyphens.');
    if (present(packet.asset.quoteCurrency) && !/^[A-Z0-9]{2,12}$/.test(packet.asset.quoteCurrency)) error('asset.quoteCurrency', 'Use an uppercase currency symbol.');
  }
  let cutoff = null;
  if (object(packet.reference, 'reference', ['price', 'capturedAt', 'timezone'])) {
    if (packet.reference.price === null) gap('reference.price', 'Reference price is UNKNOWN.');
    else if (!finitePrice(packet.reference.price) || packet.reference.price === 0) error('reference.price', 'Use a finite positive price no greater than 1 trillion.');
    cutoff = date(packet.reference.capturedAt, 'reference.capturedAt');
    if (text(packet.reference.timezone, 'reference.timezone', true, 100)) {
      try { new Intl.DateTimeFormat('en-US', { timeZone: packet.reference.timezone }).format(); }
      catch { error('reference.timezone', 'Use an IANA timezone such as UTC or Asia/Singapore.'); }
    }
  }
  for (const key of ['thesis', 'disconfirmingEvidence', 'invalidation', 'liquidity']) text(packet[key], key);
  for (const key of ['risks', 'unknowns']) {
    if (list(packet[key], key)) packet[key].forEach((entry, index) => text(entry, key + '[' + index + ']'));
  }
  if (Array.isArray(packet.risks) && packet.risks.length === 0) gap('risks', 'Major risks have not been recorded.');
  const methodKeys = ['basis', 'description', 'sourceWindow', 'observationFrequency', 'sampleSize',
    'transformations', 'regimeAdjustment', 'eventAssumptions', 'limitations'];
  if (object(packet.method, 'method', methodKeys)) {
    if (!['empirical', 'model-derived', 'judgmental'].includes(packet.method.basis)) error('method.basis', 'Unsupported probability basis.');
    for (const key of methodKeys.filter(key => !['basis', 'sampleSize'].includes(key))) text(packet.method[key], 'method.' + key);
    if (packet.method.sampleSize !== null && (!Number.isSafeInteger(packet.method.sampleSize) || packet.method.sampleSize < 1)) error('method.sampleSize', 'Use a positive integer, or null when unknown or not applicable.');
    if (packet.method.sampleSize === null && packet.method.basis !== 'judgmental') gap('method.sampleSize', 'The empirical or model sample size is UNKNOWN.');
  }
  const sourceIds = new Set();
  let latestEvidence = cutoff;
  if (list(packet.sources, 'sources')) {
    if (packet.sources.length === 0) gap('sources', 'No dated evidence has been recorded.');
    packet.sources.forEach((source, index) => {
      const path = 'sources[' + index + ']';
      if (!object(source, path, ['id', 'title', 'url', 'type', 'publishedAt', 'capturedAt', 'claim', 'excerpt'])) return;
      text(source.id, path + '.id', true, 40);
      if (typeof source.id === 'string' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(source.id)) error(path + '.id', 'Use a simple source identifier.');
      if (sourceIds.has(source.id)) error(path + '.id', 'Source identifiers must be unique.');
      sourceIds.add(source.id);
      for (const key of ['title', 'claim', 'excerpt']) text(source[key], path + '.' + key, true, key === 'title' ? 200 : 5000);
      if (!safeSourceUrl(source.url)) error(path + '.url', 'Use a public HTTPS source URL without credentials or a custom port.');
      else if (packet.kind === 'research' && /(?:^|\.)example\.(com|org|net)$/.test(new URL(source.url).hostname)) gap(path + '.url', 'Example domains do not support real research.');
      if (!['primary', 'secondary'].includes(source.type)) error(path + '.type', 'Choose primary or secondary.');
      const published = date(source.publishedAt, path + '.publishedAt');
      const captured = date(source.capturedAt, path + '.capturedAt');
      if (published !== null && captured !== null && published > captured) error(path, 'Publication cannot be after capture.');
      if (captured !== null && cutoff !== null && captured > cutoff) error(path + '.capturedAt', 'Evidence must be captured by the common forecast cutoff.');
      if (captured !== null) latestEvidence = Math.max(latestEvidence ?? captured, captured);
    });
    if (packet.sources.length && !packet.sources.some(source => source?.type === 'primary')) gap('sources', 'No primary source has been recorded.');
  }
  const horizonChecks = [];
  if (list(packet.horizons, 'horizons', 4)) {
    if (packet.horizons.length !== 4) error('horizons', 'All four ordered horizons are required: 12h, 24h, 3d, 7d.');
    packet.horizons.forEach((horizon, index) => {
      const path = 'horizons[' + index + ']';
      if (!object(horizon, path, ['id', 'endAt', 'status', 'gapReason', 'scenarios'])) return;
      const expected = HORIZONS[index];
      if (horizon.id !== expected?.id) error(path + '.id', 'Horizons must appear once in the required order.');
      text(horizon.gapReason, path + '.gapReason', false);
      const ending = timestamp(horizon.endAt);
      if (horizon.endAt === '') gap(path + '.endAt', 'Horizon end time is UNKNOWN.');
      else if (ending === null) error(path + '.endAt', 'Use a real ISO timestamp with an explicit UTC offset.');
      else if (cutoff !== null && ending !== cutoff + expected.hours * 3600000) error(path + '.endAt', 'End time does not match the shared reference cutoff.');
      if (ending !== null && ending <= now && packet.kind !== 'synthetic') gap(path, 'This forecast horizon has elapsed. Refresh the packet.');
      if (!['complete', 'incomplete'].includes(horizon.status)) error(path + '.status', 'Choose complete or incomplete.');
      if (!list(horizon.scenarios, path + '.scenarios', 3)) return;
      if (horizon.status === 'incomplete') {
        if (!present(horizon.gapReason)) error(path + '.gapReason', 'Explain the missing evidence for an incomplete horizon.');
        if (horizon.scenarios.length) error(path + '.scenarios', 'An incomplete horizon must not contain invented probabilities.');
        gap(path, 'Forecast is INCOMPLETE.');
        horizonChecks.push({ id: horizon.id, total: null, status: 'incomplete' });
        return;
      }
      if (horizon.scenarios.length !== 3) error(path + '.scenarios', 'Supply Bear, Base, and Bull intervals.');
      if (present(horizon.gapReason)) error(path + '.gapReason', 'A complete horizon cannot retain an unresolved data gap.');
      let basisPoints = 0;
      horizon.scenarios.forEach((scenario, scenarioIndex) => {
        const scenarioPath = path + '.scenarios[' + scenarioIndex + ']';
        if (!object(scenario, scenarioPath, ['label', 'lower', 'upper', 'probability', 'driver', 'trigger', 'invalidation', 'confidence'])) return;
        if (scenario.label !== SCENARIOS[scenarioIndex]) error(scenarioPath + '.label', 'Scenario order must be Bear, Base, Bull.');
        if (!finitePrice(scenario.lower)) error(scenarioPath + '.lower', 'Use a finite nonnegative lower bound.');
        if (scenarioIndex === 0 && scenario.lower !== 0) error(scenarioPath + '.lower', 'The first interval must start at zero.');
        if (scenarioIndex === 2) {
          if (scenario.upper !== null) error(scenarioPath + '.upper', 'The final interval must be unbounded (null).');
        } else if (!finitePrice(scenario.upper) || scenario.upper <= scenario.lower) error(scenarioPath + '.upper', 'Use a finite upper bound greater than the lower bound.');
        if (scenarioIndex > 0 && scenario.lower !== horizon.scenarios[scenarioIndex - 1]?.upper) error(scenarioPath + '.lower', 'Adjacent intervals must meet exactly, without gaps or overlaps.');
        if (typeof scenario.probability !== 'number' || !Number.isFinite(scenario.probability)
          || scenario.probability < 0 || scenario.probability > 100) error(scenarioPath + '.probability', 'Use a numeric percentage from 0 to 100.');
        else if (Number(scenario.probability.toFixed(2)) !== scenario.probability) error(scenarioPath + '.probability', 'Use at most two decimal places in a percentage.');
        else basisPoints += Math.round(scenario.probability * 100);
        for (const key of ['driver', 'trigger', 'invalidation']) text(scenario[key], scenarioPath + '.' + key);
        if (!['low', 'medium', 'high'].includes(scenario.confidence)) error(scenarioPath + '.confidence', 'Use low, medium, or high.');
      });
      if (basisPoints !== 10000) error(path + '.scenarios', 'Probabilities must total exactly 100% within this horizon.');
      horizonChecks.push({ id: horizon.id, total: basisPoints / 100, status: 'complete' });
    });
  }
  let reviewRecorded = false;
  const review = packet.riskReview;
  if (object(review, 'riskReview', ['status', 'reviewer', 'reviewedAt', 'notes', 'sourceIds', 'assertions'])) {
    if (!['pending', 'deliver', 'deliver_with_warning', 'repair', 'withhold'].includes(review.status)) error('riskReview.status', 'Unsupported research review disposition.');
    const final = review.status !== 'pending';
    text(review.reviewer, 'riskReview.reviewer', final, 100);
    text(review.notes, 'riskReview.notes', final);
    const reviewed = date(review.reviewedAt, 'riskReview.reviewedAt', final);
    if (final && present(review.reviewer) && present(packet.preparedBy)
      && aliasKey(review.reviewer) === aliasKey(packet.preparedBy)) error('riskReview.reviewer', 'The preparer cannot be their own independent reviewer.');
    if (reviewed !== null && latestEvidence !== null && reviewed < latestEvidence) error('riskReview.reviewedAt', 'The review predates the evidence or reference cutoff.');
    if (list(review.sourceIds, 'riskReview.sourceIds')) {
      if (new Set(review.sourceIds).size !== review.sourceIds.length) error('riskReview.sourceIds', 'Review source identifiers must be unique.');
      if (review.sourceIds.some(id => typeof id !== 'string' || !sourceIds.has(id))) error('riskReview.sourceIds', 'Review references an unknown source.');
      if (final && (review.sourceIds.length !== sourceIds.size || sourceIds.size === 0)) gap('riskReview.sourceIds', 'The review must account for every recorded source.');
    }
    let hasWarningAssertion = false;
    if (list(review.assertions, 'riskReview.assertions', 5)) {
      const assertionIds = new Set();
      for (const [index, assertion] of review.assertions.entries()) {
        const path = 'riskReview.assertions[' + index + ']';
        if (!object(assertion, path, ['id', 'result', 'evidence', 'severity', 'repair'])) continue;
        if (!REVIEW_ASSERTIONS.some(item => item.id === assertion.id) || assertionIds.has(assertion.id)) error(path + '.id', 'Use a unique, supported review assertion.');
        assertionIds.add(assertion.id);
        if (!['PASS', 'WARN', 'FAIL', 'UNKNOWN'].includes(assertion.result)) error(path + '.result', 'Use PASS, WARN, FAIL, or UNKNOWN.');
        if (assertion.result === 'WARN') hasWarningAssertion = true;
        if (!['low', 'medium', 'high'].includes(assertion.severity)) error(path + '.severity', 'Use low, medium, or high.');
        text(assertion.evidence, path + '.evidence', final);
        text(assertion.repair, path + '.repair', final && assertion.result !== 'PASS');
        if (['deliver', 'deliver_with_warning'].includes(review.status) && ['FAIL', 'UNKNOWN'].includes(assertion.result)) gap(path, 'An unresolved or failed review assertion blocks chart display.');
        if (review.status === 'deliver' && assertion.result === 'WARN') error(path, 'A warning assertion requires a warning disposition.');
      }
      if (final && assertionIds.size !== REVIEW_ASSERTIONS.length) gap('riskReview.assertions', 'All five manual review assertions are required.');
    }
    if (review.status === 'deliver_with_warning' && !hasWarningAssertion
      && !(Array.isArray(packet.unknowns) && packet.unknowns.length)) {
      error('riskReview.status', 'A warning disposition requires at least one WARN assertion or an unresolved unknown.');
    }
    if (review.status === 'pending') gap('riskReview', 'Independent review has not been recorded.');
    if (['repair', 'withhold'].includes(review.status)) gap('riskReview', 'The submitted review blocks delivery.');
    if (review.status === 'deliver' && Array.isArray(packet.unknowns) && packet.unknowns.length) gap('riskReview', 'Unresolved unknowns require a warning disposition or further research.');
    reviewRecorded = ['deliver', 'deliver_with_warning'].includes(review.status) && present(review.reviewer) && reviewed !== null;
  }
  if (packet.kind === 'synthetic') warning('kind', 'SYNTHETIC EXAMPLE. Prices, probabilities, people, sources, and review are fictional.');
  warning('evidence', 'Source truth, forecast accuracy, and reviewer identity are not authenticated by this application.');
  return finish(horizonChecks, reviewRecorded);
}

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
