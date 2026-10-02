import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { MAX_JSON_INPUT_BYTES, MAX_PACKET_BYTES } from '../web/packet-constants.js';
import { parsePacket, portableJson } from '../web/packet-parse.js';
import { safeSourceUrl, timestamp } from '../web/packet-validate.js';

const lanes = ['chief', 'market_regime', 'fundamental_onchain', 'opportunity_scout', 'quant_portfolio', 'risk_officer', 'freeze'];
const ajv = new Ajv2020({ allErrors: true, ownProperties: true });
ajv.addFormat('date-time', value => timestamp(value) !== null);
ajv.addFormat('uri', value => safeSourceUrl(value) !== null);
const validators = new Map(await Promise.all(lanes.map(async lane => [lane,
  ajv.compile(JSON.parse(await readFile(new URL('../schemas/' + lane + '.schema.json', import.meta.url), 'utf8'))),
])));

// These checks establish recorded structure and arithmetic, never evidence truth or clearance.
export function checkSpecialist(lane, packet) {
  const errors = [];
  const fail = (path, rule) => { if (errors.length < 80) errors.push({ path, rule }); };
  const validate = validators.get(lane);
  if (!validate) fail('', 'unsupported-lane');
  else if (!portableJson(packet) || new TextEncoder().encode(JSON.stringify(packet)).length > MAX_PACKET_BYTES) fail('', 'bounded-portable-json');
  else if (!validate(packet)) for (const issue of validate.errors) fail(issue.instancePath, issue.keyword);
  else {
    const cutoff = timestamp(packet.cutoff);
    for (const [index, source] of (packet.sources ?? []).entries()) {
      const captured = timestamp(source.capturedAt), published = timestamp(source.publishedAt);
      if (cutoff !== null && captured > cutoff) fail('/sources/' + index, 'capture-after-cutoff');
      if (published !== null && published > captured) fail('/sources/' + index, 'publication-after-capture');
    }
    for (const [index, fact] of (packet.facts ?? []).entries()) {
      if (fact.asOf && cutoff !== null && timestamp(fact.asOf) > cutoff) fail('/facts/' + index, 'fact-after-cutoff');
    }
    const probabilitySum = (values, path) => {
      if (values.some(value => Math.abs(value * 100 - Math.round(value * 100)) > 1e-8)
        || values.reduce((sum, value) => sum + Math.round(value * 100), 0) !== 10000) fail(path, 'probabilities-total-100-with-two-decimals');
    };
    if (packet.horizons) {
      if (packet.horizons.map(item => item.id).join(',') !== '12h,24h,3d,7d') fail('/horizons', 'four-ordered-unique-horizons');
      for (const [index, horizon] of packet.horizons.entries()) {
        if (horizon.incomplete) {
          if (!horizon.gapReason.trim()) fail('/horizons/' + index, 'nonblank-gap-reason');
          continue;
        }
        if (horizon.bearUpper >= horizon.bullLower) fail('/horizons/' + index, 'ordered-price-boundaries');
        probabilitySum(horizon.probabilities, '/horizons/' + index);
      }
    }
    if (packet.scenarios?.length) probabilitySum(packet.scenarios.map(row => row.probability), '/scenarios');
    if (packet.method && packet.method.basis !== 'judgmental' && packet.method.sampleSize === null) fail('/method/sampleSize', 'sample-required-for-nonjudgmental-method');
    if (lane === 'risk_officer') {
      const results = packet.assertions.map(row => row.result);
      if (results.some(result => ['FAIL', 'UNKNOWN'].includes(result)) && ['deliver', 'deliver_with_warning'].includes(packet.delivery)) fail('/delivery', 'failed-or-unknown-assertion-blocks-delivery');
      if (['FAIL', 'UNKNOWN'].includes(packet.verdict) && ['deliver', 'deliver_with_warning'].includes(packet.delivery)) fail('/delivery', 'failed-or-unknown-verdict-blocks-delivery');
      if ((results.includes('WARN') || packet.unknowns?.length || packet.verdict === 'WARN') && packet.delivery === 'deliver') fail('/delivery', 'warning-disposition-required');
      if (packet.verdict === 'PASS' && results.some(result => result !== 'PASS')) fail('/verdict', 'pass-requires-pass-assertions');
      for (const [index, row] of packet.assertions.entries()) {
        if (!row.evidence.trim() || (row.result !== 'PASS' && !row.repair.trim())) fail('/assertions/' + index, 'evidence-and-repair-required');
      }
    }
  }
  return { mechanical: errors.length ? 'FAIL' : 'PASS', delivery: 'UNVERIFIED', errors,
    manual: Object.fromEntries(['authority', 'allocation', 'source-freeze', 'risk-isolation', 'fail-intact', 'source-truth'].map(id => [id, 'UNKNOWN'])),
    limitation: 'Local schema, chronology and arithmetic checks only. Manual evidence review is required; this result never authorizes delivery or financial action.' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [lane, path, ...extra] = process.argv.slice(2);
    if (!validators.has(lane) || !path || extra.length) throw new Error('arguments');
    const file = await open(path, 'r');
    let text;
    try {
      if (!(await file.stat()).isFile()) throw new Error('file');
      const bytes = Buffer.alloc(MAX_JSON_INPUT_BYTES + 1);
      let length = 0, count;
      while (length < bytes.length && (count = (await file.read(bytes, length, bytes.length - length, null)).bytesRead)) length += count;
      if (length > MAX_JSON_INPUT_BYTES) throw new Error('size');
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length));
    } finally { await file.close(); }
    const result = checkSpecialist(lane, parsePacket(text));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.mechanical === 'PASS' ? 0 : 1;
  } catch {
    process.stderr.write('Cannot check packet. Use npm run check:specialist -- <lane> <UTF-8 JSON file>, at most 320 KiB.\n');
    process.exitCode = 2;
  }
}
