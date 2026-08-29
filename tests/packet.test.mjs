import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PACKET_BYTES, MAX_JSON_INPUT_BYTES, HORIZONS, parsePacket, validatePacket, blankPacket, timestamp,
  endAt, safeSourceUrl, formatPrice, formatDate, intervalLabel, returnLabel,
  chartThresholds, exportMarkdown,
} from '../web/packet.js';
import { examplePacket } from '../web/example.js';

const NOW = Date.parse('2026-08-20T10:00:00Z');
function research() {
  const packet = examplePacket();
  packet.kind = 'research';
  packet.sources[0].url = 'https://www.iana.org/domains/reserved';
  packet.sources[1].url = 'https://www.rfc-editor.org/rfc/rfc2606';
  return packet;
}
const validate = packet => validatePacket(packet, NOW);
function rejectMutations(mutations, complete = false) {
  for (const mutate of mutations) {
    const packet = research(); mutate(packet);
    assert.equal(validate(packet)[complete ? 'chartEligible' : 'valid'], false, mutate.toString());
  }
}

test('the fictional example is complete; a blank packet stays incomplete', () => {
  assert.equal(validate(examplePacket()).chartEligible, true);
  assert.ok(validate(examplePacket()).warnings.some(item => item.message.includes('fictional')));
  const blank = validate(blankPacket());
  assert.equal(blank.valid, true);
  assert.equal(blank.complete, false);
  assert.ok(blank.gaps.some(item => item.path === 'reference.price'));
  assert.deepEqual(chartThresholds(blankPacket(), NOW), []);
});

test('JSON round trips preserve values and reject duplicate or reserved keys', () => {
  const parsed = parsePacket(JSON.stringify(examplePacket()));
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(validate(parsed).complete, true);
  assert.equal(JSON.stringify(parsed), JSON.stringify(examplePacket()));
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}',
    '{"__proto__":{"polluted":true}}', '{"nested":{"constructor":{}}}', '{"prototype":{}}']) {
    assert.throws(() => parsePacket(text), /Duplicate|Reserved/);
  }
  assert.equal({}.polluted, undefined);
});

test('malformed, overlarge, deep, and lossy numeric inputs are rejected', () => {
  for (const text of ['[]', 'null', 'true', '{} false', '{"x":01}', '{"x":1,}', '{"x":[1,]}',
    '{"x":"\\u0000}', '{"x":NaN}', '{"x":Infinity}', '{"x":1e999}',
    '{"x":9007199254740993}', '{"x":1e-999}', '{"x":0.1234567890123456789}',
    '{"x":"\\uD800"}', '{"x":"\\uDC00"}', '{"x":"' + '\ud800' + '"}']) {
    assert.throws(() => parsePacket(text), undefined, text);
  }
  assert.throws(() => parsePacket('{"x":"' + 'a'.repeat(MAX_JSON_INPUT_BYTES) + '"}'), /320 KiB/);
  assert.throws(() => parsePacket('{"x":' + '['.repeat(18) + '0' + ']'.repeat(18) + '}'), /complex/);
  assert.throws(() => parsePacket('{"x":[' + Array(129).fill('0').join(',') + ']}'), /128/);
  assert.equal(parsePacket('{"x":4e-9,"y":100.000,"z":1.20e2}').x, 4e-9);
  assert.equal(parsePacket('{"x":4e-9,"y":100.000,"z":1.20e2}').z, 120);
});

test('negative zero is rejected before JSON export can erase its sign', () => {
  for (const text of ['{"x":-0}', '{"x":-0.0e5}']) assert.throws(() => parsePacket(text), /Negative zero/);
  for (const mutate of [
    packet => { packet.horizons[0].scenarios[0].lower = -0; },
    packet => { packet.horizons[0].scenarios[0].probability = -0; packet.horizons[0].scenarios[1].probability += 25; },
  ]) {
    const packet = research(); mutate(packet);
    assert.equal(validate(packet).valid, false);
    assert.deepEqual(chartThresholds(packet, NOW), []);
  }
});

test('formatted exports remain importable at the semantic packet-size boundary', () => {
  const packet = examplePacket();
  packet.sources = Array.from({ length: 32 }, (_, index) => ({
    id: 'source-' + index, title: 'Source ' + index, url: 'https://example.com/source-' + index,
    type: 'primary', publishedAt: '2026-08-20T07:00:00Z', capturedAt: '2026-08-20T08:00:00Z',
    claim: 'c'.repeat(3890), excerpt: 'e'.repeat(3890),
  }));
  packet.riskReview.sourceIds = packet.sources.map(source => source.id);
  const compact = JSON.stringify(packet);
  const formatted = JSON.stringify(packet, null, 2) + '\n';
  const bytes = value => new TextEncoder().encode(value).length;
  assert.ok(bytes(compact) <= MAX_PACKET_BYTES);
  assert.ok(bytes(formatted) > MAX_PACKET_BYTES && bytes(formatted) <= MAX_JSON_INPUT_BYTES);
  const parsed = parsePacket(formatted);
  assert.equal(JSON.stringify(parsed), compact);
  assert.equal(validate(parsed).valid, true);
});

test('missing and mistyped fields fail without throwing or enabling a chart', () => {
  const sample = examplePacket();
  for (const key of Object.keys(sample)) {
    const missing = structuredClone(sample); delete missing[key];
    assert.equal(validate(missing).valid, false, 'missing ' + key);
    for (const value of [null, true, 42]) {
      assert.equal(validate({ ...sample, [key]: value }).chartEligible, false, key + ': ' + value);
    }
  }
  for (const node of ['asset', 'reference', 'method', 'riskReview']) {
    const packet = examplePacket(); packet[node].unsupported = true;
    assert.equal(validate(packet).valid, false, node);
  }
  for (const value of [null, [], 3, 'text', undefined]) assert.equal(validate(value).valid, false);
});

test('validation accepts only portable JSON topology without invoking accessors', () => {
  const hidden = research();
  Object.defineProperty(hidden.asset, 'symbol', { value: 'DEMO', enumerable: false });
  assert.equal(validate(hidden).valid, false);

  const symbolic = research();
  symbolic.asset[Symbol('hidden')] = 'not portable';
  assert.equal(validate(symbolic).valid, false);

  let reads = 0;
  const accessor = research();
  Object.defineProperty(accessor.asset, 'symbol', {
    enumerable: true,
    get() { reads++; return reads === 1 ? 'DEMO' : 'CHANGED'; },
  });
  const report = validate(accessor);
  assert.equal(report.valid, false);
  assert.equal(report.errors[0].path, 'packet');
  assert.equal(reads, 0);
  assert.throws(() => exportMarkdown(accessor, NOW), /structural errors/);
  assert.equal(reads, 0);
});

test('calendar dates and explicit offsets are checked without normalization', () => {
  for (const value of ['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z',
    '2026-08-20T24:00:00Z', '2026-08-20T09:00:60Z', '2026-08-20T09:00:00',
    '2026-08-20', '2026-08-20T09:00:00-00:00',
    '2026-08-20T09:00:00+14:01', '2026-08-20T09:00:00+08:99']) {
    assert.equal(timestamp(value), null, value);
  }
  assert.equal(timestamp('2024-02-29T08:00:00+08:00'), Date.parse('2024-02-29T00:00:00Z'));
  assert.equal(formatDate('2026-08-20T09:00:00Z', 'Asia/Singapore'),
    '20-08-2026 17:00:00 Asia/Singapore (UTC+08:00; 2026-08-20T09:00:00.000Z)');
  assert.equal(formatDate('invalid'), 'UNKNOWN');
  assert.equal(formatDate('2026-08-20T09:00:00Z', 'Not/AZone'), 'UNKNOWN');
  assert.equal(endAt('invalid', 12), '');
});

test('formatted timestamps distinguish repeated wall-clock times across a DST fold', () => {
  assert.equal(formatDate('2026-10-25T00:30:00Z', 'Europe/London'),
    '25-10-2026 01:30:00 Europe/London (UTC+01:00; 2026-10-25T00:30:00.000Z)');
  assert.equal(formatDate('2026-10-25T01:30:00Z', 'Europe/London'),
    '25-10-2026 01:30:00 Europe/London (UTC+00:00; 2026-10-25T01:30:00.000Z)');
});

test('source links exclude active schemes, credentials, private literals, and custom ports', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'http://example.com',
    'https://user:password@example.com', 'https://127.0.0.1', 'https://[::1]',
    'https://2130706433', 'https://host.internal', 'https://host.local',
    'https://source.example', 'https://evidence.source.example',
    'https://source.onion', 'https://router.home.arpa', 'https://anything.alt',
    'https://example.com:8443', 'https://example.com/\npath', '//example.com']) {
    assert.equal(safeSourceUrl(value), null, value);
  }
  assert.equal(safeSourceUrl('https://www.iana.org/' + '\ud800'), null);
  assert.equal(safeSourceUrl('https://www.iana.org/' + '\u0085'), null);
  assert.equal(safeSourceUrl('https://www.iana.org/domains/reserved#example'),
    'https://www.iana.org/domains/reserved#example');
  assert.equal(safeSourceUrl('https://例え.com/café'), 'https://xn--r8jz45g.com/caf%C3%A9');
});

test('look-ahead evidence, duplicate sources, invalid zones, and future reviews fail', () => {
  rejectMutations([
    p => { p.sources[0].publishedAt = '2026-08-20T08:40:00Z'; },
    p => { p.sources[0].capturedAt = '2026-08-20T09:01:00Z'; },
    p => { p.sources[0].publishedAt = '2026-08-21T00:00:00Z'; },
    p => { p.sources[1].id = p.sources[0].id; },
    p => { p.reference.timezone = 'Not/AZone'; },
    p => { p.riskReview.reviewedAt = '2026-08-20T08:59:00Z'; },
    p => { p.riskReview.reviewedAt = '2026-08-20T11:00:00Z'; },
  ]);
  const exampleAsResearch = examplePacket(); exampleAsResearch.kind = 'research';
  assert.equal(validate(exampleAsResearch).complete, false);
  const noPrimary = research(); noPrimary.sources.forEach(source => { source.type = 'secondary'; });
  assert.equal(validate(noPrimary).chartEligible, false);
});

test('the four horizons share one exact cutoff, order, and duration, and expire', () => {
  const packet = research();
  assert.equal(validate(packet).chartEligible, true);
  assert.deepEqual(packet.horizons.map(item => item.endAt),
    HORIZONS.map(item => endAt(packet.reference.capturedAt, item.hours)));
  rejectMutations([p => p.horizons.pop(), p => p.horizons.reverse(),
    p => { p.horizons[1].id = '12h'; }, p => { p.horizons[0].endAt = '2026-08-20T21:00:01Z'; }]);
  const expired = validatePacket(packet, Date.parse('2026-08-20T21:00:00Z'));
  assert.equal(expired.valid, true);
  assert.equal(expired.chartEligible, false);
  assert.ok(expired.gaps.some(item => item.message.includes('elapsed')));
  assert.equal(validatePacket(examplePacket(), Date.parse('2030-01-01T00:00:00Z')).chartEligible, true);
});

test('scenario partitions cover zero through the unbounded tail without gaps or overlaps', () => {
  const mutations = [
    s => { s[0].lower = 1; }, s => { s[0].upper = 0; }, s => { s[1].lower += 1; },
    s => { s[1].lower -= 1; }, s => { s[1].upper = s[1].lower; },
    s => { s[2].upper = 1e12; }, s => { s[2].lower = Infinity; }, s => { s[0].label = 'Bull'; },
  ];
  rejectMutations(mutations.map(mutate => packet => mutate(packet.horizons[0].scenarios)));
  assert.equal(intervalLabel({ lower: 0, upper: 94 }), '0 ≤ price < 94');
  assert.equal(intervalLabel({ lower: 106, upper: null }), '106 ≤ price');
});

test('percentage arithmetic uses exact hundredths and refuses near-100 totals', () => {
  for (const probabilities of [[25.000000005, 50, 25], [33.33, 33.33, 33.33],
    [25, 50, 24.99], [25, 50, 25.01], [NaN, 50, 50], ['25', 50, 25], [-1, 51, 50]]) {
    const packet = research();
    packet.horizons[0].scenarios.forEach((s, i) => { s.probability = probabilities[i]; });
    assert.equal(validate(packet).valid, false, String(probabilities));
  }
  for (const probabilities of [[33.33, 33.33, 33.34], [0, 100, 0], [12.34, 43.21, 44.45]]) {
    const packet = research();
    packet.horizons[0].scenarios.forEach((s, i) => { s.probability = probabilities[i]; });
    assert.equal(validate(packet).complete, true, String(probabilities));
    assert.equal(validate(packet).horizonChecks[0].total, 100);
  }
});

test('incomplete horizons require a reason and cannot carry probability guesses', () => {
  const packet = research();
  packet.horizons[0] = { ...packet.horizons[0], status: 'incomplete', gapReason: 'Insufficient observations', scenarios: [] };
  assert.equal(validate(packet).valid, true);
  assert.equal(validate(packet).chartEligible, false);
  packet.horizons[0].gapReason = '';
  assert.equal(validate(packet).valid, false);
  packet.horizons[0].gapReason = 'Missing';
  packet.horizons[0].scenarios = examplePacket().horizons[0].scenarios;
  assert.equal(validate(packet).valid, false);
});

test('all five review assertions and a consistent disposition are required for charts', () => {
  rejectMutations([
    p => { p.riskReview.status = 'pending'; }, p => { p.riskReview.status = 'repair'; },
    p => { p.riskReview.status = 'withhold'; }, p => { p.riskReview.assertions.pop(); },
    p => { p.riskReview.assertions[0].result = 'FAIL'; },
    p => { p.riskReview.assertions[0].result = 'UNKNOWN'; },
    p => { p.riskReview.assertions[0].evidence = ''; }, p => { p.riskReview.assertions[0].repair = ''; },
    p => { p.riskReview.sourceIds = []; }, p => { p.riskReview.reviewer = ''; },
  ], true);
  const passed = research(); passed.unknowns = []; passed.riskReview.status = 'deliver';
  passed.riskReview.assertions.forEach(a => { a.result = 'PASS'; a.repair = ''; });
  assert.equal(validate(passed).chartEligible, true);
  passed.riskReview.assertions[0].result = 'WARN';
  assert.equal(validate(passed).valid, false);
});

test('a warning disposition identifies a warning assertion or unresolved unknown', () => {
  const packet = research();
  packet.unknowns = [];
  packet.riskReview.status = 'deliver_with_warning';
  packet.riskReview.assertions.forEach(assertion => { assertion.result = 'PASS'; assertion.repair = ''; });
  assert.equal(validate(packet).valid, false);
  assert.ok(validate(packet).errors.some(issue => issue.path === 'riskReview.status'));

  packet.unknowns = ['A material input remains unresolved.'];
  assert.equal(validate(packet).chartEligible, true);
  packet.unknowns = [];
  packet.riskReview.assertions[0].result = 'WARN';
  packet.riskReview.assertions[0].repair = 'Monitor the unresolved warning.';
  assert.equal(validate(packet).chartEligible, true);
});

test('reviewer aliases, source coverage, assertion IDs, and method samples are checked', () => {
  rejectMutations([
    p => { p.riskReview.reviewer = ' ' + p.preparedBy.toUpperCase() + ' '; },
    p => { p.riskReview.sourceIds.push(p.riskReview.sourceIds[0]); },
    p => { p.riskReview.sourceIds[0] = 'missing-source'; },
    p => { p.riskReview.assertions[1].id = p.riskReview.assertions[0].id; },
    p => { p.riskReview.assertions[0].id = 'fake-assertion'; },
  ]);
  const empirical = research(); empirical.method.basis = 'empirical';
  assert.equal(validate(empirical).chartEligible, false);
  empirical.method.sampleSize = 120;
  assert.equal(validate(empirical).chartEligible, true);
});

test('the chart helper validates actual inputs, never a caller-supplied verdict', () => {
  assert.deepEqual(chartThresholds(examplePacket(), NOW), [
    { id: '12h', bearBaseBoundary: 94, baseBullBoundary: 106 },
    { id: '24h', bearBaseBoundary: 90, baseBullBoundary: 112 },
    { id: '3d', bearBaseBoundary: 84, baseBullBoundary: 121 },
    { id: '7d', bearBaseBoundary: 74, baseBullBoundary: 138 },
  ]);
  assert.deepEqual(chartThresholds(blankPacket(), { chartEligible: true }), []);
  assert.equal(validatePacket(examplePacket(), NaN).valid, false);
});

test('price display preserves tiny and large prices; returns disclose rounding', () => {
  for (const value of [4e-9, 1.234567891234e-8, .0000123456789, 999999999999.125, 1e12]) {
    assert.equal(Number(formatPrice(value).replaceAll(',', '')), value);
  }
  assert.equal(formatPrice(null), 'UNKNOWN');
  assert.equal(formatPrice(Infinity), 'UNKNOWN');
  assert.equal(returnLabel({ lower: 0, upper: 94 }, 100), '≈ -100% to below -6%');
});

test('Markdown includes evidence and gaps while escaping imported markup', () => {
  const packet = research();
  packet.thesis = '\t~~~\n- item\n---\n1. numbered\n<img src=x onerror=alert(1)> [click](javascript:alert(1)) | # Heading';
  const markdown = exportMarkdown(packet, NOW);
  for (const text of ['Evidence and review identity are unverified', '\\~\\~\\~ \\- item \\-\\-\\- 1\\. numbered', '\\<img', '\\[click\\]',
    'Asset name: Demonstration asset', 'Captured:', '2026\\-08\\-20T09\\:00\\:00\\.000Z',
    'Reviewed source IDs: example\\-upgrade, example\\-activity', '## 12 hours', '## 7 days', 'authority']) assert.ok(markdown.includes(text), text);
  assert.doesNotMatch(markdown, /(^|[^\\])<img/);
  assert.doesNotMatch(markdown, /\n(?:~~~|---|- item| {4})/);
  const incomplete = exportMarkdown(blankPacket(), NOW);
  assert.ok(incomplete.includes('INCOMPLETE'));
  assert.ok(incomplete.includes('UNKNOWN'));
  packet.horizons[0].scenarios[0].probability = 99;
  assert.throws(() => exportMarkdown(packet, NOW), /structural errors/);
});

test('bounded issue samples report exact totals and Markdown discloses omitted gaps', () => {
  const packet = research();
  packet.sources = Array.from({ length: 32 }, (_, index) => ({
    id: 'source-' + index, title: '', url: 'https://www.iana.org/source/' + index,
    type: 'primary', publishedAt: '', capturedAt: '', claim: '', excerpt: '',
  }));
  packet.riskReview = blankPacket().riskReview;
  const report = validate(packet);
  assert.equal(report.valid, true);
  assert.equal(report.gaps.length, 80);
  assert.equal(report.gapCount, 161);
  assert.equal(report.omittedIssueCounts.gaps, 81);
  assert.equal(report.errorCount, 0);
  assert.equal(report.warningCount, 1);
  assert.equal(report.issuesTruncated, true);
  const markdown = exportMarkdown(packet, NOW);
  assert.ok(markdown.includes('81 additional validation gaps omitted from this bounded list'));
  assert.ok(markdown.includes('161 total'));

  const broken = research();
  broken.sources = Array.from({ length: 32 }, (_, index) => ({
    id: 'invalid id ' + index, title: 1, url: 'http://localhost/' + index,
    type: 'unsupported', publishedAt: 'invalid', capturedAt: 'invalid', claim: false, excerpt: null,
  }));
  broken.riskReview = blankPacket().riskReview;
  const errors = validate(broken);
  assert.equal(errors.valid, false);
  assert.equal(errors.errors.length, 80);
  assert.equal(errors.errorCount, 256);
  assert.equal(errors.omittedIssueCounts.errors, 176);
  assert.equal(errors.gapCount, 2);
  assert.equal(errors.warningCount, 1);
  assert.equal(errors.issuesTruncated, true);
});

test('sparse arrays, nonnumeric clocks, and oversized object packets fail closed', () => {
  for (const field of ['horizons', 'sources', 'risks', 'unknowns']) {
    const packet = research(); packet[field] = new Array(field === 'horizons' ? 4 : 1);
    assert.equal(validate(packet).valid, false, field);
    assert.deepEqual(chartThresholds(packet, NOW), []);
  }
  const sparse = research();
  sparse.horizons[0].scenarios.pop();
  sparse.horizons[0].scenarios.length = 3;
  sparse.horizons[0].scenarios[0].probability = 50;
  sparse.horizons[0].scenarios[1].probability = 50;
  assert.equal(validate(sparse).valid, false);
  for (const clock of [Symbol('now'), 1n, null, {}, '2026-08-20']) {
    assert.equal(validatePacket(examplePacket(), clock).valid, false);
  }
  const huge = research();
  huge.sources = Array.from({ length: 32 }, (_, i) => ({ ...huge.sources[0], id: 'source-' + i, claim: 'a'.repeat(5000), excerpt: 'b'.repeat(5000) }));
  huge.riskReview.sourceIds = huge.sources.map(source => source.id);
  assert.ok(validate(huge).errors.some(item => item.path === 'packet'));
});

test('hidden formatting and normalized self-review aliases are rejected', () => {
  for (const value of ['A\u200Blice', 'Alice\u202E', 'Alice\u00AD', 'Alice\u0600', 'Alice\u034F', 'Alice\uFE0F']) {
    const packet = research(); packet.riskReview.reviewer = value;
    assert.equal(validate(packet).valid, false);
  }
  const hiddenOnly = research(); hiddenOnly.thesis = '\u034F';
  assert.equal(validate(hiddenOnly).valid, false);
  const packet = research(); packet.preparedBy = 'Alice'; packet.riskReview.reviewer = 'Ａｌｉｃｅ';
  assert.equal(validate(packet).valid, false);
  for (const reviewer of ['Alice  Smith', 'Alice\tSmith', 'Alice\nSmith', 'Alice\u00a0\u202fSmith']) {
    const spaced = research(); spaced.preparedBy = 'Alice Smith'; spaced.riskReview.reviewer = reviewer;
    assert.equal(validate(spaced).valid, false, JSON.stringify(reviewer));
  }
  packet.riskReview.reviewer = 'Independent reviewer';
  packet.sources[0].title = 'Official \u202Esource\u202C';
  assert.equal(validate(packet).valid, false);
  packet.sources[0].title = 'Official source';
  packet.thesis = '\ud800';
  assert.equal(validate(packet).valid, false);
  packet.thesis = 'Well-formed thesis';
  packet.sources[0].url = 'https://www.iana.org/' + '\ud800';
  assert.equal(validate(packet).valid, false);
  assert.equal(safeSourceUrl('https://foo..bar.com/x'), null);
  assert.equal(safeSourceUrl('https://foo.-bar.com/x'), null);
});

test('editor-bound text rejects line endings its controls cannot preserve', () => {
  for (const mutate of [
    packet => { packet.asset.name = 'Bitcoin\nCash'; },
    packet => { packet.asset.venue = 'Venue\rComposite'; },
    packet => { packet.preparedBy = 'Researcher\nAlias'; },
    packet => { packet.sources[0].title = 'Source\nTitle'; },
    packet => { packet.riskReview.reviewer = 'Review\nAlias'; },
  ]) {
    const packet = research(); mutate(packet);
    assert.equal(validate(packet).valid, false);
  }
  const packet = research(); packet.sources[0].excerpt = 'First line\r\nSecond line';
  assert.equal(validate(packet).valid, false);
});

test('overflowing derived returns stay explicitly unknown instead of showing infinity', () => {
  assert.equal(returnLabel({ lower: 94, upper: 106 }, Number.MIN_VALUE), 'UNKNOWN (numeric overflow)');
  assert.equal(returnLabel({ lower: 0, upper: Number.MIN_VALUE }, Number.MIN_VALUE), '≈ -100% to below 0%');
});
