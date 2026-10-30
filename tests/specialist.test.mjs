import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSpecialist } from '../tools/check-specialist.mjs';

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

test('offline CLI has explicit exits, bounded reads and generic parse errors', () => {
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
