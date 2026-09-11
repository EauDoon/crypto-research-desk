import test from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../web/packet.js';
import { examplePacket } from '../web/example.js';
const NOW = Date.parse('2026-08-20T10:00:00Z');

test('hypothetical prices use half-open boundaries and never mutate or bypass review', () => {
  const packet = examplePacket(), before = JSON.stringify(packet), [bear, base] = packet.horizons[0].scenarios;
  assert.equal(research.classifyHypotheticalPrice(packet, 0, NOW)[0].scenario, 'Bear');
  assert.equal(research.classifyHypotheticalPrice(packet, bear.upper, NOW)[0].scenario, 'Base');
  assert.equal(research.classifyHypotheticalPrice(packet, base.upper, NOW)[0].scenario, 'Bull');
  assert.equal(research.classifyHypotheticalPrice(packet, 1e12, NOW).length, 4);
  for (const price of [-1, NaN, Infinity, '100', 1e12 + 1]) assert.throws(() => research.classifyHypotheticalPrice(packet, price, NOW), /hypothetical price/);
  assert.equal(JSON.stringify(packet), before);
  packet.riskReview.status = 'pending';
  assert.throws(() => research.classifyHypotheticalPrice(packet, 100, NOW), /withheld/);
});

test('source citations retain full provenance, multiline excerpts and unknowns', () => {
  const packet = examplePacket(); packet.sources[0].excerpt = 'Original line\nSecond line'; packet.sources[0].publishedAt = '';
  const citation = research.sourceCitation(packet, packet.sources[0].id, NOW);
  for (const text of ['SYNTHETIC', packet.reference.capturedAt, packet.sources[0].url, 'Original line\nSecond line', 'Published: UNKNOWN', 'unverified']) assert(citation.includes(text));
  assert.throws(() => research.sourceCitation(packet, 'missing', NOW), /Choose a source/);
});

test('evidence filters intersect literal search, source type and self-reported coverage', () => {
  const packet = examplePacket(); packet.riskReview = research.blankPacket().riskReview;
  packet.riskReview.sourceIds = [packet.sources[0].id];
  assert.equal(research.filterEvidence(packet, '', 'all', 'unlisted', NOW)[0].id, packet.sources[1].id);
  assert.equal(research.filterEvidence(packet, 'upgrade', 'primary', 'listed', NOW).length, 1);
  assert.equal(research.filterEvidence(packet, 'upgrade', 'primary', 'unlisted', NOW).length, 0);
  assert.equal(research.filterEvidence(packet, '', 'all', 'all', NOW).length, 2);
  assert.throws(() => research.filterEvidence(packet, '', 'all', 'verified', NOW), /coverage/);
});

test('capture-age policy preserves exact boundary and unknown dates without changing clearance', () => {
  const packet = examplePacket(), before = JSON.stringify(packet);
  assert.equal(research.evidenceAgeCheck(packet, 0.5, NOW)[0].status, 'WITHIN_LIMIT');
  assert.equal(research.evidenceAgeCheck(packet, 0.49, NOW)[0].status, 'EXCEEDS_LIMIT');
  assert.equal(JSON.stringify(packet), before);
  packet.reference.capturedAt = '';
  assert(research.evidenceAgeCheck(packet, 24, NOW).every(row => row.status === 'UNKNOWN'));
  for (const value of [0, -1, NaN, Infinity, '24', 87601]) assert.throws(() => research.evidenceAgeCheck(examplePacket(), value, NOW), /capture-age limit/);
});

test('chronology orders actual instants, preserves publication and capture, and places unknowns last', () => {
  const packet = examplePacket();
  packet.sources[0].publishedAt = '';
  const before = JSON.stringify(packet), events = research.evidenceChronology(packet, NOW);
  assert.equal(events.length, 4); assert.equal(events.at(-1).at, '');
  assert.equal(events.filter(item => item.event === 'capturedAt').length, 2);
  assert.deepEqual(events.slice(0, -1).map(item => Date.parse(item.at)), events.slice(0, -1).map(item => Date.parse(item.at)).sort((a, b) => a - b));
  assert.equal(JSON.stringify(packet), before);
  assert.deepEqual(research.evidenceChronology(research.blankPacket(), NOW), []);
  assert.throws(() => research.evidenceChronology({}, NOW), /structurally valid/);
});

test('repair worksheet exports paths, explicit omissions and current gate without mutation', () => {
  const packet = research.blankPacket(), before = JSON.stringify(packet);
  const sheet = research.repairWorksheet(packet, NOW);
  assert.equal(sheet.researchOnly, true);
  assert.equal(sheet.chartEligible, false);
  assert(sheet.items.some(item => item.path === 'reference.price'));
  assert.equal(sheet.total, sheet.items.length + sheet.omitted);
  assert.equal(JSON.stringify(packet), before);
  assert.equal(research.repairWorksheet(examplePacket(), NOW).total, 0);
  assert.throws(() => research.repairWorksheet({}, NOW), /structurally valid/);
});
