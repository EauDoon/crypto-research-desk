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
