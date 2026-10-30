import { readFileSync } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parsePacket } from '../web/packet-parse.js';

const NODE_MAJOR = 24;

export function isSupportedNode(version) {
  return typeof version === 'string' && /^24\.\d+\.\d+(?:-.+)?$/.test(version);
}

export function assertSupportedNode(version = process.versions.node) {
  if (!isSupportedNode(version)) {
    throw new Error(`Crypto Research Desk tooling requires Node ${NODE_MAJOR}.x; received ${version || 'unknown'}.`);
  }
}

// The two release identities, for --version output: package.json versions the
// repository and workbench release, VERSION versions the frozen research core.
// The build and tools/check-version.mjs apply the strict agreement checks.
export function readReleaseVersions(root) {
  return {
    workbenchVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    researchCoreVersion: readFileSync(join(root, 'VERSION'), 'utf8').trim(),
  };
}

export function versionLine(root) {
  const { workbenchVersion, researchCoreVersion } = readReleaseVersions(root);
  return 'crypto-research-desk ' + workbenchVersion + ' (research core ' + researchCoreVersion + ')';
}

// An input the tools cannot use. Its message names the cause in plain words and
// never carries a local path, an errno code or a stack.
export class InputError extends Error {}

// Reads one strict UTF-8 JSON object through the browser's bounded packet parser.
// At most limit + 1 bytes are read, so an oversized file is refused without
// loading it whole.
export async function readJsonFile(path, limit) {
  let file;
  try { file = await open(path, 'r'); } catch {
    const kind = await stat(path).catch(() => null);
    throw new InputError(kind && !kind.isFile() ? 'The path is not a regular file.' : 'The file cannot be opened.');
  }
  let text;
  try {
    if (!(await file.stat()).isFile()) throw new InputError('The path is not a regular file.');
    const bytes = Buffer.alloc(limit + 1);
    let length = 0, count;
    try {
      while (length < bytes.length && (count = (await file.read(bytes, length, bytes.length - length, null)).bytesRead)) length += count;
    } catch { throw new InputError('The file cannot be read.'); }
    if (length > limit) throw new InputError('The file is larger than ' + limit / 1024 + ' KiB.');
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)); } catch { throw new InputError('The file is not valid UTF-8.'); }
  } finally { await file.close(); }
  try { return parsePacket(text); } catch (error) { throw new InputError(error.message); }
}
