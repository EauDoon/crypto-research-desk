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

test('comparison rejects malformed and unrelated packets and bounds differences', () => {
  const previous = examplePacket(), current = examplePacket();
  current.thesis = 'Updated thesis';
  assert.equal(research.comparePackets(previous, current, NOW).changes[0].path, 'thesis');
  current.asset.symbol = 'OTHER';
  assert.throws(() => research.comparePackets(previous, current, NOW), /same named asset/);
  assert.throws(() => research.comparePackets({}, current, NOW), /structurally valid/);
  assert.equal(research.comparePackets(previous, previous, NOW).total, 0);
});

test('risk handoff excludes producer persuasion and prior verdict while retaining raw evidence', () => {
  const packet = examplePacket();
  packet.thesis = 'UNIQUE PERSUASIVE THESIS'; packet.horizons[0].scenarios[0].driver = 'UNIQUE PERSUASIVE DRIVER';
  const handoff = research.riskHandoff(packet, NOW), serialized = JSON.stringify(handoff);
  assert(!serialized.includes('UNIQUE PERSUASIVE'));
  assert(!Object.hasOwn(handoff, 'riskReview'));
  assert.deepEqual(handoff.sources, packet.sources);
  assert.equal(handoff.missingAttachments.length, 3);
  assert.equal(handoff.status, 'INCOMPLETE_HANDOFF');
  assert(handoff.requestedAssertions.every(item => item.result === 'UNKNOWN'));
});

test('undo always resets review and preserves the original snapshot', () => {
  const original = examplePacket();
  const restored = research.restoreResearchDraft(original, NOW);
  assert.equal(restored.riskReview.status, 'pending');
  assert.equal(original.riskReview.status, 'deliver_with_warning');
  assert.deepEqual(restored.sources, original.sources);
  restored.sources[0].claim = 'Changed';
  assert.notEqual(restored.sources[0].claim, original.sources[0].claim);
});

test('sensitivity computes fixed-boundary distances without mutating forecasts', () => {
  const packet = examplePacket(), before = JSON.stringify(packet);
  const rows = research.referenceSensitivity(packet, 200, NOW);
  assert.equal(rows[0].bearDistance, -53);
  assert.equal(rows[0].bullDistance, -47);
  assert.equal(JSON.stringify(packet), before);
  for (const price of [0, -1, Infinity, NaN, 1e13, Number.MIN_VALUE]) assert.throws(() => research.referenceSensitivity(packet, price, NOW));
  packet.riskReview.status = 'pending';
  assert.throws(() => research.referenceSensitivity(packet, 100, NOW), /withheld/);
});

test('validation receipt binds exact packet bytes and records incomplete gates honestly', async () => {
  const packet = examplePacket();
  const receipt = await research.validationReceipt(packet, NOW);
  const { createHash } = await import('node:crypto');
  assert.equal(receipt.packetSha256, createHash('sha256').update(JSON.stringify(packet)).digest('hex'));
  assert.equal(receipt.packetBytes, Buffer.byteLength(JSON.stringify(packet)));
  packet.thesis = 'Changed';
  assert.notEqual((await research.validationReceipt(packet, NOW)).packetSha256, receipt.packetSha256);
  const incomplete = await research.validationReceipt(research.blankPacket(), NOW);
  assert.equal(incomplete.chartEligible, false);
  assert(incomplete.gapCount > 0);
});

test('receipt metadata uses the same immutable snapshot as its asynchronous digest', async () => {
  const packet = examplePacket(); const pending = research.validationReceipt(packet, NOW);
  packet.asset.symbol = 'CHANGED';
  const receipt = await pending; assert.equal(receipt.asset, 'DEMO');
});

test('comparison count remains honest when a bounded display omits changes', () => {
  const previous = examplePacket(), current = examplePacket();
  for (const horizon of current.horizons) for (const scenario of horizon.scenarios) {
    scenario.driver = 'changed driver'; scenario.trigger = 'changed trigger'; scenario.invalidation = 'changed invalidation';
  }
  current.sources = Array.from({ length: 32 }, (_, index) => ({ ...previous.sources[0], id: 'source' + index, title: 'Source ' + index, url: 'https://example.com/source/' + index }));
  current.riskReview = research.blankPacket().riskReview;
  const result = research.comparePackets(previous, current, NOW);
  assert(result.total > 80); assert.equal(result.changes.length, 80);
  assert.equal(result.omitted, result.total - 80);
});

test('risk handoff is independent of every prior review disposition and retains research gaps', () => {
  let expected;
  for (const status of ['pending', 'deliver', 'deliver_with_warning', 'repair', 'withhold']) {
    const packet = examplePacket(); packet.liquidity = ''; packet.sources[0].excerpt = '';
    packet.riskReview.status = status;
    packet.riskReview.notes = 'PRIOR REVIEW ' + status;
    packet.riskReview.sourceIds = [];
    packet.riskReview.assertions.forEach(assertion => { assertion.result = 'PASS'; });
    const before = JSON.stringify(packet);
    const handoff = research.riskHandoff(packet, NOW);
    assert.equal(JSON.stringify(packet), before);
    assert(handoff.localGaps.some(gap => gap.path === 'liquidity'));
    assert(handoff.localGaps.some(gap => gap.path === 'sources[0].excerpt'));
    assert(handoff.localGaps.every(gap => !gap.path.startsWith('riskReview')));
    assert(!JSON.stringify(handoff).includes('PRIOR REVIEW'));
    assert.equal(handoff.omittedGapCount, 0);
    if (expected) assert.deepEqual(handoff, expected);
    expected = handoff;
  }
});

test('risk handoff omission counts include only research gaps when output is truncated', () => {
  const packet = examplePacket();
  packet.sources = Array.from({ length: 32 }, (_, index) => ({ ...packet.sources[0], id: 'source' + index, title: '', claim: '', excerpt: '', url: 'https://example.com/' + index }));
  packet.riskReview = research.blankPacket().riskReview;
  const handoff = research.riskHandoff(packet, NOW);
  assert.equal(handoff.localGaps.length, 80);
  assert.equal(handoff.omittedGapCount, 16);
  assert(handoff.localGaps.every(gap => !gap.path.startsWith('riskReview')));
});
