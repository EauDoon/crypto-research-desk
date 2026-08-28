import { createServer } from 'node:http';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, HASHED_ASSET, MANAGED_FILE, SECURITY_HEADERS } from './web-config.mjs';
import { verifyBuild } from './build.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8' };

export async function startServer({ directory = join(root, 'web'), port = 4173, built = false } = {}) {
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Preview root must be a regular directory.');
  let allowed = new Set(PUBLIC_FILES);
  if (built) {
    await verifyBuild(directory);
    const manifestStat = await lstat(join(directory, 'build-info.json'));
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error('Invalid build manifest.');
    const manifest = JSON.parse(await readFile(join(directory, 'build-info.json'), 'utf8'));
    if (!Array.isArray(manifest.files) || manifest.files.length > 12 || !manifest.files.every(MANAGED_FILE)) throw new Error('Invalid public build allowlist.');
    allowed = new Set([...manifest.files, 'build-info.json']);
  }
  const server = createServer(async (request, response) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.setHeader(key, value);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    const address = server.address();
    if (![('127.0.0.1:' + address.port), ('localhost:' + address.port)].includes(request.headers.host)) {
      response.writeHead(403).end('Forbidden'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      response.writeHead(405).end('Method not allowed'); return;
    }
    let name;
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      name = pathname === '/' ? 'index.html' : pathname.slice(1);
    } catch { response.writeHead(400).end('Bad request'); return; }
    let status = 200;
    if (!allowed.has(name)) { name = '404.html'; status = 404; }
    try {
      const path = join(directory, name);
      const fileStat = await lstat(path);
      if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error('Invalid public file.');
      const body = await readFile(path);
      response.setHeader('Content-Type', types[extname(name)] ?? 'application/octet-stream');
      response.setHeader('Content-Length', body.length);
      if (built && status === 200) response.setHeader('Cache-Control',
        HASHED_ASSET.test(name) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
      response.writeHead(status);
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.removeHeader('Content-Length');
      response.writeHead(404).end(request.method === 'HEAD' ? undefined : 'Not found');
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolveListen);
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const port = portIndex === -1 ? 4173 : Number(args[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write('Use a valid local port.\n'); process.exitCode = 1;
  } else {
    try {
      const built = args.includes('--dist');
      const server = await startServer({ directory: join(root, built ? 'dist' : 'web'), port, built });
      process.stdout.write('Research Desk preview: http://127.0.0.1:' + server.address().port + '\n');
      for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
        server.closeAllConnections();
        server.close(() => process.exit(0));
      });
    } catch (error) { process.stderr.write('Preview failed: ' + error.message + '\n'); process.exitCode = 1; }
  }
}
