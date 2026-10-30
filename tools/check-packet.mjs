import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_JSON_INPUT_BYTES } from '../web/packet-constants.js';
import { validatePacket } from '../web/packet-validate.js';
import { validationReceipt, verifyReceipt } from '../web/packet-receipts.js';
import { InputError, readJsonFile, versionLine } from './runtime.mjs';

// The same formats, bounds and checks as the browser workbench's import and
// receipt tools. Nothing here adds a format: this is the browser path without a page.
const BUNDLE_FORMAT = 'crypto-research-bundle.v1';
export const MAX_RECEIPT_BYTES = 64 * 1024;
const LIMITATION = 'Local structural checks only, the same checks the browser workbench runs on import. '
  + 'This is not a signature, an authenticated review, source verification, or evidence of forecast accuracy.';

const invalidReport = report => ({ structurallyValid: false, errorCount: report.errorCount, errors: report.errors,
  gapCount: report.gapCount, gaps: report.gaps, warnings: report.warnings, omittedIssueCounts: report.omittedIssueCounts,
  limitation: LIMITATION });

// Returns { exitCode, output } for a parsed packet or bundle. Throws InputError
// for an unsupported bundle or receipt, which the command reports as exit 2.
export async function checkPacket(parsed, { receiptText = null, requireChart = false, now = Date.now() } = {}) {
  let packet = parsed;
  if (parsed?.format === BUNDLE_FORMAT) {
    // The browser's own bundle shape check: exactly format, packet and receipt.
    if (Object.keys(parsed).length !== 3 || !Object.hasOwn(parsed, 'packet') || !Object.hasOwn(parsed, 'receipt')) {
      throw new InputError('Unsupported research bundle format.');
    }
    packet = parsed.packet;
    const report = validatePacket(packet, now);
    if (!report.valid) return { exitCode: 1, output: invalidReport(report) };
    let bundle;
    try { bundle = await verifyReceipt(JSON.stringify(parsed.receipt), packet, now); }
    catch (error) { throw new InputError('The bundle receipt is not usable. ' + error.message); }
    if (!bundle.digestMatches || !bundle.recordMatches) {
      return { exitCode: 1, output: { bundle: { digestMatches: bundle.digestMatches, recordMatches: bundle.recordMatches, checkedAt: bundle.checkedAt }, limitation: LIMITATION } };
    }
  }
  const report = validatePacket(packet, now);
  if (!report.valid) return { exitCode: 1, output: invalidReport(report) };
  if (receiptText !== null) {
    let result;
    try { result = await verifyReceipt(receiptText, packet, now); }
    catch (error) { throw new InputError('The receipt is not usable. ' + error.message); }
    const passed = result.digestMatches && result.recordMatches && (!requireChart || result.currentChartEligible);
    return { exitCode: passed ? 0 : 1, output: result };
  }
  const receipt = await validationReceipt(packet, now);
  return { exitCode: requireChart && !receipt.chartEligible ? 1 : 0, output: receipt };
}

const usage = [
  'Usage: npm run check:packet -- <packet-or-bundle.json> [--receipt <receipt.json>] [--require-chart]',
  '       npm run check:packet -- --help | --version',
  '',
  'Checks one schema-version-1 workbench packet, or a ' + BUNDLE_FORMAT + ' packet bundle, offline',
  'with the parser, validator and receipt rules the browser workbench uses on import.',
  'The file must be strict UTF-8 JSON of at most ' + MAX_JSON_INPUT_BYTES / 1024 + ' KiB; a receipt at most ' + MAX_RECEIPT_BYTES / 1024 + ' KiB.',
  'A bundle must match its own receipt before its packet is checked. Save a receipt with',
  'npm run --silent check:packet -- <packet.json> > <receipt.json>, so the npm run banner stays out of it.',
  '',
  'Output (JSON on stdout):',
  '  valid packet       the crypto-research-check-receipt.v1 receipt for the current time,',
  '                     byte for byte the format of the browser check receipt download',
  '  invalid packet     structurallyValid false, with errors, gaps, warnings and their counts',
  '  bundle mismatch    bundle.digestMatches, bundle.recordMatches and bundle.checkedAt',
  '  --receipt FILE     digestMatches, recordMatches, checkedAt and currentChartEligible',
  '  --require-chart    also fail unless the chart gate is open',
  '',
  'Exit codes:',
  '  0  structurally valid; with --receipt the receipt matches; with --require-chart the chart gate is open',
  '  1  structurally invalid, a bundle or receipt mismatch, or a closed chart gate under --require-chart',
  '  2  unusable input: wrong arguments, an unreadable, oversized or unparsable file, or an unsupported bundle or receipt',
].join('\n') + '\n';

// Returns the parsed options, or null for unusable arguments.
export function parseArguments(args) {
  const options = { file: null, receipt: null, requireChart: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--require-chart' && !options.requireChart) options.requireChart = true;
    else if (arg === '--receipt' && options.receipt === null && index + 1 < args.length && !args[index + 1].startsWith('--')) options.receipt = args[++index];
    else if (!arg.startsWith('-') && options.file === null) options.file = arg;
    else return null;
  }
  return options.file === null ? null : options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = parseArguments(args);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage);
  } else if (args.length === 1 && args[0] === '--version') {
    process.stdout.write(versionLine(fileURLToPath(new URL('..', import.meta.url))) + '\n');
  } else if (!options) {
    // The arguments are never echoed: they are local file paths.
    process.stderr.write('Cannot check packet: name one packet or bundle file, optionally --receipt <file> and --require-chart.\n\n' + usage);
    process.exitCode = 2;
  } else try {
    const parsed = await readJsonFile(options.file, MAX_JSON_INPUT_BYTES);
    let receiptText = null;
    if (options.receipt !== null) {
      try { receiptText = JSON.stringify(await readJsonFile(options.receipt, MAX_RECEIPT_BYTES)); }
      catch (error) { throw error instanceof InputError ? new InputError('Receipt file: ' + error.message) : error; }
    }
    const { exitCode, output } = await checkPacket(parsed, { receiptText, requireChart: options.requireChart });
    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
    process.exitCode = exitCode;
  } catch (error) {
    // Only InputError messages are printed: they name the cause and never carry a path.
    const reason = error instanceof InputError ? error.message : 'The file cannot be read.';
    process.stderr.write('Cannot check packet: ' + reason + '\nUse npm run check:packet -- <packet-or-bundle.json> [--receipt <receipt.json>] [--require-chart].\n');
    process.exitCode = 2;
  }
}
