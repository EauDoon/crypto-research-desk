import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpecialist } from '../tools/check-specialist.mjs';

const work = fileURLToPath(new URL('../work/', import.meta.url));
const checker = fileURLToPath(new URL('../tools/check-specialist.mjs', import.meta.url));
const runChecker = (...args) => spawnSync(process.execPath, [checker, ...args], { encoding: 'utf8' });
// Temporary inputs live under the ignored work/ folder and are removed after each test.
async function scratch(t) {
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(join(work, 'specialist-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const quant = JSON.parse(await readFile(new URL('../examples/incomplete-quant.json', import.meta.url), 'utf8'));
const risk = { verdict: 'PASS', delivery: 'deliver', notes: 'Synthetic check only.', assertions:
  ['authority', 'evidence', 'scenarios', 'liquidity', 'invalidation'].map(id => ({ id, result: 'PASS', evidence: 'Synthetic evidence.', severity: 'low', repair: '' })) };
const freeze = { url: 'https://www.example.com/research', canonicalUrl: 'https://www.example.com/research', capturedAt: quant.cutoff, sha256: 'a'.repeat(64), bytes: 128 };

test('all specialist schemas compile and valid incomplete packets never imply clearance', () => {
  const cases = { quant_portfolio: quant, market_regime: { ...quant, classification: 'unknown' },
    fundamental_onchain: { summary: 'Example', cutoff: quant.cutoff, thesis: '', facts: [], unknowns: ['Missing evidence'], sources: [] },
    chief: { summary: 'Example', cutoff: quant.cutoff, thesis: '', unknowns: ['Missing evidence'] },
    opportunity_scout: { summary: 'Example', cutoff: quant.cutoff, candidates: [], sources: [], unknowns: ['Missing evidence'] },
    risk_officer: risk, freeze };
  for (const [lane, packet] of Object.entries(cases)) {
    const result = checkSpecialist(lane, packet);
    assert.equal(result.mechanical, 'PASS', JSON.stringify(result.errors));
    assert.equal(result.delivery, 'UNVERIFIED');
    assert.ok(Object.values(result.manual).every(value => value === 'UNKNOWN'));
  }
});

test('schema and semantic regressions fail without accepting coercion or missing review coverage', () => {
  const complete = () => ({ ...structuredClone(quant), horizons: quant.horizons.map(({ id }) => ({ id, incomplete: false,
    bearUpper: 90, bullLower: 110, probabilities: [25, 50, 25], drivers: ['a', 'b', 'c'], triggers: ['a', 'b', 'c'], invalidations: ['a', 'b', 'c'], confidence: 'low' })) });
  assert.equal(checkSpecialist('quant_portfolio', complete()).mechanical, 'PASS');
  const cases = [
    ['risk_officer', risk, p => { p.assertions[1].id = 'authority'; }],
    ['risk_officer', risk, p => { p.assertions.pop(); }],
    ['risk_officer', risk, p => { p.assertions[0].unlisted = true; }],
    ['risk_officer', risk, p => { p.assertions[0].result = 'FAIL'; p.assertions[0].repair = 'Repair'; }],
    ['risk_officer', risk, p => { p.verdict = 'UNKNOWN'; }],
    ['freeze', freeze, p => { p.bytes = -1; }],
    ['freeze', freeze, p => { p.bytes = 1.5; }],
    ['freeze', freeze, p => { p.bytes = '128'; }],
    ['freeze', freeze, p => { p.capturedAt = '2026-02-30T12:00:00Z'; }],
    ['quant_portfolio', complete(), p => { p.horizons[0].probabilities = [-1, 0, 101]; }],
    ['quant_portfolio', complete(), p => { p.horizons[0].probabilities = [20, 50, 25]; }],
    ['quant_portfolio', complete(), p => { p.horizons[0].probabilities = [25.001, 49.999, 25]; }],
    ['quant_portfolio', complete(), p => { p.horizons[1].id = '12h'; }],
    ['quant_portfolio', complete(), p => { p.horizons[0].bullLower = 80; }],
    ['quant_portfolio', quant, p => { p.horizons[0].probabilities = [25, 50, 25]; }],
    ['quant_portfolio', quant, p => { p.horizons[0].gapReason = ' '; }],
    ['quant_portfolio', quant, p => { p.method = { arbitrary: true }; }],
    ['quant_portfolio', quant, p => { p.facts = [{ claim: 'Later', kind: 'fact', asOf: '2026-09-11T12:00:00Z' }]; }],
    ['quant_portfolio', quant, p => { p.sources = [{ title: 'Example', url: freeze.url, type: 'primary', capturedAt: '2026-09-11T12:00:00Z', publishedAt: quant.cutoff, claim: 'Example', excerpt: 'Example' }]; }],
  ];
  for (const [lane, original, mutate] of cases) {
    const packet = structuredClone(original); mutate(packet);
    assert.equal(checkSpecialist(lane, packet).mechanical, 'FAIL', mutate.toString());
  }
  const withheld = structuredClone(risk); withheld.verdict = 'UNKNOWN'; withheld.delivery = 'withhold';
  withheld.assertions[0].result = 'UNKNOWN'; withheld.assertions[0].repair = 'Obtain evidence.';
  assert.equal(checkSpecialist('risk_officer', withheld).mechanical, 'PASS');
});

// Regression guard. A case that only asserts FAIL cannot show that a given rule
// still works when the same record also trips the schema or a second rule:
// deleting the rule leaves the verdict at FAIL. Six of the thirteen semantic
// rules could be deleted that way with the suite still green. Each case below
// starts from a record that passes, breaks one thing, and must report exactly
// that rule at exactly that path.
test('each semantic rule fires on its own violation and names its path', () => {
  const method = { basis: 'judgmental', description: 'Synthetic.', sourceWindow: 'Synthetic.', observationFrequency: 'Synthetic.',
    transformations: 'None.', regimeAdjustment: 'None.', eventAssumptions: 'None.', limitations: 'Synthetic.', sampleSize: null };
  const source = { title: 'Example', url: freeze.url, type: 'primary', publishedAt: '2026-09-10T09:00:00Z',
    capturedAt: '2026-09-10T10:00:00Z', claim: 'Example', excerpt: 'Example' };
  const warned = { ...structuredClone(risk), verdict: 'WARN', delivery: 'deliver_with_warning' };
  const flagged = { ...structuredClone(risk), delivery: 'deliver_with_warning' };
  const cases = [
    ['quant_portfolio', { ...structuredClone(quant), sources: [source] },
      p => { p.sources[0].publishedAt = '2026-09-10T11:00:00Z'; }, '/sources/0', 'publication-after-capture'],
    ['quant_portfolio', { ...structuredClone(quant), method },
      p => { p.method.basis = 'empirical'; }, '/method/sampleSize', 'sample-required-for-nonjudgmental-method'],
    ['quant_portfolio', { ...structuredClone(quant), method },
      p => { p.method.basis = 'model-derived'; }, '/method/sampleSize', 'sample-required-for-nonjudgmental-method'],
    ['risk_officer', warned, p => { p.assertions[0].result = 'FAIL'; p.assertions[0].repair = 'Repair.'; },
      '/delivery', 'failed-or-unknown-assertion-blocks-delivery'],
    ['risk_officer', warned, p => { p.assertions[0].result = 'UNKNOWN'; p.assertions[0].repair = 'Obtain evidence.'; },
      '/delivery', 'failed-or-unknown-assertion-blocks-delivery'],
    ['risk_officer', risk, p => { p.verdict = 'WARN'; }, '/delivery', 'warning-disposition-required'],
    ['risk_officer', risk, p => { p.unknowns = ['Unresolved question.']; }, '/delivery', 'warning-disposition-required'],
    ['risk_officer', flagged, p => { p.assertions[2].result = 'WARN'; p.assertions[2].repair = 'Repair.'; },
      '/verdict', 'pass-requires-pass-assertions'],
    ['risk_officer', risk, p => { p.assertions[1].evidence = ' '; }, '/assertions/1', 'evidence-and-repair-required'],
    ['risk_officer', warned, p => { p.assertions[3].result = 'WARN'; }, '/assertions/3', 'evidence-and-repair-required'],
  ];
  for (const [lane, original, mutate, path, rule] of cases) {
    assert.deepEqual(checkSpecialist(lane, original).errors, [], 'baseline for ' + rule);
    const packet = structuredClone(original); mutate(packet);
    assert.deepEqual(checkSpecialist(lane, packet).errors, [{ path, rule }], mutate.toString());
  }
});

test('offline CLI has explicit exits, bounded reads and named parse errors', () => {
  const command = new URL('../tools/check-specialist.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [fileURLToPath(command), ...args], { encoding: 'utf8' });
  const fixture = fileURLToPath(new URL('../examples/incomplete-quant.json', import.meta.url));
  const good = run('quant_portfolio', fixture);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).delivery, 'UNVERIFIED');
  const bad = run('risk_officer', fixture);
  assert.equal(bad.status, 1);
  const missing = run('freeze', 'missing-sensitive-file.json');
  assert.equal(missing.status, 2);
  assert.doesNotMatch(missing.stderr, /missing-sensitive-file|ENOENT|stack/);
});

test('offline CLI prints help, both versions, and the lane list for an unsupported lane', async () => {
  const command = fileURLToPath(new URL('../tools/check-specialist.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });
  const lanes = ['chief', 'market_regime', 'fundamental_onchain', 'opportunity_scout', 'quant_portfolio', 'risk_officer', 'freeze', 'run_ledger', 'conflict_ledger'];
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const core = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();

  const version = run('--version');
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, 'crypto-research-desk ' + pkg.version + ' (research core ' + core + ')\n');
  for (const flag of ['--help', '-h']) {
    const help = run(flag);
    assert.equal(help.status, 0, help.stderr);
    for (const lane of lanes) assert.match(help.stdout, new RegExp('\\b' + lane + '\\b'), lane);
    assert.match(help.stdout, /0 {2}mechanical PASS/);
    assert.match(help.stdout, /2 {2}unusable input/);
  }
  for (const args of [['quant', 'secret-folder/packet.json'], ['--help', 'secret-folder/packet.json'], ['quant_portfolio'], []]) {
    const unusable = run(...args);
    assert.equal(unusable.status, 2, JSON.stringify(args));
    assert.match(unusable.stderr, /Lanes: chief, market_regime/);
    assert.doesNotMatch(unusable.stderr, /secret-folder/);
    assert.equal(unusable.stdout, '');
  }
});

test('offline CLI names why an input is unusable and never echoes its path', async t => {
  const directory = await scratch(t);
  const write = async (name, content) => { const path = join(directory, name); await writeFile(path, content); return path; };
  const cases = [
    [join(directory, 'missing-sensitive.json'), /The file cannot be opened\./],
    [directory, /The path is not a regular file\./],
    [await write('large-sensitive.json', Buffer.alloc(320 * 1024 + 1, 0x20)), /The file is larger than 320 KiB\./],
    [await write('bytes-sensitive.json', Buffer.from([0xff, 0xfe, 0x7b, 0x7d])), /The file is not valid UTF-8\./],
    [await write('duplicate-sensitive.json', '{"url": 1, "url": 2}'), /Duplicate object key is not allowed\. At character \d+\./],
    [await write('trailing-sensitive.json', '{} []'), /Unexpected content after the packet\./],
    [await write('truncated-sensitive.json', '{"url": '), /Expected a JSON value\./],
  ];
  for (const [path, reason] of cases) {
    const result = runChecker('freeze', path);
    assert.equal(result.status, 2, String(reason));
    assert.match(result.stderr, /^Cannot check packet: /, String(reason));
    assert.match(result.stderr, reason);
    assert.match(result.stderr, /Use npm run check:specialist -- <lane> <UTF-8 JSON file>, at most 320 KiB\./);
    assert.doesNotMatch(result.stderr, /sensitive|specialist-test|ENOENT|EISDIR|EPERM|\.mjs:\d/, String(reason));
    assert.equal(result.stdout, '', String(reason));
  }
  const exact = await write('exact.json', JSON.stringify(freeze).padEnd(320 * 1024, ' '));
  assert.equal(runChecker('freeze', exact).status, 0, 'a file of exactly 320 KiB is read');
});

test('schema errors name the missing, unexpected or allowed field without changing path or rule', async () => {
  const schema = JSON.parse(await readFile(new URL('../schemas/quant_portfolio.schema.json', import.meta.url), 'utf8'));
  const noBytes = structuredClone(freeze); delete noBytes.bytes;
  assert.deepEqual(checkSpecialist('freeze', noBytes).errors, [{ path: '', rule: 'required', detail: { missingProperty: 'bytes' } }]);
  assert.deepEqual(checkSpecialist('freeze', { ...freeze, mirror: 'x' }).errors,
    [{ path: '', rule: 'additionalProperties', detail: { additionalProperty: 'mirror' } }]);
  const long = checkSpecialist('freeze', { ...freeze, ['k'.repeat(500)]: 1 }).errors;
  assert.deepEqual(long, [{ path: '', rule: 'additionalProperties', detail: { additionalProperty: 'k'.repeat(120) } }]);
  const astral = checkSpecialist('freeze', { ...freeze, ['\u{1F600}'.repeat(130)]: 1 }).errors[0].detail.additionalProperty;
  assert.equal(astral, '\u{1F600}'.repeat(120), 'truncation keeps whole code points');
  assert.deepEqual(checkSpecialist('freeze', { ...freeze, sha256: 'abc' }).errors,
    [{ path: '/sha256', rule: 'pattern', detail: { pattern: '^[a-f0-9]{64}$' } }]);
  assert.deepEqual(checkSpecialist('freeze', { ...freeze, bytes: '128' }).errors, [{ path: '/bytes', rule: 'type', detail: { type: 'integer' } }]);
  assert.deepEqual(checkSpecialist('freeze', { ...freeze, bytes: -1 }).errors, [{ path: '/bytes', rule: 'minimum', detail: { limit: 0 } }]);
  assert.deepEqual(checkSpecialist('freeze', { ...freeze, capturedAt: '2026-02-30T12:00:00Z' }).errors,
    [{ path: '/capturedAt', rule: 'format', detail: { format: 'date-time' } }]);
  const rumor = { ...structuredClone(quant), facts: [{ claim: 'Example', kind: 'rumor' }] };
  assert.deepEqual(checkSpecialist('quant_portfolio', rumor).errors,
    [{ path: '/facts/0/kind', rule: 'enum', detail: { allowedValues: schema.properties.facts.items.properties.kind.enum } }]);
  const both = structuredClone(quant); delete both.unknowns; both.extra = true;
  assert.deepEqual(checkSpecialist('quant_portfolio', both).errors, [
    { path: '', rule: 'required', detail: { missingProperty: 'unknowns' } },
    { path: '', rule: 'additionalProperties', detail: { additionalProperty: 'extra' } },
  ]);
  const short = structuredClone(quant); short.horizons.pop();
  assert.deepEqual(checkSpecialist('quant_portfolio', short).errors, [{ path: '/horizons', rule: 'minItems', detail: { limit: 4 } }]);
  const shapeless = checkSpecialist('quant_portfolio', { ...structuredClone(quant), horizons: [{}, {}, {}, {}] }).errors;
  assert.ok(shapeless.some(error => error.rule === 'oneOf'));
  for (const error of shapeless) {
    if (!['required', 'const', 'type', 'enum'].includes(error.rule)) assert.equal('detail' in error, false, error.rule + ' carries no detail');
  }
});

const freezeTool = fileURLToPath(new URL('../tools/freeze-receipt.mjs', import.meta.url));
const runFreeze = (...args) => spawnSync(process.execPath, [freezeTool, ...args], { encoding: 'utf8' });
const captureBytes = Buffer.from('<html><body>Fictional retained capture for the freeze tests.</body></html>\n');

test('freeze:receipt computes sha256 and bytes from the retained capture and prints a receipt the freeze lane accepts', async t => {
  const directory = await scratch(t);
  const capture = join(directory, 'capture-sensitive.html');
  await writeFile(capture, captureBytes);
  const made = runFreeze(capture, '--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z',
    '--content-type', 'text/html', '--etag', '"v1"', '--note', 'Fictional capture.');
  assert.equal(made.status, 0, made.stderr);
  assert.equal(made.stdout.endsWith('}\n'), true);
  const receipt = JSON.parse(made.stdout);
  assert.deepEqual(receipt, { url: 'https://www.example.com/research', canonicalUrl: 'https://www.example.com/research',
    capturedAt: '2026-09-10T12:00:00Z', sha256: createHash('sha256').update(captureBytes).digest('hex'), bytes: captureBytes.length,
    contentType: 'text/html', etag: '"v1"', note: 'Fictional capture.' });
  assert.equal(checkSpecialist('freeze', receipt).mechanical, 'PASS');
  const canonical = JSON.parse(runFreeze(capture, '--url', 'https://www.example.com/r?utm=1', '--canonical-url', 'https://www.example.com/r',
    '--captured-at', '2026-09-10T20:00:00+08:00').stdout);
  assert.deepEqual([canonical.url, canonical.canonicalUrl, 'contentType' in canonical], ['https://www.example.com/r?utm=1', 'https://www.example.com/r', false]);
  assert.doesNotMatch(made.stdout + made.stderr, /capture-sensitive|specialist-test/);
});

test('freeze:receipt refuses an unusable receipt or input without printing a receipt', async t => {
  const directory = await scratch(t);
  const capture = join(directory, 'capture-sensitive.html');
  await writeFile(capture, captureBytes);
  const insecure = runFreeze(capture, '--url', 'http://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z');
  assert.equal(insecure.status, 1);
  assert.deepEqual(JSON.parse(insecure.stdout).errors.map(error => error.path).sort(), ['/canonicalUrl', '/url']);
  assert.equal('sha256' in JSON.parse(insecure.stdout), false, 'the check result, not a receipt');
  const offsetless = runFreeze(capture, '--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00');
  assert.equal(offsetless.status, 1);
  assert.deepEqual(JSON.parse(offsetless.stdout).errors, [{ path: '/capturedAt', rule: 'format', detail: { format: 'date-time' } }]);
  for (const args of [
    [capture, '--url', 'https://www.example.com/research'],
    [capture, '--captured-at', '2026-09-10T12:00:00Z'],
    [capture, '--url', 'https://www.example.com/a', '--url', 'https://www.example.com/b', '--captured-at', '2026-09-10T12:00:00Z'],
    [capture, '--url', '--captured-at', '2026-09-10T12:00:00Z'],
    [capture, '--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z', '--frobnicate', 'x'],
    ['--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z'],
  ]) {
    const result = runFreeze(...args);
    assert.equal(result.status, 2, JSON.stringify(args.slice(1)));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Cannot build receipt: /);
    assert.doesNotMatch(result.stderr, /capture-sensitive|specialist-test/);
  }
  for (const [path, reason] of [[join(directory, 'missing-sensitive.bin'), /The capture file cannot be opened\./], [directory, /The capture path is not a regular file\./]]) {
    const result = runFreeze(path, '--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z');
    assert.equal(result.status, 2);
    assert.match(result.stderr, reason);
    assert.doesNotMatch(result.stderr, /sensitive|specialist-test|ENOENT|EISDIR/);
    assert.equal(result.stdout, '');
  }
  const help = runFreeze('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--captured-at <ISO time with offset>/);
  assert.match(runFreeze('--version').stdout, /^crypto-research-desk \S+ \(research core \S+\)\n$/);
});

test('check:specialist --bytes compares a freeze receipt with the retained capture', async t => {
  const directory = await scratch(t);
  const capture = join(directory, 'capture-sensitive.html');
  await writeFile(capture, captureBytes);
  const receiptPath = join(directory, 'receipt-sensitive.json');
  await writeFile(receiptPath, runFreeze(capture, '--url', 'https://www.example.com/research', '--captured-at', '2026-09-10T12:00:00Z').stdout);
  const match = runChecker('freeze', receiptPath, '--bytes', capture);
  assert.equal(match.status, 0, match.stderr);
  const matched = JSON.parse(match.stdout);
  assert.deepEqual(matched.retained, { bytes: 'MATCH', sha256: 'MATCH' });
  assert.deepEqual(Object.keys(matched), ['mechanical', 'delivery', 'errors', 'retained', 'manual', 'limitation']);
  assert.equal(matched.manual['source-freeze'], 'UNKNOWN', 'matching bytes do not prove the source or capture time');

  const flipped = Buffer.from(captureBytes); flipped[0] ^= 1;
  await writeFile(capture, flipped);
  const changed = runChecker('freeze', receiptPath, '--bytes', capture);
  assert.equal(changed.status, 1);
  assert.deepEqual(JSON.parse(changed.stdout).errors, [{ path: '/sha256', rule: 'retained-sha256-mismatch' }]);
  assert.deepEqual(JSON.parse(changed.stdout).retained, { bytes: 'MATCH', sha256: 'MISMATCH' });

  await writeFile(capture, Buffer.concat([captureBytes, Buffer.from('x')]));
  assert.deepEqual(JSON.parse(runChecker('freeze', receiptPath, '--bytes', capture).stdout).errors,
    [{ path: '/bytes', rule: 'retained-byte-count-mismatch' }, { path: '/sha256', rule: 'retained-sha256-mismatch' }]);

  const invalidPath = join(directory, 'invalid-sensitive.json');
  await writeFile(invalidPath, JSON.stringify({ ...freeze, sha256: 'abc' }));
  const invalid = JSON.parse(runChecker('freeze', invalidPath, '--bytes', capture).stdout);
  assert.deepEqual(invalid.errors, [{ path: '/sha256', rule: 'pattern', detail: { pattern: '^[a-f0-9]{64}$' } }]);
  assert.equal('retained' in invalid, false, 'retained bytes are compared only for a schema-valid receipt');

  const quantPath = fileURLToPath(new URL('../examples/incomplete-quant.json', import.meta.url));
  for (const [args, reason] of [
    [['quant_portfolio', quantPath, '--bytes', capture], /--bytes applies only to the freeze lane\./],
    [['freeze', receiptPath, '--bytes'], /name one supported lane and one file/],
    [['freeze', receiptPath, '--bytes', join(directory, 'missing-sensitive.bin')], /The capture file cannot be opened\./],
    [['freeze', receiptPath, '--bytes', directory], /The capture path is not a regular file\./],
  ]) {
    const result = runChecker(...args);
    assert.equal(result.status, 2, String(reason));
    assert.match(result.stderr, reason);
    assert.doesNotMatch(result.stderr, /sensitive|specialist-test|ENOENT|EISDIR/);
    assert.equal(result.stdout, '');
  }
  const plain = runChecker('freeze', fileURLToPath(new URL('../examples/freeze-receipt.json', import.meta.url)));
  assert.equal(plain.status, 0);
  assert.equal('retained' in JSON.parse(plain.stdout), false, 'the two-argument run is unchanged');
});

test('the library compares retained bytes only for the freeze lane and a schema-valid receipt', () => {
  const capture = { sha256: freeze.sha256, bytes: freeze.bytes };
  assert.deepEqual(checkSpecialist('freeze', freeze, { capture }).retained, { bytes: 'MATCH', sha256: 'MATCH' });
  assert.deepEqual(checkSpecialist('freeze', freeze, { capture: { ...capture, bytes: 129 } }).errors, [{ path: '/bytes', rule: 'retained-byte-count-mismatch' }]);
  assert.equal('retained' in checkSpecialist('freeze', freeze), false);
  assert.equal('retained' in checkSpecialist('quant_portfolio', quant, { capture }), false);
});

const runLedger = JSON.parse(await readFile(new URL('../examples/run-ledger.json', import.meta.url), 'utf8'));
const conflictLedger = JSON.parse(await readFile(new URL('../examples/conflict-ledger.json', import.meta.url), 'utf8'));
const worker = (agent, start, end, state = 'completed') => ({ agent, model: 'example-model', effort: 'example-effort', task: 'Example task.',
  state, startedAt: '2026-09-10T' + start + ':00Z', endedAt: '2026-09-10T' + end + ':00Z' });
const ledger = (mode, workers, incomplete = false) => ({ question: 'Example question.', mode, cutoff: '2026-09-10T12:00:00Z', incomplete, workers, unknowns: [] });
const fullScan = ledger('full_scan', [worker('market_regime', '12:00', '12:10'), worker('fundamental_onchain', '12:00', '12:15'),
  worker('opportunity_scout', '12:00', '12:12'), worker('quant_portfolio', '12:20', '12:30'), worker('risk_officer', '12:40', '12:50')]);

test('the run and conflict ledger examples pass their lanes', () => {
  for (const [lane, record] of [['run_ledger', runLedger], ['conflict_ledger', conflictLedger], ['run_ledger', fullScan]]) {
    const result = checkSpecialist(lane, record);
    assert.deepEqual(result.errors, [], lane);
    assert.equal(result.delivery, 'UNVERIFIED');
  }
});

test('each run-ledger mode requires its lanes and names a missing one', () => {
  const baselines = {
    full_scan: fullScan,
    ticker_forecast: ledger('ticker_forecast', [worker('market_regime', '12:00', '12:10'), worker('quant_portfolio', '12:20', '12:30'), worker('risk_officer', '12:40', '12:50')]),
    focused_asset: ledger('focused_asset', [worker('fundamental_onchain', '12:00', '12:10')]),
    opportunity_hunt: ledger('opportunity_hunt', [worker('opportunity_scout', '12:00', '12:10'), worker('risk_officer', '12:20', '12:30')]),
    risk_review: ledger('risk_review', [worker('risk_officer', '12:00', '12:10')]),
  };
  const required = { full_scan: ['market_regime', 'fundamental_onchain', 'opportunity_scout', 'quant_portfolio', 'risk_officer'],
    ticker_forecast: ['market_regime', 'quant_portfolio', 'risk_officer'], focused_asset: ['fundamental_onchain'],
    opportunity_hunt: ['opportunity_scout', 'risk_officer'], risk_review: ['risk_officer'] };
  for (const [mode, baseline] of Object.entries(baselines)) {
    assert.deepEqual(checkSpecialist('run_ledger', baseline).errors, [], 'baseline for ' + mode);
    for (const lane of required[mode]) {
      const record = structuredClone(baseline);
      record.workers = record.workers.filter(row => row.agent !== lane);
      assert.deepEqual(checkSpecialist('run_ledger', record).errors, [{ path: '/workers', rule: 'required-lane-missing', detail: { lane } }], mode + ' without ' + lane);
    }
  }
  assert.deepEqual(checkSpecialist('run_ledger', ledger('monitoring_update', [])).errors, [{ path: '/workers', rule: 'worker-row-required' }]);
  assert.deepEqual(checkSpecialist('run_ledger', ledger('monitoring_update', [worker('market_regime', '12:00', '12:10')])).errors, []);
});

test('each run-ledger rule fires on its own violation and accepts repairs and re-runs', () => {
  const cases = [
    [p => { p.workers[4].state = 'failed'; }, '/incomplete', 'incomplete-label-required', { lane: 'risk_officer' }],
    [p => { p.workers[4] = { ...p.workers[4], state: 'skipped' }; delete p.workers[4].startedAt; delete p.workers[4].endedAt; },
      '/incomplete', 'incomplete-label-required', { lane: 'risk_officer' }],
    [p => { p.workers[0].endedAt = '2026-09-10T11:59:00Z'; }, '/workers/0', 'ended-before-started'],
    [p => { p.workers[3].startedAt = '2026-09-10T12:11:00Z'; }, '/workers', 'quant-before-inputs'],
    [p => { p.workers[4].startedAt = '2026-09-10T12:25:00Z'; }, '/workers', 'risk-before-producers'],
  ];
  for (const [mutate, path, rule, detail] of cases) {
    const record = structuredClone(fullScan); mutate(record);
    assert.deepEqual(checkSpecialist('run_ledger', record).errors, [detail ? { path, rule, detail } : { path, rule }], mutate.toString());
  }
  const labelled = structuredClone(fullScan); labelled.workers[4].state = 'failed'; labelled.incomplete = true;
  assert.deepEqual(checkSpecialist('run_ledger', labelled).errors, [], 'an incomplete label satisfies a failed required lane');
  const repaired = structuredClone(fullScan);
  repaired.workers.push(worker('fundamental_onchain', '12:55', '13:00'), worker('quant_portfolio', '13:01', '13:05'));
  assert.deepEqual(checkSpecialist('run_ledger', repaired).errors, [], 'a repair re-run after Risk still passes');
  const retried = structuredClone(fullScan);
  retried.workers.splice(3, 0, worker('quant_portfolio', '12:05', '12:08', 'failed'));
  assert.deepEqual(checkSpecialist('run_ledger', retried).errors, [], 'an early failed attempt does not count as the ordered run');
  const review = ledger('risk_review', [worker('risk_officer', '12:00', '12:10'), worker('market_regime', '12:20', '12:30')]);
  assert.deepEqual(checkSpecialist('run_ledger', review).errors, [], 'risk_review applies no handoff order');
  const monitoring = ledger('monitoring_update', [worker('quant_portfolio', '12:00', '12:10'), worker('market_regime', '12:20', '12:30')]);
  assert.deepEqual(checkSpecialist('run_ledger', monitoring).errors, [], 'monitoring_update applies no handoff order');
});

test('each conflict-ledger rule fires on its own violation and never accepts a blend', () => {
  const cases = [
    [p => { p.conflicts[1].resolution = 'consistent'; }, '/conflicts/1', 'resolution-contradicts-observations'],
    [p => { p.conflicts[0].observations[1].value = p.conflicts[0].observations[0].value; p.conflicts[0].resolvedValue = p.conflicts[0].opened.value = '1250000000'; },
      '/conflicts/0', 'resolution-contradicts-observations'],
    [p => { p.conflicts[1].observations[1].value = p.conflicts[1].observations[0].value; }, '/conflicts/1', 'resolution-contradicts-observations'],
    [p => { p.conflicts[0].resolvedValue = '1215000000'; }, '/conflicts/0/resolvedValue', 'resolved-value-not-from-opened-source'],
    [p => { p.conflicts[0].observations[1].capturedAt = '2026-09-10T12:30:00Z'; }, '/conflicts/0/observations/1', 'capture-after-cutoff'],
    [p => { p.conflicts[0].opened.capturedAt = '2026-09-10T12:30:00Z'; }, '/conflicts/0/opened', 'capture-after-cutoff'],
  ];
  for (const [mutate, path, rule] of cases) {
    const record = structuredClone(conflictLedger); mutate(record);
    assert.deepEqual(checkSpecialist('conflict_ledger', record).errors, [{ path, rule }], mutate.toString());
  }
  const agreeing = structuredClone(conflictLedger);
  agreeing.conflicts[1] = { ...agreeing.conflicts[1], resolution: 'consistent', reason: 'Both lanes recorded the same figure.' };
  agreeing.conflicts[1].observations[1].value = agreeing.conflicts[1].observations[0].value;
  assert.deepEqual(checkSpecialist('conflict_ledger', agreeing).errors, [], 'a consistent row of agreeing values passes');
});

test('the ledger schemas reject coordinators, unknown modes and incomplete resolution records', () => {
  const rejects = [
    ['run_ledger', fullScan, p => { p.workers[0].agent = 'chief'; }, '/workers/0/agent', 'enum'],
    ['run_ledger', fullScan, p => { p.mode = 'deep_scan'; }, '/mode', 'enum'],
    ['run_ledger', fullScan, p => { delete p.workers[0].endedAt; }, '/workers/0', 'required'],
    ['run_ledger', fullScan, p => { p.workers[0].task = '  '; }, '/workers/0/task', 'pattern'],
    ['conflict_ledger', conflictLedger, p => { delete p.conflicts[0].opened; }, '/conflicts/0', 'required'],
    ['conflict_ledger', conflictLedger, p => { p.conflicts[1].resolvedValue = '410000000'; }, '/conflicts/1/resolvedValue', 'false schema'],
    ['conflict_ledger', conflictLedger, p => { p.conflicts[0].resolution = 'consistent'; delete p.conflicts[0].resolvedValue; }, '/conflicts/0/opened', 'false schema'],
    ['conflict_ledger', conflictLedger, p => { p.conflicts[0].observations.pop(); }, '/conflicts/0/observations', 'minItems'],
  ];
  for (const [lane, original, mutate, path, rule] of rejects) {
    const record = structuredClone(original); mutate(record);
    const result = checkSpecialist(lane, record);
    assert.equal(result.mechanical, 'FAIL', mutate.toString());
    assert.ok(result.errors.some(error => error.path === path && error.rule === rule), mutate.toString() + ' ' + JSON.stringify(result.errors));
  }
  const skipped = structuredClone(fullScan);
  skipped.workers.push({ agent: 'opportunity_scout', model: 'example-model', effort: 'example-effort', task: 'Example task.', state: 'skipped' });
  assert.deepEqual(checkSpecialist('run_ledger', skipped).errors, [], 'a skipped row needs no times');
});
