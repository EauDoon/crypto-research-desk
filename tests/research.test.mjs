import test from 'node:test';
import assert from 'node:assert/strict';
import * as research from '../web/packet.js';
import { examplePacket } from '../web/example.js';
const NOW = Date.parse('2026-08-20T10:00:00Z');
test('repair queue keeps exact editable paths and missing information', () => {
  assert(research.repairQueue(research.blankPacket(), NOW).some(item => item.path === 'reference.price'));
  assert.deepEqual(research.repairQueue(examplePacket(), NOW), []);
});
