import { MAX_PACKET_BYTES, MAX_JSON_INPUT_BYTES, HORIZONS, SCENARIOS, REVIEW_ASSERTIONS } from './packet-constants.js';
import { forbiddenKeys, own, record, present, aliasKey, finitePrice, wellFormed, portableJson } from './packet-parse.js';

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

function sourceUrlIdentity(value) {
  const safe = safeSourceUrl(value);
  if (safe === null) return null;
  const url = new URL(safe);
  const normalizeEscapes = component => component.replace(/%[0-9a-f]{2}/gi, escape => {
    const character = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return /^[A-Za-z0-9._~-]$/.test(character) ? character : escape.toUpperCase();
  });
  const queryIndex = safe.indexOf('?');
  const fragmentIndex = safe.indexOf('#');
  const hasQuery = queryIndex !== -1 && (fragmentIndex === -1 || queryIndex < fragmentIndex);
  const normalizedQuery = hasQuery
    ? normalizeEscapes(safe.slice(queryIndex, fragmentIndex === -1 ? undefined : fragmentIndex))
    : '';
  return url.origin + normalizeEscapes(url.pathname) + normalizedQuery;
}

// Decode ACE labels independently of platform URL acceptance. RFC 3492 section
// 6.2: https://www.rfc-editor.org/rfc/rfc3492#section-6.2
function validEncodedSourceLabel(label) {
  if (!label.startsWith('xn--')) return true;
  const input = label.slice(4), delimiter = input.lastIndexOf('-');
  const output = delimiter < 0 ? [] : [...input.slice(0, delimiter)].map(char => char.codePointAt(0));
  let cursor = delimiter < 0 ? 0 : delimiter + 1, codePoint = 128, insertion = 0, bias = 72;
  while (cursor < input.length) {
    const previous = insertion;
    let weight = 1;
    for (let step = 36; ; step += 36) {
      if (cursor >= input.length) return false;
      const char = input.charCodeAt(cursor++);
      const digit = char >= 97 && char <= 122 ? char - 97 : char >= 48 && char <= 57 ? char - 22 : 36;
      if (digit >= 36) return false;
      insertion += digit * weight;
      if (!Number.isSafeInteger(insertion)) return false;
      const threshold = Math.max(1, Math.min(26, step - bias));
      if (digit < threshold) break;
      weight *= 36 - threshold;
      if (!Number.isSafeInteger(weight)) return false;
    }
    const length = output.length + 1;
    let delta = Math.floor((insertion - previous) / (previous === 0 ? 700 : 2));
    delta += Math.floor(delta / length);
    bias = 0;
    while (delta > 455) { delta = Math.floor(delta / 35); bias += 36; }
    bias += Math.floor(36 * delta / (delta + 38));
    codePoint += Math.floor(insertion / length);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) return false;
    insertion %= length;
    output.splice(insertion++, 0, codePoint);
  }
  if (!output.some(point => point >= 128)) return false;
  const decoded = String.fromCodePoint(...output);
  if (/[\p{C}\p{Z}]|\p{Default_Ignorable_Code_Point}/u.test(decoded)) return false;
  // Re-encode the Unicode form to reject noncanonical or otherwise invalid IDNA.
  return new URL('https://' + decoded + '.invalid').hostname === label + '.invalid';
}

export function safeSourceUrl(value) {
  if (typeof value !== 'string' || !wellFormed(value) || value.length > 2048
    || /[\u0000-\u0020\u007f-\u009f]|\p{Cf}|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const labels = host.split('.');
    const topLevel = labels.at(-1) ?? '';
    const publicTopLevel = /^[a-z]{2,63}$/.test(topLevel)
      || /^xn--[a-z0-9-]{1,59}$/.test(topLevel);
    if (url.protocol !== 'https:' || url.username || url.password || url.port
      || labels.length < 2 || !publicTopLevel
      || /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion|alt|home\.arpa)$/.test(host)) return null;
    if (host.length > 253 || labels.some(label => label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return null;
    if (labels.some(label => !validEncodedSourceLabel(label))) return null;
    return url.href;
  } catch { return null; }
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
      || /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]|\p{Cf}|\p{Default_Ignorable_Code_Point}/u.test(value ?? '')) {
      error(path, 'Use bounded visible plain text without hidden formatting controls.'); return false;
    }
    if (required && !value.trim()) gap(path, 'Information is UNKNOWN.');
    return true;
  }
  function line(value, path, required = true, limit = 5000) {
    const valid = text(value, path, required, limit);
    if (valid && /[\r\n]/.test(value)) { error(path, 'Use one line of plain text.'); return false; }
    return valid;
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
  line(packet.preparedBy, 'preparedBy', true, 100);
  if (object(packet.asset, 'asset', ['symbol', 'name', 'quoteCurrency', 'venue'])) {
    for (const key of ['symbol', 'name', 'quoteCurrency', 'venue']) line(packet.asset[key], 'asset.' + key, true, 120);
    if (present(packet.asset.symbol) && !/^[A-Z0-9][A-Z0-9.-]{0,19}$/.test(packet.asset.symbol)) error('asset.symbol', 'Use 1 to 20 uppercase letters, numbers, periods, or hyphens.');
    if (present(packet.asset.quoteCurrency) && !/^[A-Z0-9]{2,12}$/.test(packet.asset.quoteCurrency)) error('asset.quoteCurrency', 'Use an uppercase currency symbol.');
  }
  let cutoff = null;
  if (object(packet.reference, 'reference', ['price', 'capturedAt', 'timezone'])) {
    if (packet.reference.price === null) gap('reference.price', 'Reference price is UNKNOWN.');
    else if (!finitePrice(packet.reference.price) || packet.reference.price === 0) error('reference.price', 'Use a finite positive price no greater than 1 trillion.');
    cutoff = date(packet.reference.capturedAt, 'reference.capturedAt');
    if (line(packet.reference.timezone, 'reference.timezone', true, 100)) {
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
  const sourceUrls = new Map();
  let latestEvidence = cutoff;
  if (list(packet.sources, 'sources')) {
    if (packet.sources.length === 0) gap('sources', 'No dated evidence has been recorded.');
    packet.sources.forEach((source, index) => {
      const path = 'sources[' + index + ']';
      if (!object(source, path, ['id', 'title', 'url', 'type', 'publishedAt', 'capturedAt', 'claim', 'excerpt'])) return;
      line(source.id, path + '.id', true, 40);
      if (typeof source.id === 'string' && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/.test(source.id)) error(path + '.id', 'Use a simple source identifier.');
      if (sourceIds.has(source.id)) error(path + '.id', 'Source identifiers must be unique.');
      sourceIds.add(source.id);
      line(source.title, path + '.title', true, 200);
      for (const key of ['claim', 'excerpt']) text(source[key], path + '.' + key);
      const sourceUrl = safeSourceUrl(source.url);
      if (!sourceUrl) error(path + '.url', 'Use a public HTTPS source URL without credentials or a custom port.');
      else {
        const identity = sourceUrlIdentity(sourceUrl);
        const firstIndex = sourceUrls.get(identity);
        if (firstIndex !== undefined) error(path + '.url', 'Source URL ' + path + '.url duplicates sources[' + firstIndex + '].url after canonicalization.');
        else sourceUrls.set(identity, index);
        if (packet.kind === 'research' && /(?:^|\.)example\.(com|org|net)$/.test(new URL(sourceUrl).hostname)) gap(path + '.url', 'Example domains do not support real research.');
      }
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
    line(review.reviewer, 'riskReview.reviewer', final, 100);
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
