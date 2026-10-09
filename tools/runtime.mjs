import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
