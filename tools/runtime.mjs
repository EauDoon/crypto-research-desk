const NODE_MAJOR = 24;

export function isSupportedNode(version) {
  return typeof version === 'string' && /^24\.\d+\.\d+(?:-.+)?$/.test(version);
}

export function assertSupportedNode(version = process.versions.node) {
  if (!isSupportedNode(version)) {
    throw new Error(`Crypto Research Desk tooling requires Node ${NODE_MAJOR}.x; received ${version || 'unknown'}.`);
  }
}
