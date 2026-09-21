import { MAX_PACKET_BYTES, MAX_JSON_INPUT_BYTES } from './packet-constants.js';
import { parsePacket } from './packet-parse.js';
import { timestamp, validatePacket } from './packet-validate.js';

export async function validationReceipt(packet, now = Date.now()) {
  const report = validatePacket(packet, now);
  if (!report.valid) throw new Error('A check receipt requires a structurally valid packet.');
  const serialized = JSON.stringify(packet);
  packet = JSON.parse(serialized);
  const bytes = new TextEncoder().encode(serialized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return { format: 'crypto-research-check-receipt.v1', researchOnly: true,
    checkedAt: new Date(now).toISOString(), packetSha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''),
    hashInput: 'UTF-8 bytes of JSON.stringify(packet), preserving object key order, with no whitespace or trailing newline',
    packetBytes: bytes.length, kind: packet.kind, asset: packet.asset.symbol, referenceCutoff: packet.reference.capturedAt,
    structurallyValid: report.valid, complete: report.complete, chartEligible: report.chartEligible,
    gapCount: report.gapCount, warningCount: report.warningCount,
    gaps: report.gaps, warnings: report.warnings, omittedIssueCounts: report.omittedIssueCounts,
    limitation: 'Local structural checks only. This digest detects byte changes; it is not a signature, authenticated review, source verification, or evidence of forecast accuracy.' };
}

export async function verifyReceipt(text, packet, now = Date.now()) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > 65536) throw new Error('Receipt JSON must be at most 64 KiB.');
  const receipt = parsePacket(text);
  if (!receipt || receipt.format !== 'crypto-research-check-receipt.v1' || receipt.researchOnly !== true
    || typeof receipt.packetSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.packetSha256)
    || timestamp(receipt.checkedAt) === null || timestamp(receipt.checkedAt) > now + 300000) throw new Error('Supply a supported, dated research check receipt.');
  if (!validatePacket(packet, now).valid) throw new Error('The current packet must be structurally valid.');
  const snapshot = JSON.parse(JSON.stringify(packet));
  const current = await validationReceipt(snapshot, now);
  const expected = validatePacket(snapshot, timestamp(receipt.checkedAt)).valid ? await validationReceipt(snapshot, timestamp(receipt.checkedAt)) : null;
  const keys = Object.keys(current);
  if (Object.keys(receipt).length !== keys.length || keys.some(key => !Object.hasOwn(receipt, key))) throw new Error('Receipt fields do not match the supported format.');
  const ordered = value => Array.isArray(value) ? value.map(ordered) : value !== null && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
  return { digestMatches: receipt.packetSha256 === current.packetSha256,
    recordMatches: expected !== null && JSON.stringify(ordered(receipt)) === JSON.stringify(ordered(expected)),
    checkedAt: receipt.checkedAt, currentChartEligible: validatePacket(snapshot, now).chartEligible };
}

export async function exportResearchBundle(packet, now = Date.now()) {
  if (!validatePacket(packet, now).valid) throw new Error('Bundle export requires a structurally valid packet.');
  const snapshot = JSON.parse(JSON.stringify(packet));
  const receipt = await validationReceipt(snapshot, now);
  const text = JSON.stringify({ format: 'crypto-research-bundle.v1', packet: snapshot, receipt }) + '\n';
  if (new TextEncoder().encode(text).length > MAX_JSON_INPUT_BYTES) throw new Error('Bundle exceeds 320 KiB. Export the packet and receipt separately.');
  return text;
}
export async function readResearchBundle(text, now = Date.now()) {
  const bundle = parsePacket(text);
  if (!bundle || bundle.format !== 'crypto-research-bundle.v1' || Object.keys(bundle).length !== 3
    || !Object.hasOwn(bundle, 'packet') || !Object.hasOwn(bundle, 'receipt')) throw new Error('Unsupported research bundle format.');
  const result = await verifyReceipt(JSON.stringify(bundle.receipt), bundle.packet, now);
  if (!result.digestMatches || !result.recordMatches) throw new Error('Bundle packet or recorded checks do not match its receipt. The open packet is unchanged.');
  return bundle.packet;
}
