import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { examplePacket } from '../web/example.js';
import { blankPacket } from '../web/packet-format.js';
import { validationReceipt, verifyReceipt, exportResearchBundle, readResearchBundle } from '../web/packet-receipts.js';
import { checkPacket, parseArguments } from '../tools/check-packet.mjs';

const command = fileURLToPath(new URL('../tools/check-packet.mjs', import.meta.url));
const demoPath = fileURLToPath(new URL('../examples/demo-packet.json', import.meta.url));
const work = fileURLToPath(new URL('../work/', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [command, ...args], { encoding: 'utf8' });

async function scratch(t) {
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(join(work, 'check-packet-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const write = async (name, content) => { const path = join(directory, name); await writeFile(path, content); return path; };
  return { directory, write };
}

test('the demo packet example is the workbench example packet byte for byte', async () => {
  assert.equal(await readFile(demoPath, 'utf8'), JSON.stringify(examplePacket(), null, 2) + '\n');
});

test('a valid packet prints the browser check receipt and exits 0', async () => {
  const result = run(demoPath);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  const expected = await validationReceipt(examplePacket(), Date.parse(receipt.checkedAt));
  assert.equal(result.stdout, JSON.stringify(expected, null, 2) + '\n', 'the same bytes as the browser receipt download');
  assert.equal(receipt.format, 'crypto-research-check-receipt.v1');
  assert.equal(receipt.chartEligible, true);
  assert.deepEqual(await verifyReceipt(result.stdout.trim(), examplePacket()),
    { digestMatches: true, recordMatches: true, checkedAt: receipt.checkedAt, currentChartEligible: true });
});

test('a blank packet is valid but incomplete, and --require-chart fails it', async t => {
  const { write } = await scratch(t);
  const blank = await write('blank.json', JSON.stringify(blankPacket()));
  const plain = run(blank);
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(JSON.parse(plain.stdout).complete, false);
  const gated = run(blank, '--require-chart');
  assert.equal(gated.status, 1);
  assert.equal(JSON.parse(gated.stdout).chartEligible, false);
  assert.equal(run(demoPath, '--require-chart').status, 0);
});

test('an invalid packet exits 1 with the validator errors and no receipt', async t => {
  const { write } = await scratch(t);
  const packet = examplePacket();
  packet.horizons[0].scenarios[0].probability = 24;
  const result = run(await write('invalid.json', JSON.stringify(packet)));
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.structurallyValid, false);
  assert.equal(report.errorCount, 1);
  assert.deepEqual(report.errors.map(error => error.path), ['horizons[0].scenarios']);
  assert.deepEqual(Object.keys(report), ['structurallyValid', 'errorCount', 'errors', 'gapCount', 'gaps', 'warnings', 'omittedIssueCounts', 'limitation']);
  assert.equal('packetSha256' in report, false);
});

// Drift guard: the command accepts a bundle exactly when the browser's own
// readResearchBundle accepts it, without matching on its error messages.
test('bundle results agree with the browser bundle reader', async t => {
  const { write } = await scratch(t);
  const exported = await exportResearchBundle(examplePacket());
  const changedPacket = JSON.parse(exported); changedPacket.packet.thesis += ' Changed.';
  const changedReceipt = JSON.parse(exported); changedReceipt.receipt.gapCount += 1;
  const extraKey = JSON.parse(exported); extraKey.note = 'extra';
  const invalidPacket = JSON.parse(exported); invalidPacket.packet.horizons[0].scenarios[0].probability = 24;
  const cases = [
    ['exported', exported, 0],
    ['changed packet', JSON.stringify(changedPacket), 1],
    ['changed receipt', JSON.stringify(changedReceipt), 1],
    ['fourth key', JSON.stringify(extraKey), 2],
    ['invalid bundled packet', JSON.stringify(invalidPacket), 1],
  ];
  for (const [name, text, status] of cases) {
    const browserAccepts = await readResearchBundle(text).then(() => true, () => false);
    const result = run(await write(name.replaceAll(' ', '-') + '.json', text));
    assert.equal(result.status, status, name + ': ' + result.stderr);
    assert.equal(result.status === 0, browserAccepts, name + ' agrees with readResearchBundle');
  }
  const mismatch = JSON.parse(run(await write('mismatch.json', JSON.stringify(changedPacket))).stdout);
  assert.equal(mismatch.bundle.digestMatches, false);
  const record = JSON.parse(run(await write('record.json', JSON.stringify(changedReceipt))).stdout);
  assert.deepEqual([record.bundle.digestMatches, record.bundle.recordMatches], [true, false]);
  const unsupported = run(await write('unsupported.json', JSON.stringify(extraKey)));
  assert.match(unsupported.stderr, /^Cannot check packet: Unsupported research bundle format\./);
  assert.equal(unsupported.stdout, '');
  const good = JSON.parse(run(await write('good.json', exported)).stdout);
  assert.equal(good.packetSha256, JSON.parse(exported).receipt.packetSha256, 'a matching bundle continues with its packet');
});

test('--receipt verifies a receipt against the packet', async t => {
  const { write } = await scratch(t);
  const matching = await write('receipt.json', JSON.stringify(await validationReceipt(examplePacket()), null, 2) + '\n');
  const ok = run(demoPath, '--receipt', matching);
  assert.equal(ok.status, 0, ok.stderr);
  const result = JSON.parse(ok.stdout);
  assert.deepEqual([result.digestMatches, result.recordMatches, result.currentChartEligible], [true, true, true]);
  const other = blankPacket(); other.thesis = 'A different packet.';
  const otherReceipt = await write('other.json', JSON.stringify(await validationReceipt(other)));
  const mismatch = run(demoPath, '--receipt', otherReceipt);
  assert.equal(mismatch.status, 1);
  assert.equal(JSON.parse(mismatch.stdout).digestMatches, false);
  const blankReceipt = await write('blank-receipt.json', JSON.stringify(await validationReceipt(blankPacket())));
  const blank = await write('blank.json', JSON.stringify(blankPacket()));
  assert.equal(run(blank, '--receipt', blankReceipt).status, 0);
  assert.equal(run(blank, '--receipt', blankReceipt, '--require-chart').status, 1);
  const bogus = run(demoPath, '--receipt', await write('bogus.json', '{"format": "other"}'));
  assert.equal(bogus.status, 2);
  assert.match(bogus.stderr, /^Cannot check packet: The receipt is not usable\./);
  const large = run(demoPath, '--receipt', await write('large-sensitive.json', Buffer.alloc(64 * 1024 + 1, 0x20)));
  assert.equal(large.status, 2);
  assert.match(large.stderr, /Receipt file: The file is larger than 64 KiB\./);
  assert.doesNotMatch(large.stderr, /sensitive/);
});

// Release 1.11.0 recorded every missing required time as 'Capture time is UNKNOWN.'.
const LEGACY_TIME_GAP = /^(?:sources\[\d+\]\.publishedAt|riskReview\.reviewedAt)$/;
const legacyWording = receipt => ({ ...receipt,
  gaps: receipt.gaps.map(item => LEGACY_TIME_GAP.test(item.path) ? { ...item, message: 'Capture time is UNKNOWN.' } : item) });

test('receipts and bundles saved by 1.11.0 with the old missing-time wording still verify', async t => {
  const { write } = await scratch(t);
  const draft = examplePacket(); draft.sources[0].publishedAt = '';
  const review = examplePacket(); review.riskReview.reviewedAt = '';
  for (const [name, packet, path, current] of [['draft', draft, 'sources[0].publishedAt', 'Publication time is UNKNOWN.'],
    ['review', review, 'riskReview.reviewedAt', 'Review time is UNKNOWN.']]) {
    const receipt = await validationReceipt(packet);
    assert.equal(receipt.gaps.find(item => item.path === path).message, current);
    const legacy = legacyWording(receipt);
    assert.equal(legacy.gaps.find(item => item.path === path).message, 'Capture time is UNKNOWN.');
    const legacyText = JSON.stringify(legacy, null, 2) + '\n';
    assert.deepEqual(await verifyReceipt(legacyText, packet),
      { digestMatches: true, recordMatches: true, checkedAt: legacy.checkedAt, currentChartEligible: false }, name);
    const bundle = JSON.stringify({ format: 'crypto-research-bundle.v1', packet, receipt: legacy }) + '\n';
    assert.equal(JSON.stringify(await readResearchBundle(bundle)), JSON.stringify(packet), name + ' bundle imports');
    const bundled = run(await write(name + '-bundle.json', bundle));
    assert.equal(bundled.status, 0, name + ': ' + bundled.stderr);
    const packetPath = await write(name + '-packet.json', JSON.stringify(packet, null, 2) + '\n');
    const saved = run(packetPath, '--receipt', await write(name + '-receipt.json', legacyText));
    assert.equal(saved.status, 0, name + ': ' + saved.stdout);
    // Only the exact 1.11.0 wording at the field 1.11.0 wrote it is accepted.
    for (const message of ['Review time is UNKNOWN.', 'Information is UNKNOWN.']) {
      if (message === current) continue;
      const altered = { ...legacy, gaps: legacy.gaps.map(item => item.path === path ? { ...item, message } : item) };
      assert.equal((await verifyReceipt(JSON.stringify(altered), packet)).recordMatches, false, name + ' ' + message);
    }
  }
  const blank = blankPacket();
  const misplaced = await validationReceipt(blank);
  const swapped = { ...misplaced, gaps: misplaced.gaps.map(item => item.message === 'Information is UNKNOWN.' ? { ...item, message: 'Capture time is UNKNOWN.' } : item) };
  assert.notDeepEqual(swapped.gaps, misplaced.gaps);
  assert.equal((await verifyReceipt(JSON.stringify(swapped), blank)).recordMatches, false, 'other fields keep their wording');
});

test('unusable inputs and arguments exit 2 with the reason named and no path echoed', async t => {
  const { directory, write } = await scratch(t);
  const cases = [
    [[join(directory, 'missing-sensitive.json')], /The file cannot be opened\./],
    [[directory], /The path is not a regular file\./],
    [[await write('large-sensitive.json', Buffer.alloc(320 * 1024 + 1, 0x20))], /The file is larger than 320 KiB\./],
    [[await write('bytes-sensitive.json', Buffer.from([0xff, 0xfe, 0x7b, 0x7d]))], /The file is not valid UTF-8\./],
    [[await write('duplicate-sensitive.json', '{"kind": 1, "kind": 2}')], /Duplicate object key is not allowed\./],
    [[demoPath, '--frobnicate'], /name one packet or bundle file/],
    [[demoPath, demoPath], /name one packet or bundle file/],
    [[demoPath, '--receipt'], /name one packet or bundle file/],
    [[demoPath, '--require-chart', '--require-chart'], /name one packet or bundle file/],
    [['--require-chart'], /name one packet or bundle file/],
    [[], /name one packet or bundle file/],
  ];
  for (const [args, reason] of cases) {
    const result = run(...args);
    assert.equal(result.status, 2, String(reason));
    assert.match(result.stderr, /^Cannot check packet: /);
    assert.match(result.stderr, reason);
    assert.doesNotMatch(result.stderr, /sensitive|check-packet-test|demo-packet|ENOENT|EISDIR|\.mjs:\d/, String(reason));
    assert.equal(result.stdout, '', String(reason));
  }
});

test('the packet checker prints help and both versions', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const core = (await readFile(new URL('../VERSION', import.meta.url), 'utf8')).trim();
  const version = run('--version');
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout, 'crypto-research-desk ' + pkg.version + ' (research core ' + core + ')\n');
  for (const flag of ['--help', '-h']) {
    const help = run(flag);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /--receipt <receipt\.json>/);
    assert.match(help.stdout, /--require-chart/);
    assert.match(help.stdout, /crypto-research-bundle\.v1/);
    assert.match(help.stdout, /0 {2}structurally valid/);
    assert.match(help.stdout, /2 {2}unusable input/);
  }
});

test('the library returns exit codes for parsed input and parses arguments strictly', async () => {
  assert.equal((await checkPacket(examplePacket())).exitCode, 0);
  assert.equal((await checkPacket(blankPacket(), { requireChart: true })).exitCode, 1);
  assert.deepEqual(parseArguments(['a.json', '--receipt', 'r.json', '--require-chart']), { file: 'a.json', receipt: 'r.json', requireChart: true });
  assert.equal(parseArguments(['a.json', '--receipt', '--require-chart']), null);
  assert.equal(parseArguments(['-x']), null);
});
