import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, HASHED_ASSET, MANAGED_FILE } from './web-config.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const asciiOrder = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const artifactHash = files => hash([...files.entries()].sort(([left], [right]) => asciiOrder(left, right))
  .map(([name, contents]) => name + '\n' + hash(contents) + '\n').join(''));
const moduleRequestScript = `
const { readFileSync } = require('node:fs');
const { SourceTextModule } = require('node:vm');
const compiled = new SourceTextModule(readFileSync(0, 'utf8'));
const requests = Array.isArray(compiled.moduleRequests)
  ? compiled.moduleRequests.map(request => request.specifier)
  : compiled.dependencySpecifiers;
if (!Array.isArray(requests)) throw new Error('Module dependency metadata is unavailable.');
process.stdout.write(JSON.stringify(requests));
`;
const dynamicImport = /\bimport\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))\s*)*\(/;
async function regular(path, directory = false) {
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile())) {
    throw new Error('Build inputs and outputs must be regular files and directories.');
  }
}
function validateArtifact(files) {
  function emittedReference(reference) {
    if (!reference || reference.startsWith('#') || reference.startsWith('//')
      || /^[a-z][a-z0-9+.-]*:/i.test(reference)) return null;
    const clean = reference.split(/[?#]/, 1)[0];
    if (!clean || clean === '/') return null;
    const parts = (clean.startsWith('/') ? clean.slice(1) : clean).split('/');
    if (parts.includes('..')) throw new Error('Built content references an asset outside the output root: ' + reference);
    return parts.filter(part => part && part !== '.').join('/');
  }
  function requireEmitted(reference, context) {
    const emitted = emittedReference(reference);
    if (emitted && !files.has(emitted)) throw new Error('Built ' + context + ' references a missing local asset: ' + emitted);
  }
  for (const [name, contents] of files) {
    if (name.endsWith('.js')) {
      const checked = spawnSync(process.execPath, ['--experimental-vm-modules', '--no-warnings', '-e', moduleRequestScript], {
        input: contents, encoding: 'utf8', maxBuffer: 1024 * 1024,
      });
      if (checked.status !== 0) throw new Error('Built JavaScript syntax check failed: ' + name);
      if (dynamicImport.test(contents)) throw new Error('Built JavaScript uses an unsupported dynamic import: ' + name);
      for (const specifier of JSON.parse(checked.stdout)) {
        if (!specifier.startsWith('./')) throw new Error('Built JavaScript uses an unsupported module specifier: ' + specifier);
        const referenced = specifier.slice(2);
        if (!files.has(referenced)) throw new Error('Built JavaScript references a missing local asset: ' + referenced);
      }
    }
    if (name.endsWith('.html')) {
      const assetReference = /\b(?:src|href)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+))/gi;
      for (const match of contents.matchAll(assetReference)) {
        requireEmitted(match[1] ?? match[2] ?? match[3], 'HTML');
      }
    }
    if (name.endsWith('.css')) {
      const assetReference = /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"')]+))\s*\)/gi;
      for (const match of contents.matchAll(assetReference)) {
        requireEmitted(match[1] ?? match[2] ?? match[3], 'CSS');
      }
    }
  }
}
export async function build(root = projectRoot) {
  const source = join(root, 'web');
  const output = join(root, 'dist');
  await regular(root, true);
  await regular(source, true);
  await regular(join(root, 'VERSION'));
  await regular(join(root, 'package.json'));
  const version = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (pkg.version !== version) throw new Error('Package and research-core versions differ.');
  const originals = {};
  for (const name of PUBLIC_FILES) {
    await regular(join(source, name));
    originals[name] = await readFile(join(source, name), 'utf8');
  }
  const files = new Map();
  const names = {};
  // Dependencies are rewritten before hashing their importers.
  for (const name of ['favicon.svg', 'packet.js', 'example.js', 'app.js', 'styles.css']) {
    let contents = originals[name];
    for (const [original, replacement] of Object.entries(names)) contents = contents.replaceAll('./' + original, './' + replacement);
    const extension = name.slice(name.lastIndexOf('.'));
    const emitted = name.slice(0, -extension.length) + '.' + hash(contents) + extension;
    names[name] = emitted;
    files.set(emitted, contents);
  }
  for (const name of ['index.html', '404.html', 'robots.txt']) {
    let contents = originals[name];
    for (const [original, replacement] of Object.entries(names)) contents = contents.replaceAll('/' + original, '/' + replacement);
    files.set(name, contents);
  }
  validateArtifact(files);
  const manifest = {
    formatVersion: 1, researchCoreVersion: version,
    files: [...files.keys()].sort(),
    artifactHash: artifactHash(files),
  };
  files.set('build-info.json', JSON.stringify(manifest, null, 2) + '\n');
  try {
    await mkdir(output);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    await regular(output, true);
    const existing = await readdir(output);
    if (existing.length) {
      if (!existing.includes('build-info.json')) throw new Error('Refusing to overwrite an unmanaged output directory.');
      await regular(join(output, 'build-info.json'));
      const previous = JSON.parse(await readFile(join(output, 'build-info.json'), 'utf8'));
      if (!Array.isArray(previous.files) || !previous.files.every(MANAGED_FILE)
        || existing.some(name => name !== 'build-info.json' && !previous.files.includes(name))) {
        throw new Error('Refusing to overwrite unrecognized build output.');
      }
      for (const name of existing) await regular(join(output, name));
      for (const name of existing) if (!files.has(name)) await unlink(join(output, name));
    }
  }
  for (const [name, contents] of files) {
    if (!MANAGED_FILE(name)) throw new Error('Unexpected public output.');
    await writeFile(join(output, name), contents, { encoding: 'utf8', flag: 'w' });
  }
  return manifest;
}

export async function verifyBuild(directory = join(projectRoot, 'dist')) {
  await regular(directory, true);
  await regular(join(directory, 'build-info.json'));
  if ((await lstat(join(directory, 'build-info.json'))).size > 32768) throw new Error('Build manifest is oversized.');
  const manifest = JSON.parse(await readFile(join(directory, 'build-info.json'), 'utf8'));
  if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files) || manifest.files.length !== 8
    || new Set(manifest.files).size !== 8 || !manifest.files.every(MANAGED_FILE)
    || ['index.html', '404.html', 'robots.txt'].some(name => !manifest.files.includes(name))) {
    throw new Error('Invalid build manifest.');
  }
  for (const stem of ['app', 'packet', 'example', 'styles', 'favicon']) {
    if (manifest.files.filter(name => HASHED_ASSET.test(name) && name.startsWith(stem + '.')).length !== 1) throw new Error('Missing or duplicate built asset.');
  }
  const versionPath = join(dirname(directory), 'VERSION');
  await regular(versionPath);
  if (manifest.researchCoreVersion !== (await readFile(versionPath, 'utf8')).trim()) throw new Error('Built research-core version mismatch.');
  const existing = await readdir(directory);
  if (existing.length !== 9 || existing.some(name => name !== 'build-info.json' && !manifest.files.includes(name))) throw new Error('Unexpected public output.');
  const files = new Map();
  for (const name of manifest.files) {
    await regular(join(directory, name));
    const contents = await readFile(join(directory, name), 'utf8');
    const namedHash = name.match(/\.([a-f0-9]{64})\./)?.[1];
    if (namedHash && namedHash !== hash(contents)) throw new Error('Built asset digest mismatch.');
    files.set(name, contents);
  }
  if (manifest.artifactHash !== artifactHash(files)) throw new Error('Built artifact digest mismatch.');
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await build();
    await verifyBuild();
    process.stdout.write(JSON.stringify({ status: 'BUILT', ...result }) + '\n');
  } catch (error) {
    process.stderr.write('Build failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
