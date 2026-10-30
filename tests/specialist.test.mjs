import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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
  const lanes = ['chief', 'market_regime', 'fundamental_onchain', 'opportunity_scout', 'quant_portfolio', 'risk_officer', 'freeze'];
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
