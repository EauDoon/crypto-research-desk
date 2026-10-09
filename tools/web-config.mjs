// The one list of published web sources. Hashed sources are in dependency
// order: every module comes after each module it imports, so the build rewrites
// imports to hashed names before hashing the importer. The split siblings come
// before the re-export shims (packet.js, app.js), and example.js imports from
// packet.js, so the packet shim is hashed first. tests/web.test.mjs checks it.
export const HASHED_SOURCES = Object.freeze([
  'favicon.svg', 'styles.css',
  'packet-constants.js', 'packet-parse.js', 'packet-validate.js',
  'packet-format.js', 'packet-export.js', 'packet-receipts.js', 'packet-actions.js',
  'packet.js',
  'example.js',
  'app-utils.js', 'app-state.js', 'app-editor.js', 'app-render.js',
  'app-events.js', 'app-bootstrap.js',
  'app.js',
]);
// Pages published under their own names, after hashed references are rewritten.
export const STATIC_PAGES = Object.freeze(['index.html', '404.html', 'robots.txt']);
export const PUBLIC_FILES = Object.freeze([...STATIC_PAGES, ...HASHED_SOURCES]);
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'none'; manifest-src 'self'";
export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
});
export const HASHED_ASSET = /^(?:app|packet|example)(?:-[a-z][a-z0-9]*)?\.[a-f0-9]{64}\.js$|^styles\.[a-f0-9]{64}\.css$|^favicon\.[a-f0-9]{64}\.svg$/;
export const MANAGED_FILE = name => ['index.html', '404.html', 'robots.txt', 'build-info.json'].includes(name) || HASHED_ASSET.test(name);
