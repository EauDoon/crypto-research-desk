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
