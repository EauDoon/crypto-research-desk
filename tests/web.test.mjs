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
import { assertSupportedNode, isSupportedNode } from '../tools/runtime.mjs';
import { isFirefoxStartupRace, navigate } from './browser/navigation.mjs';
import { PUBLIC_FILES, HASHED_ASSET, SECURITY_HEADERS } from '../tools/web-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'work');
const sha = value => createHash('sha256').update(value).digest('hex');
async function directorySnapshot(directory) {
  const snapshot = {};
  for (const name of (await readdir(directory)).sort()) {
    snapshot[name] = (await readFile(join(directory, name))).toString('base64');
  }
  return snapshot;
}
async function recoveryEntries(directory) {
  return (await readdir(directory)).filter(name => name === '.dist-build.lock' || name.startsWith('.dist-stage-')).sort();
}
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
  await copyFile(join(root, 'package-lock.json'), join(directory, 'package-lock.json'));
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

test('tooling accepts Node 24.x and fails fast for other or malformed versions', () => {
  for (const version of ['24.0.0', '24.14.0', '24.1.0-nightly']) {
    assert.equal(isSupportedNode(version), true, version);
    assert.doesNotThrow(() => assertSupportedNode(version));
  }
  for (const version of ['22.22.2', '23.11.0', '25.0.0', '24', '24.1', '']) {
    assert.equal(isSupportedNode(version), false, String(version));
    assert.throws(() => assertSupportedNode(version), /requires Node 24\.x/);
  }
  assert.equal(isSupportedNode(undefined), false);
  assert.doesNotThrow(() => assertSupportedNode());
});

test('Vercel production settings match the verified build and security configuration', async () => {
  const config = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.installCommand, 'npm ci --ignore-scripts --omit=dev');
  assert.equal(config.outputDirectory, 'dist');
  assert.equal(config.headers.length, 2);
  const headers = (entry, count) => {
    const keys = entry.headers.map(item => item.key);
    assert.equal(keys.length, count);
    assert.equal(new Set(keys).size, keys.length, 'Vercel header keys must be unique');
    return Object.fromEntries(entry.headers.map(item => [item.key, item.value]));
  };
  assert.deepEqual(headers(config.headers[0], Object.keys(SECURITY_HEADERS).length + 1), {
    ...SECURITY_HEADERS,
    'Cache-Control': 'public, max-age=0, must-revalidate',
  });
  assert.equal(config.headers[0].source, '/(.*)');
  assert.equal(config.headers[1].source, '/:file([a-z]+\\.[a-f0-9]{64}\\.[a-z]+)');
  assert.deepEqual(headers(config.headers[1], 1), {
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
});

test('the build is deterministic and publishes only the reviewed static allowlist', async t => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'web', 'private-notes.md'), 'Not part of the public build.');
  const first = await build(directory);
  const second = await build(directory);
  assert.deepEqual(second, first);
  assert.equal(first.formatVersion, 2);
  assert.equal(first.workbenchVersion, '1.2.1');
  assert.equal(first.researchCoreVersion, '1.1.0');
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

test('package and lockfile workbench versions must remain identical', async t => {
  const directory = await fixture(t);
  const lockPath = join(directory, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  lock.packages[''].version = '1.2.2';
  await writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  await assert.rejects(build(directory), /Package and lockfile workbench versions differ/);
  await assert.rejects(lstat(join(directory, 'dist')), { code: 'ENOENT' });
  assert.deepEqual(await recoveryEntries(directory), []);
});

test('the build rejects malformed modules and unresolved local imports before publishing', async t => {
  const malformed = await fixture(t);
  await writeFile(join(malformed, 'web', 'app.js'), 'import {');
  await assert.rejects(build(malformed), /syntax check failed/);
  await assert.rejects(lstat(join(malformed, 'dist')), { code: 'ENOENT' });

  const unresolved = await fixture(t);
  const app = await readFile(join(unresolved, 'web', 'app.js'), 'utf8');
  await writeFile(join(unresolved, 'web', 'app.js'), app + "\nimport './missing.js';\n");
  await assert.rejects(build(unresolved), /missing local asset/);
  await assert.rejects(lstat(join(unresolved, 'dist')), { code: 'ENOENT' });

  const commented = await fixture(t);
  const commentedApp = await readFile(join(commented, 'web', 'app.js'), 'utf8');
  await writeFile(join(commented, 'web', 'app.js'), commentedApp + "\nimport /* build guard */ './missing.js';\n");
  await assert.rejects(build(commented), /missing local asset/);
  await assert.rejects(lstat(join(commented, 'dist')), { code: 'ENOENT' });

  const dynamic = await fixture(t);
  const dynamicApp = await readFile(join(dynamic, 'web', 'app.js'), 'utf8');
  await writeFile(join(dynamic, 'web', 'app.js'), dynamicApp + "\nimport /* build guard */ ('./missing.js');\n");
  await assert.rejects(build(dynamic), /unsupported dynamic import/);
  await assert.rejects(lstat(join(dynamic, 'dist')), { code: 'ENOENT' });

  const singleQuoted = await fixture(t);
  const html = await readFile(join(singleQuoted, 'web', 'index.html'), 'utf8');
  await writeFile(join(singleQuoted, 'web', 'index.html'), html.replace('</body>', "<script src='/missing.js'></script></body>"));
  await assert.rejects(build(singleQuoted), /missing local asset/);
  await assert.rejects(lstat(join(singleQuoted, 'dist')), { code: 'ENOENT' });

  const relativeHtml = await fixture(t);
  const relativeSource = await readFile(join(relativeHtml, 'web', 'index.html'), 'utf8');
  await writeFile(join(relativeHtml, 'web', 'index.html'), relativeSource.replace('</body>', '<script src="./missing.js"></script></body>'));
  await assert.rejects(build(relativeHtml), /missing local asset/);
  await assert.rejects(lstat(join(relativeHtml, 'dist')), { code: 'ENOENT' });

  const relativeCss = await fixture(t);
  const css = await readFile(join(relativeCss, 'web', 'styles.css'), 'utf8');
  await writeFile(join(relativeCss, 'web', 'styles.css'), css + "\n.missing { background-image: url('./missing.svg'); }\n");
  await assert.rejects(build(relativeCss), /missing local asset/);
  await assert.rejects(lstat(join(relativeCss, 'dist')), { code: 'ENOENT' });
});

test('malformed UTF-8 source fails closed without replacing the prior artifact', async t => {
  const directory = await fixture(t);
  const output = join(directory, 'dist');
  const manifest = await build(directory);
  const before = await directorySnapshot(output);
  const path = join(directory, 'web', 'styles.css');
  const source = await readFile(path);
  await writeFile(path, Buffer.concat([source, Buffer.from([10, 47, 42, 32, 255, 32, 42, 47, 10])]));
  await assert.rejects(build(directory), /not valid UTF-8: .*styles\.css/);
  assert.deepEqual(await directorySnapshot(output), before);
  assert.deepEqual(await verifyBuild(output), manifest);
  assert.deepEqual(await recoveryEntries(directory), []);
});

test('built artifact verification rejects invalid bytes rather than hashing decoded replacement text', async t => {
  const directory = await fixture(t);
  const sourcePath = join(directory, 'web', 'styles.css');
  await writeFile(sourcePath, (await readFile(sourcePath, 'utf8')) + '\n/* \uFFFD */\n');
  const manifest = await build(directory);
  const name = manifest.files.find(value => value.startsWith('styles.'));
  const path = join(directory, 'dist', name);
  const contents = await readFile(path);
  const replacement = Buffer.from([239, 191, 189]);
  const offset = contents.indexOf(replacement);
  assert.notEqual(offset, -1);
  await writeFile(path, Buffer.concat([contents.subarray(0, offset), Buffer.from([255]), contents.subarray(offset + replacement.length)]));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /not valid UTF-8/);
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

test('a failed staged publication restores the prior artifact and removes temporary directories', async t => {
  const directory = await fixture(t);
  const first = await build(directory);
  const output = join(directory, 'dist');
  const before = await directorySnapshot(output);
  const styles = await readFile(join(directory, 'web', 'styles.css'), 'utf8');
  await writeFile(join(directory, 'web', 'styles.css'), styles + '\n/* Staged publication failure. */\n');
  await assert.rejects(build(directory, { beforePublish() {
    throw new Error('Simulated publication failure.');
  } }), /Simulated publication failure/);
  assert.deepEqual(await directorySnapshot(output), before, 'the previous artifact remains byte-identical');
  assert.deepEqual(await verifyBuild(output), first);
  assert.deepEqual(await recoveryEntries(directory), []);
});

test('stale build recovery data and locks are preserved and fail closed', async t => {
  const staged = await fixture(t);
  const recovery = join(staged, '.dist-stage-interrupted-previous');
  await mkdir(recovery);
  await writeFile(join(recovery, 'operator-note.txt'), 'Preserve this recovery evidence.');
  await assert.rejects(build(staged), /recovery data is present: \.dist-stage-interrupted-previous/);
  assert.equal(await readFile(join(recovery, 'operator-note.txt'), 'utf8'), 'Preserve this recovery evidence.');
  assert.deepEqual(await recoveryEntries(staged), ['.dist-stage-interrupted-previous']);

  const locked = await fixture(t);
  const lock = join(locked, '.dist-build.lock');
  await mkdir(lock);
  await writeFile(join(lock, 'owner.txt'), 'Unknown prior owner.');
  await assert.rejects(build(locked), /unfinished or concurrent build state.*\.dist-build\.lock/);
  assert.equal(await readFile(join(lock, 'owner.txt'), 'utf8'), 'Unknown prior owner.');
});

test('the exclusive build lock rejects a concurrent publisher without disturbing either artifact', async t => {
  const directory = await fixture(t);
  await build(directory);
  const sourcePath = join(directory, 'web', 'styles.css');
  await writeFile(sourcePath, (await readFile(sourcePath, 'utf8')) + '\n/* Concurrent publication candidate. */\n');
  let enterPublish;
  let releasePublish;
  const entered = new Promise(resolveEntered => { enterPublish = resolveEntered; });
  const hold = new Promise(resolveHold => { releasePublish = resolveHold; });
  const first = build(directory, { async beforePublish() {
    enterPublish();
    await hold;
  } });
  await entered;
  try {
    await assert.rejects(build(directory), /unfinished or concurrent build state.*\.dist-build\.lock/);
  } finally {
    releasePublish();
  }
  const manifest = await first;
  assert.deepEqual(await verifyBuild(join(directory, 'dist')), manifest);
  assert.deepEqual(await recoveryEntries(directory), []);
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
  const writeManifest = value => writeFile(manifestPath, JSON.stringify(value, null, 2) + '\n');
  await writeManifest({ ...manifest, workbenchVersion: '0.0.0' });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /workbench version mismatch/);
  await writeManifest({ ...manifest, researchCoreVersion: '0.0.0' });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /version mismatch/);
  const wrongFiles = manifest.files.map(name => name.startsWith('app.') ? 'app.' + '0'.repeat(64) + '.js' : name);
  wrongFiles[wrongFiles.findIndex(name => name.startsWith('packet.'))] = 'app.' + '1'.repeat(64) + '.js';
  await writeManifest({ ...manifest, files: wrongFiles });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Invalid build manifest|Missing or duplicate/);
});

test('manifest JSON has an exact canonical schema', async t => {
  const directory = await fixture(t);
  const manifest = await build(directory);
  const manifestPath = join(directory, 'dist', 'build-info.json');
  const writeManifest = value => writeFile(manifestPath, JSON.stringify(value, null, 2) + '\n');

  await writeManifest({ ...manifest, unexpectedPublicMetadata: 'must not be served' });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Invalid build manifest/);
  await writeManifest({ ...manifest, artifactHash: 'A'.repeat(64) });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Invalid build manifest/);
  await writeManifest({ ...manifest, files: [...manifest.files].reverse() });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Invalid build manifest/);
  await writeManifest({ ...manifest, workbenchVersion: '01.2.0' });
  await assert.rejects(verifyBuild(join(directory, 'dist')), /Invalid build manifest/);
  await writeFile(manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /not canonical/);
  const canonical = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(manifestPath, canonical.replace('"formatVersion": 2,', '"formatVersion": 2,\n  "formatVersion": 2,'));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /not canonical/);
  await writeFile(manifestPath, Buffer.concat([Buffer.from(canonical), Buffer.from([255])]));
  await assert.rejects(verifyBuild(join(directory, 'dist')), /not valid UTF-8/);
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

test('built preview serves one immutable verified byte snapshot after mutation and rebuild', async t => {
  const directory = await fixture(t);
  const first = await build(directory);
  const output = join(directory, 'dist');
  const server = await serverFor(t, output, true);
  const firstStyle = first.files.find(name => name.startsWith('styles.'));
  const originalHome = await http(server);
  const originalStyle = await http(server, '/' + firstStyle);
  await writeFile(join(output, 'index.html'), 'Post-start tampering must not be served.');
  assert.equal((await http(server)).body, originalHome.body);

  const sourcePath = join(directory, 'web', 'styles.css');
  await writeFile(sourcePath, (await readFile(sourcePath, 'utf8')) + '\n/* New build after preview startup. */\n');
  const second = await build(directory);
  assert.notEqual(second.files.find(name => name.startsWith('styles.')), firstStyle);
  assert.equal((await http(server)).body, originalHome.body);
  const retainedStyle = await http(server, '/' + firstStyle);
  assert.equal(retainedStyle.status, 200);
  assert.equal(retainedStyle.body, originalStyle.body);
  assert.equal(retainedStyle.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal((await http(server, '/' + second.files.find(name => name.startsWith('styles.')))).status, 404);
});

function loadedNavigationDocument(paths, documentId = 'first') {
  return { origin: 'http://127.0.0.1:4173', path: '/', readyState: 'complete', documentId,
    nativeEvents: ['domcontentloaded', 'load'], symbol: 'DEMO', hasChart: true, assertionCount: 5,
    modulePath: paths.find(path => path.startsWith('/app.')),
    stylesheets: [{ path: paths.find(path => path.startsWith('/styles.')), rules: 100 }] };
}

test('Firefox navigation recovery requires the exact completed and successful startup signature', () => {
  const hash = '0'.repeat(64);
  const paths = ['/', ...['app', 'packet', 'example'].map(name => '/' + name + '.' + hash + '.js'),
    '/styles.' + hash + '.css', '/favicon.' + hash + '.svg'];
  const baseline = {
    browserName: 'firefox', errorName: 'TimeoutError', reload: false,
    documentState: loadedNavigationDocument(paths), events: [], failures: [], pending: [], runtimeErrors: [],
    responses: paths.map(path => ({ path, status: 200 })),
  };
  assert.equal(isFirefoxStartupRace(baseline), true, 'native events suffice when the driver drops events');
  const rejected = [
    { browserName: 'chromium' }, { errorName: 'AssertionError' }, { reload: true },
    { documentState: { ...baseline.documentState, readyState: 'interactive' } },
    { documentState: { ...baseline.documentState, origin: 'https://example.com' } },
    { documentState: { ...baseline.documentState, symbol: 'UNKNOWN' } },
    { documentState: { ...baseline.documentState, nativeEvents: ['domcontentloaded'] } },
    { documentState: { ...baseline.documentState, hasChart: false } },
    { documentState: { ...baseline.documentState, assertionCount: 0 } },
    { documentState: { ...baseline.documentState, stylesheets: [] } },
    { documentState: { ...baseline.documentState, documentId: '' } },
    { documentState: { unavailable: true } },
    { failures: [{ path: '/app.js', error: 'failed' }] }, { pending: ['/app.js'] },
    { runtimeErrors: ['Application failed'] }, { responses: baseline.responses.slice(1) },
    { responses: baseline.responses.map((response, i) => i === 1 ? { ...response, status: 404 } : response) },
    { responses: baseline.responses.map((response, i) => i === 1 ? { ...response, path: '/unknown.js' } : response) },
  ];
  for (const change of rejected) assert.equal(isFirefoxStartupRace({ ...baseline, ...change }), false, JSON.stringify(change));
});

test('Firefox startup recovery verifies cached pages and preserves subsequent failures', async t => {
  t.mock.method(console, 'warn', () => {});
  const manifest = await build(await fixture(t));
  const paths = ['/', ...manifest.files.filter(name => HASHED_ASSET.test(name)).map(name => '/' + name)];
  for (const outcome of ['success', 'cached', 'timeout', 'asset', 'missing', 'document', 'stale']) {
    const page = new EventEmitter(); let calls = 0;
    page.addInitScript = async () => {};
    page.context = () => ({ browser: () => ({ browserType: () => ({ name: () => 'firefox' }) }) });
    page.evaluate = async () => {
      const state = loadedNavigationDocument(paths, calls === 1 || outcome === 'stale' ? 'first' : 'second');
      if (calls === 2 && outcome === 'document') state.hasChart = false;
      if (calls === 2 && outcome === 'missing') state.stylesheets = [];
      return state;
    };
    page.goto = async () => {
      calls++;
      for (const path of paths) {
        if (calls === 2 && outcome === 'cached' && path !== '/') continue;
        const request = { url: () => 'http://127.0.0.1:4173' + path };
        page.emit('request', request);
        page.emit('response', { url: request.url, status: () => calls === 2 && outcome === 'asset' && path.startsWith('/styles.') ? 404 : 200 });
        page.emit('requestfinished', request);
      }
      if (calls === 1 || outcome === 'timeout') {
        const error = new Error('Navigation still failed'); error.name = 'TimeoutError'; throw error;
      }
      return { status: () => 200 };
    };
    if (['success', 'cached'].includes(outcome)) await navigate(page);
    else await assert.rejects(navigate(page), /Navigation still failed|recovered navigation/);
    assert.equal(calls, 2, 'only one recovery attempt');
    assert.equal(page.eventNames().length, 0, 'temporary listeners are removed');
  }
});
