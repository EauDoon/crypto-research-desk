import test from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../web/packet.js';
import { examplePacket } from '../web/example.js';
const NOW = Date.parse('2026-08-20T10:00:00Z');
test('repair queue keeps exact editable paths and missing information', () => {
  assert(research.repairQueue(research.blankPacket(), NOW).some(item => item.path === 'reference.price'));
  assert.deepEqual(research.repairQueue(examplePacket(), NOW), []);
});

test('evidence audit uses cutoff, never current age or implied review authenticity', () => {
  const packet = examplePacket();
  assert.equal(research.evidenceAudit(packet)[0].ageHours, 0.5);
  packet.riskReview.sourceIds = [];
  packet.reference.capturedAt = '';
  assert.equal(research.evidenceAudit(packet)[0].ageHours, null);
  assert.equal(research.evidenceAudit(packet)[0].reviewed, false);
});

test('source search is literal, bounded, and respects primary filters', () => {
  const source = examplePacket().sources[0];
  assert(research.sourceMatches(source, ' UPGRADE ', 'primary'));
  assert(!research.sourceMatches(source, '', 'secondary'));
  assert(!research.sourceMatches(source, '.*'));
});

test('overview follows independent risk and elapsed research gates', () => {
  const packet = examplePacket();
  assert.equal(research.horizonOverview(packet, NOW)[0].bearCeiling, 94);
  packet.riskReview.status = 'pending';
  assert(research.horizonOverview(packet, NOW).every(item => item.bearCeiling === null));
  assert.equal(research.horizonOverview(research.blankPacket(), NOW)[0].timing, 'UNKNOWN');
});

test('CSV retains provenance, escapes formula text and withholds gated values', () => {
  const packet = examplePacket(); packet.horizons[0].scenarios[0].trigger = '=SUM(1,2)';
  const csv = research.exportScenarioCsv(packet, NOW);
  assert(csv.includes("'=SUM(1,2)"));
  assert(csv.includes('UNBOUNDED'));
  assert(csv.includes(packet.reference.capturedAt));
  packet.riskReview.status = 'pending';
  const withheld = research.exportScenarioCsv(packet, NOW);
  assert(withheld.includes('WITHHELD'));
  assert(!withheld.includes('SUM'));
  assert.equal(withheld.trim().split('\r\n').length, 5);
});
