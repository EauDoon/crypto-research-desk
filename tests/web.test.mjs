import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { request } from 'node:http';
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, verifyBuild } from '../tools/build.mjs';
import { startServer } from '../tools/serve.mjs';
import { isFirefoxStartupRace, navigate } from './browser/navigation.mjs';
import { PUBLIC_FILES, HASHED_ASSET, SECURITY_HEADERS } from '../tools/web-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'work');
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(join(work, 'web-test-'));
  t.after(async () => {
    const checked = await realpath(directory);
    const allowed = await realpath(work);
    assert.ok(checked.startsWith(allowed + sep), 'cleanup stays inside project work');
    assert.equal((await lstat(directory)).isSymbolicLink(), false);
    await rm(directory, { recursive: true, force: true });
  });
  await cp(join(root, 'web'), join(directory, 'web'), { recursive: true });
  await copyFile(join(root, 'VERSION'), join(directory, 'VERSION'));
  await copyFile(join(root, 'package.json'), join(directory, 'package.json'));
  return directory;
}
function http(server, path = '/', method = 'GET', host) {
  const port = server.address().port;
  return new Promise((resolveRequest, reject) => {
    const call = request({ hostname: '127.0.0.1', port, path, method,
      headers: { Host: host ?? '127.0.0.1:' + port } }, response => {
      const parts = [];
      response.on('data', chunk => parts.push(chunk));
      response.on('end', () => resolveRequest({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts).toString('utf8') }));
    });
    call.once('error', reject); call.end();
  });
}
async function serverFor(t, directory, built) {
  const server = await startServer({ directory, port: 0, built });
  t.after(() => new Promise(resolveClose => {
    server.closeAllConnections(); server.close(resolveClose);
  }));
  return server;
}

test('the build is deterministic and publishes only the reviewed static allowlist', async t => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'web', 'private-notes.md'), 'Not part of the public build.');
  const first = await build(directory);
  const second = await build(directory);
  assert.deepEqual(second, first);
  assert.equal(first.files.length, PUBLIC_FILES.length);
  assert.equal(first.files.filter(name => HASHED_ASSET.test(name)).length, 5);
  assert.equal((await readdir(join(directory, 'dist'))).length, 9);
  assert.ok(!first.files.includes('private-notes.md'));
  assert.deepEqual(await verifyBuild(join(directory, 'dist')), first);
  const html = await readFile(join(directory, 'dist', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /\/(?:app\.js|styles\.css|favicon\.svg)/);
  for (const name of first.files.filter(name => HASHED_ASSET.test(name))) {
    const contents = await readFile(join(directory, 'dist', name), 'utf8');
    assert.equal(name.split('.')[1], sha(contents), name);
    if (name.endsWith('.js')) assert.doesNotMatch(contents, /from '\.\/(?:packet|example)\.js'/);
  }
});

test('changed source creates new hashes and removes only previous generated assets', async t => {
  const directory = await fixture(t);
  const first = await build(directory);
  const styles = await readFile(join(directory, 'web', 'styles.css'), 'utf8');
  await writeFile(join(directory, 'web', 'styles.css'), styles + '\n/* Test-only source change. */\n');
  const second = await build(directory);
  assert.notEqual(second.artifactHash, first.artifactHash);
  assert.notEqual(second.files.find(name => name.startsWith('styles.')), first.files.find(name => name.startsWith('styles.')));
  assert.deepEqual((await readdir(join(directory, 'dist'))).sort(), [...second.files, 'build-info.json'].sort());
});

test('unmanaged output prevents a build without deleting or overwriting it', async t => {
  const directory = await fixture(t);
  await mkdir(join(directory, 'dist'));
  const retained = join(directory, 'dist', 'operator-notes.txt');
  await writeFile(retained, 'Keep this file.');
  await assert.rejects(build(directory), /unmanaged/);
  assert.equal(await readFile(retained, 'utf8'), 'Keep this file.');
});

test('extra output after a build is preserved and prevents overwrite or preview', async t => {
  const directory = await fixture(t);
  const manifest = await build(directory);
  const extra = join(directory, 'dist', 'operator-notes.txt');
  await writeFile(extra, 'Keep this file.');
  await assert.rejects(build(directory), /unrecognized/);
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Unexpected public output/);
  assert.equal(await readFile(extra, 'utf8'), 'Keep this file.');
  assert.ok(await readFile(join(directory, 'dist', manifest.files.find(name => name.startsWith('app.')))));
});

test('a modified built asset fails digest verification and cannot be previewed', async t => {
  const directory = await fixture(t);
  const manifest = await build(directory);
  await writeFile(join(directory, 'dist', manifest.files.find(name => name.startsWith('app.'))), 'Changed bytes.');
  await assert.rejects(verifyBuild(join(directory, 'dist')), /digest mismatch/);
  await assert.rejects(startServer({ directory: join(directory, 'dist'), built: true, port: 0 }), /digest mismatch/);
});

test('manifest version and required asset membership are checked', async t => {
  const directory = await fixture(t);
  const manifest = await build(directory);
  const manifestPath = join(directory, 'dist', 'build-info.json');
  await writeFile(manifestPath, JSON.stringify({ ...manifest, researchCoreVersion: '0.0.0' }));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /version mismatch/);
  const wrongFiles = manifest.files.map(name => name.startsWith('app.') ? 'app.' + '0'.repeat(64) + '.js' : name);
  wrongFiles[wrongFiles.findIndex(name => name.startsWith('packet.'))] = 'app.' + '1'.repeat(64) + '.js';
  await writeFile(manifestPath, JSON.stringify({ ...manifest, files: wrongFiles }));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Missing or duplicate/);
});

test('symlinked source and build directories are rejected', async t => {
  const directory = await fixture(t);
  await rename(join(directory, 'web'), join(directory, 'web-real'));
  await symlink(join(directory, 'web-real'), join(directory, 'web'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(build(directory), /regular files and directories/);
  await symlink(join(directory, 'web-real'), join(directory, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyBuild(join(directory, 'dist')), /regular files and directories/);
  await assert.rejects(startServer({ directory: join(directory, 'web'), port: 0 }), /regular directory/);
});

test('source and built servers enforce methods, host checks, allowlists, and security headers', async t => {
  const directory = await fixture(t);
  const manifest = await build(directory);
  for (const built of [false, true]) {
    const server = await serverFor(t, join(directory, built ? 'dist' : 'web'), built);
    const home = await http(server);
    assert.equal(home.status, 200);
    assert.match(home.body, /Crypto Research Desk/);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) assert.equal(home.headers[key.toLowerCase()], value);
    assert.equal(home.headers['access-control-allow-origin'], undefined);
    const head = await http(server, '/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body, '');
    assert.ok(Number(head.headers['content-length']) > 0);
    assert.equal((await http(server, '/', 'POST')).status, 405);
    assert.equal((await http(server, '/', 'GET', 'untrusted.example')).status, 403);
    assert.equal((await http(server, '/%zz')).status, 400);
    for (const path of ['/../AGENTS.md', '/%2e%2e/AGENTS.md', '/.git/config', '/package.json', '/missing']) {
      const response = await http(server, path);
      assert.equal(response.status, 404, path);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.ok(!response.body.includes(directory));
    }
    const asset = await http(server, '/' + (built ? manifest.files.find(name => name.startsWith('app.')) : 'app.js'));
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['cache-control'], built ? 'public, max-age=31536000, immutable' : 'no-store');
    assert.equal(home.headers['cache-control'], built ? 'public, max-age=0, must-revalidate' : 'no-store');
    assert.equal((await http(server, '/build-info.json')).status, built ? 200 : 404);
  }
});

test('Firefox navigation recovery requires the exact completed and successful startup signature', () => {
  const hash = '0'.repeat(64);
  const baseline = {
    browserName: 'firefox', errorName: 'TimeoutError', reload: false,
    documentState: { origin: 'http://127.0.0.1:4173', path: '/', readyState: 'complete', symbol: 'DEMO', stylesheets: 1 },
    events: ['domcontentloaded', 'load'], failures: [], pending: [], runtimeErrors: [],
    responses: ['/', ...['app', 'packet', 'example'].map(name => '/' + name + '.' + hash + '.js'),
      '/styles.' + hash + '.css', '/favicon.' + hash + '.svg'].map(path => ({ path, status: 200 })),
  };
  assert.equal(isFirefoxStartupRace(baseline), true);
  const rejected = [
    { browserName: 'chromium' }, { errorName: 'AssertionError' }, { reload: true },
    { documentState: { ...baseline.documentState, readyState: 'interactive' } },
    { documentState: { ...baseline.documentState, origin: 'https://example.com' } },
    { documentState: { ...baseline.documentState, symbol: 'UNKNOWN' } },
    { documentState: { unavailable: true } }, { events: ['domcontentloaded'] },
    { failures: [{ path: '/app.js', error: 'failed' }] }, { pending: ['/app.js'] },
    { runtimeErrors: ['Application failed'] }, { responses: baseline.responses.slice(1) },
    { responses: baseline.responses.map((response, i) => i === 1 ? { ...response, status: 404 } : response) },
    { responses: baseline.responses.map((response, i) => i === 1 ? { ...response, path: '/unknown.js' } : response) },
  ];
  for (const change of rejected) assert.equal(isFirefoxStartupRace({ ...baseline, ...change }), false, JSON.stringify(change));
});

test('Firefox startup recovery makes one attempt and preserves subsequent failures', async t => {
  t.mock.method(console, 'warn', () => {});
  const manifest = await build(await fixture(t));
  const paths = ['/', ...manifest.files.filter(name => HASHED_ASSET.test(name)).map(name => '/' + name)];
  for (const secondFailure of [null, 'timeout', 'asset', 'missing', 'document']) {
    const page = new EventEmitter(); let calls = 0;
    page.context = () => ({ browser: () => ({ browserType: () => ({ name: () => 'firefox' }) }) });
    page.evaluate = async () => ({ origin: 'http://127.0.0.1:4173', path: '/', readyState: 'complete',
      symbol: calls === 2 && secondFailure === 'document' ? 'UNKNOWN' : 'DEMO', stylesheets: 1 });
    page.goto = async () => {
      calls++;
      for (const path of paths) {
        if (calls === 2 && secondFailure === 'missing' && path.startsWith('/styles.')) continue;
        const request = { url: () => 'http://127.0.0.1:4173' + path };
        page.emit('request', request);
        page.emit('response', { url: request.url, status: () => calls === 2 && secondFailure === 'asset' && path.startsWith('/styles.') ? 404 : 200 });
        page.emit('requestfinished', request);
      }
      page.emit('domcontentloaded'); page.emit('load');
      if (calls === 1 || secondFailure === 'timeout') {
        const error = new Error('Navigation still failed'); error.name = 'TimeoutError'; throw error;
      }
      return { status: () => 200 };
    };
    if (secondFailure) await assert.rejects(navigate(page), /Navigation still failed|recovered navigation/);
    else await navigate(page);
    assert.equal(calls, 2, 'only one recovery attempt');
    assert.equal(page.eventNames().length, 0, 'temporary listeners are removed');
  }
});
