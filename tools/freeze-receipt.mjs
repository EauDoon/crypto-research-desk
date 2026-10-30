import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpecialist } from './check-specialist.mjs';
import { InputError, hashFile, versionLine } from './runtime.mjs';

// Option name -> receipt field, in the freeze schema's field order.
const OPTIONS = Object.freeze({
  '--url': 'url', '--canonical-url': 'canonicalUrl', '--captured-at': 'capturedAt',
  '--content-type': 'contentType', '--etag': 'etag', '--note': 'note',
});

// Returns the parsed options, or null for unusable arguments.
export function parseArguments(args) {
  const fields = {};
  let file = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index], field = OPTIONS[arg];
    if (field && !Object.hasOwn(fields, field) && index + 1 < args.length && !args[index + 1].startsWith('--')) fields[field] = args[++index];
    else if (!arg.startsWith('-') && file === null) file = arg;
    else return null;
  }
  return file !== null && fields.url !== undefined && fields.capturedAt !== undefined ? { file, fields } : null;
}

// Builds a freeze receipt from the retained capture's own bytes. The sha256 and
// byte count are never supplied by the producer.
export function buildReceipt(fields, capture) {
  const receipt = { url: fields.url, canonicalUrl: fields.canonicalUrl ?? fields.url, capturedAt: fields.capturedAt,
    sha256: capture.sha256, bytes: capture.bytes };
  for (const key of ['contentType', 'etag', 'note']) if (fields[key] !== undefined) receipt[key] = fields[key];
  return receipt;
}

const usage = [
  'Usage: npm run freeze:receipt -- <retained capture file> --url <fetched URL> --captured-at <ISO time with offset>',
  '         [--canonical-url <URL>] [--content-type <type>] [--etag <etag>] [--note <text>]',
  '       npm run freeze:receipt -- --help | --version',
  '',
  'Builds a source freeze receipt from the bytes the desk retained. The sha256 and byte count',
  'are computed from the file, never typed in. --canonical-url defaults to --url. The receipt',
  'is checked with the freeze lane of check:specialist before it is printed.',
  'Keep retained captures under captures/, which git ignores.',
  '',
  'Exit codes:',
  '  0  the receipt passed the freeze lane and is printed as JSON',
  '  1  the receipt failed the freeze lane, for example an http URL or a time without an offset;',
  '     the check result is printed instead of the receipt',
  '  2  unusable input: wrong arguments or an unreadable capture file',
].join('\n') + '\n';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = parseArguments(args);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write(usage);
  } else if (args.length === 1 && args[0] === '--version') {
    process.stdout.write(versionLine(fileURLToPath(new URL('..', import.meta.url))) + '\n');
  } else if (!options) {
    // The arguments are never echoed: the first one is a local file path.
    process.stderr.write('Cannot build receipt: name one capture file, --url and --captured-at, each option at most once.\n\n' + usage);
    process.exitCode = 2;
  } else try {
    const receipt = buildReceipt(options.fields, await hashFile(options.file));
    const result = checkSpecialist('freeze', receipt);
    process.stdout.write(JSON.stringify(result.mechanical === 'PASS' ? receipt : result, null, 2) + '\n');
    process.exitCode = result.mechanical === 'PASS' ? 0 : 1;
  } catch (error) {
    // Only InputError messages are printed: they name the cause and never carry the path.
    const reason = error instanceof InputError ? error.message : 'The capture file cannot be read.';
    process.stderr.write('Cannot build receipt: ' + reason + '\n');
    process.exitCode = 2;
  }
}
