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
