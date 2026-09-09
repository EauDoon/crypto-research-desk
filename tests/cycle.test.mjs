import test from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../web/packet.js';
import { examplePacket } from '../web/example.js';
const NOW = Date.parse('2026-08-20T10:00:00Z');
test('comparison follows source and assertion identities through record reorder', () => {
  const previous = examplePacket(), current = examplePacket();
  current.sources.reverse(); current.riskReview.assertions.reverse(); current.riskReview.sourceIds.reverse();
  assert.equal(research.comparePackets(previous, current, NOW).total, 0);
  current.sources[0].claim = 'Changed observation';
  assert.equal(research.comparePackets(previous, current, NOW).changes[0].path, 'sources[example-activity].claim');
});

test('source origin audit counts exact hosts and discloses repeated excerpts', () => {
  const packet = examplePacket(); packet.sources[1].url = 'https://example.com/second';
  packet.sources[1].excerpt = packet.sources[0].excerpt + '  ';
  const audit = research.sourceOriginAudit(packet, NOW);
  assert.deepEqual(audit.hosts, [{ host: 'example.com', count: 2, primaryCount: 2, sharePercent: 100 }]);
  assert.deepEqual(audit.repeatedExcerpts, [['example-upgrade', 'example-activity']]);
  assert.deepEqual(research.sourceOriginAudit(research.blankPacket(), NOW), { hosts: [], repeatedExcerpts: [] });
});

test('evidence CSV retains every dated raw record and neutralizes spreadsheet formulas', () => {
  const packet = examplePacket(); packet.sources[0].claim = '=SUM(1,2)'; packet.sources[1].excerpt = 'Quoted "value"\nnext line';
  const csv = research.exportEvidenceCsv(packet, NOW);
  assert(csv.includes("'=SUM(1,2)")); assert(csv.includes('Quoted ""value""\nnext line'));
  assert(csv.includes('example-activity')); assert(csv.includes(packet.reference.capturedAt));
  assert(csv.includes('SELF_REPORTED_YES'));
  assert.equal(research.exportEvidenceCsv(research.blankPacket(), NOW).trim().split('\r\n').length, 1);
});

test('receipt checking separates byte matches from tampered local-check claims', async () => {
  const packet = examplePacket(), receipt = await research.validationReceipt(packet, NOW);
  assert.deepEqual(await research.verifyReceipt(JSON.stringify(receipt), packet, NOW), { digestMatches: true, recordMatches: true, checkedAt: receipt.checkedAt, currentChartEligible: true });
  receipt.chartEligible = false;
  const tampered = await research.verifyReceipt(JSON.stringify(receipt), packet, NOW);
  assert.equal(tampered.digestMatches, true); assert.equal(tampered.recordMatches, false);
  await assert.rejects(research.verifyReceipt('x'.repeat(65537), packet, NOW), /64 KiB/);
  await assert.rejects(research.verifyReceipt('{"__proto__":{}}', packet, NOW));
});

test('research bundles round-trip exact data and reject altered packet or receipt fields', async () => {
  const packet = examplePacket(), text = await research.exportResearchBundle(packet, NOW);
  assert.equal(JSON.stringify(await research.readResearchBundle(text, NOW)), JSON.stringify(packet));
  const changed = JSON.parse(text); changed.packet.thesis = 'Tampered';
  await assert.rejects(research.readResearchBundle(JSON.stringify(changed), NOW), /do not match/);
  const forged = JSON.parse(text); forged.receipt.chartEligible = false;
  await assert.rejects(research.readResearchBundle(JSON.stringify(forged), NOW), /do not match/);
  await assert.rejects(research.readResearchBundle(text.replace('"format":', '"extra":true,"format":'), NOW), /Unsupported/);
});

test('manual monitoring keeps each horizon context and withholds blocked scenarios', () => {
  const packet = examplePacket();
  const checklist = research.monitoringChecklist(packet, NOW);
  assert.equal(checklist.rows.length, 12);
  assert.deepEqual([...new Set(checklist.rows.map(row => row.horizon))], ['12h', '24h', '3d', '7d']);
  assert.equal(checklist.rows[0].trigger, packet.horizons[0].scenarios[0].trigger);
  packet.riskReview.status = 'pending';
  const withheld = research.monitoringChecklist(packet, NOW);
  assert.equal(withheld.eligible, false); assert.equal(withheld.rows.length, 4);
  assert(withheld.rows.every(row => row.scenario === 'WITHHELD' && row.trigger === ''));
  assert(!research.exportMonitoringCsv(packet, NOW).includes('cancellation'));
});

test('renewal carries raw evidence but clears reference, scenarios and review without mutation', () => {
  const packet = examplePacket(), before = JSON.stringify(packet), draft = research.renewResearchPacket(packet, NOW);
  assert.equal(JSON.stringify(packet), before); assert.deepEqual(draft.sources, packet.sources);
  assert.equal(draft.kind, 'synthetic'); assert.equal(draft.reference.price, null); assert.equal(draft.reference.capturedAt, '');
  assert.equal(draft.riskReview.status, 'pending'); assert.equal(draft.horizons.length, 4);
  assert(draft.horizons.every(row => row.status === 'incomplete' && row.scenarios.length === 0 && row.endAt === ''));
  assert.equal(research.validatePacket(draft, NOW).valid, true); assert.equal(research.validatePacket(draft, NOW).chartEligible, false);
});
