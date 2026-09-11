import test from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../web/packet.js';
import { examplePacket } from '../web/example.js';
const NOW = Date.parse('2026-08-20T10:00:00Z');

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
