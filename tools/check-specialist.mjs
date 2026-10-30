import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { MAX_JSON_INPUT_BYTES, MAX_PACKET_BYTES } from '../web/packet-constants.js';
import { portableJson } from '../web/packet-parse.js';
import { safeSourceUrl, timestamp } from '../web/packet-validate.js';
import { InputError, hashFile, readJsonFile, versionLine } from './runtime.mjs';

const lanes = ['chief', 'market_regime', 'fundamental_onchain', 'opportunity_scout', 'quant_portfolio', 'risk_officer', 'freeze'];
const ajv = new Ajv2020({ allErrors: true, ownProperties: true });
ajv.addFormat('date-time', value => timestamp(value) !== null);
ajv.addFormat('uri', value => safeSourceUrl(value) !== null);
const validators = new Map(await Promise.all(lanes.map(async lane => [lane,
  ajv.compile(JSON.parse(await readFile(new URL('../schemas/' + lane + '.schema.json', import.meta.url), 'utf8'))),
])));

// Ajv parameters worth showing for each keyword. Every value except an
// unexpected property name comes from the schema, not from the checked record.
const DETAIL_PARAMS = Object.freeze({
  required: ['missingProperty'], additionalProperties: ['additionalProperty'], enum: ['allowedValues'], const: ['allowedValue'],
  type: ['type'], format: ['format'], pattern: ['pattern'],
  ...Object.fromEntries(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minLength', 'maxLength', 'minItems', 'maxItems']
    .map(keyword => [keyword, ['limit']])),
});
const MAX_DETAIL_CODE_POINTS = 120;
function schemaDetail(issue) {
  const names = (DETAIL_PARAMS[issue.keyword] ?? []).filter(name => Object.hasOwn(issue.params ?? {}, name));
  if (!names.length) return undefined;
  return Object.fromEntries(names.map(name => [name, name === 'additionalProperty'
    ? [...String(issue.params[name])].slice(0, MAX_DETAIL_CODE_POINTS).join('') : issue.params[name]]));
}

// These checks establish recorded structure and arithmetic, never evidence truth or clearance.
// options.capture is the { sha256, bytes } of a retained capture, compared with a
// freeze receipt once that receipt passes its schema.
export function checkSpecialist(lane, packet, { capture = null } = {}) {
  const errors = [];
  let retained = null;
  const fail = (path, rule, detail) => { if (errors.length < 80) errors.push(detail === undefined ? { path, rule } : { path, rule, detail }); };
  const validate = validators.get(lane);
  if (!validate) fail('', 'unsupported-lane');
  else if (!portableJson(packet) || new TextEncoder().encode(JSON.stringify(packet)).length > MAX_PACKET_BYTES) fail('', 'bounded-portable-json');
  else if (!validate(packet)) for (const issue of validate.errors) fail(issue.instancePath, issue.keyword, schemaDetail(issue));
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
    // Matching bytes show the receipt describes this capture, not where or when it was captured.
    if (lane === 'freeze' && capture) {
      retained = { bytes: packet.bytes === capture.bytes ? 'MATCH' : 'MISMATCH', sha256: packet.sha256 === capture.sha256 ? 'MATCH' : 'MISMATCH' };
      if (retained.bytes === 'MISMATCH') fail('/bytes', 'retained-byte-count-mismatch');
      if (retained.sha256 === 'MISMATCH') fail('/sha256', 'retained-sha256-mismatch');
    }
  }
  return { mechanical: errors.length ? 'FAIL' : 'PASS', delivery: 'UNVERIFIED', errors, ...(retained ? { retained } : {}),
    manual: Object.fromEntries(['authority', 'allocation', 'source-freeze', 'risk-isolation', 'fail-intact', 'source-truth'].map(id => [id, 'UNKNOWN'])),
    limitation: 'Local schema, chronology and arithmetic checks only. Manual evidence review is required; this result never authorizes delivery or financial action.' };
}

const usage = [
  'Usage: npm run check:specialist -- <lane> <UTF-8 JSON file>',
  '       npm run check:specialist -- freeze <receipt.json> --bytes <retained capture file>',
  '       npm run check:specialist -- --help | --version',
  '',
  'Checks one specialist record offline: its JSON Schema, recorded chronology and arithmetic.',
  'The file must be strict UTF-8 JSON of at most ' + MAX_JSON_INPUT_BYTES / 1024 + ' KiB.',
  '',
  'Lanes: ' + lanes.join(', '),
  '',
  'Output: JSON with mechanical, delivery, errors, manual and limitation. Each error has a',
  'path and a rule. A schema error also has a detail naming the missing or unexpected field,',
  'the allowed values, the expected type or format, the pattern or the limit.',
  '',
  'With --bytes, a schema-valid freeze receipt is also compared with the retained capture: its',
  'SHA-256 and length are computed from the file and reported in retained as MATCH or MISMATCH.',
  'A mismatch is a mechanical FAIL. Matching bytes do not prove the source URL or capture time.',
  '',
  'Exit codes:',
  '  0  mechanical PASS; delivery stays UNVERIFIED and manual review is still required',
  '  1  mechanical FAIL',
  '  2  unusable input: unknown lane, wrong arguments, --bytes with another lane, an unreadable',
  '     capture, or an unreadable, oversized or unparsable file',
].join('\n') + '\n';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage);
  } else if (args.length === 1 && args[0] === '--version') {
    process.stdout.write(versionLine(fileURLToPath(new URL('..', import.meta.url))) + '\n');
  } else if (!validators.has(args[0]) || !(args.length === 2 || (args.length === 4 && args[2] === '--bytes'))) {
    // The arguments are never echoed: the second and fourth are local file paths.
    process.stderr.write('Cannot check packet: name one supported lane and one file.\n\n' + usage);
    process.exitCode = 2;
  } else if (args.length === 4 && args[0] !== 'freeze') {
    process.stderr.write('Cannot check packet: --bytes applies only to the freeze lane.\n\n' + usage);
    process.exitCode = 2;
  } else try {
    const [lane, path, , capturePath] = args;
    const packet = await readJsonFile(path, MAX_JSON_INPUT_BYTES);
    const capture = capturePath === undefined ? null : await hashFile(capturePath);
    const result = checkSpecialist(lane, packet, { capture });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exitCode = result.mechanical === 'PASS' ? 0 : 1;
  } catch (error) {
    // Only InputError messages are printed: they name the cause and never carry the path.
    const reason = error instanceof InputError ? error.message : 'The file cannot be read.';
    process.stderr.write('Cannot check packet: ' + reason + '\nUse npm run check:specialist -- <lane> <UTF-8 JSON file>, at most 320 KiB.\n');
    process.exitCode = 2;
  }
}
