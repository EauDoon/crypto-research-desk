import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { checkSpecialist } from '../tools/check-specialist.mjs';
import { parsePacket } from '../web/packet-parse.js';
import { safeSourceUrl, timestamp } from '../web/packet-validate.js';

// Every runnable example is a checked specialist input, so the examples cannot
// drift from the contracts they illustrate. A new examples/*.json file must be
// given a lane here.
const EXAMPLE_LANES = Object.freeze({
  'incomplete-quant.json': 'quant_portfolio',
  'freeze-receipt.json': 'freeze',
});
const examples = new URL('../examples/', import.meta.url);

test('every JSON example is mapped to a lane and passes the offline specialist check', async () => {
  const files = (await readdir(examples)).filter(name => name.endsWith('.json')).sort();
  assert.deepEqual(files, Object.keys(EXAMPLE_LANES).sort(), 'every examples/*.json file has exactly one lane');
  for (const [name, lane] of Object.entries(EXAMPLE_LANES)) {
    const result = checkSpecialist(lane, parsePacket(await readFile(new URL(name, examples), 'utf8')));
    assert.equal(result.mechanical, 'PASS', name + ': ' + JSON.stringify(result.errors));
    assert.equal(result.delivery, 'UNVERIFIED', name);
  }
});

test('the freeze receipt prose and JSON example record the same fields', async () => {
  const receipt = JSON.parse(await readFile(new URL('freeze-receipt.json', examples), 'utf8'));
  const prose = await readFile(new URL('freeze-receipt.md', examples), 'utf8');
  const listed = Object.fromEntries([...prose.matchAll(/^- (\w+): `?([^`\n]+)`?$/gm)].map(match => [match[1], match[2]]));
  assert.deepEqual(Object.keys(listed), Object.keys(receipt));
  for (const [key, value] of Object.entries(receipt)) assert.equal(listed[key], String(value), key);
});

test('nested packet-shape snippets validate against their specialist subschemas', async () => {
  const shapes = await readFile(new URL('packet-shapes.md', examples), 'utf8');
  const snippets = Object.fromEntries([...shapes.matchAll(/^## (.+)\n+```json\n([\s\S]*?)\n```$/gm)]
    .map(match => [match[1], JSON.parse(match[2])]));
  const schema = async lane => JSON.parse(await readFile(new URL('../schemas/' + lane + '.schema.json', import.meta.url), 'utf8'));
  const targets = {
    'Scout candidate (recommended_state only)': (await schema('opportunity_scout')).properties.candidates.items,
    'Risk assertion': (await schema('risk_officer')).properties.assertions.items,
  };
  assert.deepEqual(Object.keys(snippets).sort(), Object.keys(targets).sort(), 'every snippet has a subschema');
  const ajv = new Ajv2020({ allErrors: true, ownProperties: true });
  ajv.addFormat('date-time', value => timestamp(value) !== null);
  ajv.addFormat('uri', value => safeSourceUrl(value) !== null);
  for (const [heading, subschema] of Object.entries(targets)) {
    assert.equal(JSON.stringify(subschema).includes('$ref'), false, heading + ' compiles standalone');
    const validate = ajv.compile(subschema);
    assert.equal(validate(snippets[heading]), true, heading + ': ' + JSON.stringify(validate.errors));
  }
});
