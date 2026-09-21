export const PUBLIC_FILES = Object.freeze([
  'index.html', '404.html', 'styles.css', 'app.js', 'packet.js', 'example.js', 'favicon.svg', 'robots.txt',
  'app-bootstrap.js', 'app-editor.js', 'app-events.js', 'app-render.js', 'app-state.js', 'app-utils.js',
  'packet-actions.js', 'packet-constants.js', 'packet-export.js', 'packet-format.js',
  'packet-parse.js', 'packet-receipts.js', 'packet-validate.js',
]);
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
