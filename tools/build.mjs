import { isUtf8 } from 'node:buffer';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSupportedNode } from './runtime.mjs';
import { PUBLIC_FILES, HASHED_ASSET, MANAGED_FILE } from './web-config.mjs';

assertSupportedNode();

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const asciiOrder = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const artifactHash = files => hash([...files.entries()].sort(([left], [right]) => asciiOrder(left, right))
  .map(([name, contents]) => name + '\n' + hash(contents) + '\n').join(''));
const MANIFEST_KEYS = Object.freeze(['formatVersion', 'workbenchVersion', 'researchCoreVersion', 'files', 'artifactHash']);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
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
function decodeUtf8(bytes, path) {
  if (!isUtf8(bytes)) throw new Error('Text file is not valid UTF-8: ' + path);
  return bytes.toString('utf8');
}
async function readUtf8(path) {
  return decodeUtf8(await readFile(path), path);
}
function validSemver(value) {
  return typeof value === 'string' && SEMVER.test(value);
}
function manifestText(manifest) {
  return JSON.stringify(manifest, null, 2) + '\n';
}
async function versions(root) {
  const versionPath = join(root, 'VERSION');
  const packagePath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  await regular(versionPath);
  await regular(packagePath);
  await regular(lockPath);
  const versionSource = await readUtf8(versionPath);
  const researchCoreVersion = versionSource.trim();
  const pkg = JSON.parse(await readUtf8(packagePath));
  const lock = JSON.parse(await readUtf8(lockPath));
  if (!validSemver(researchCoreVersion) || versionSource !== researchCoreVersion + '\n'
    || !validSemver(pkg.version)) throw new Error('Build versions must use canonical semantic versioning.');
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) {
    throw new Error('Package and lockfile workbench versions differ.');
  }
  return { researchCoreVersion, workbenchVersion: pkg.version };
}
async function recoveryState(root) {
  return (await readdir(root)).filter(name => name === '.dist-build.lock' || name.startsWith('.dist-stage-')).sort(asciiOrder);
}
async function acquireBuildLock(root) {
  const lock = join(root, '.dist-build.lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const retained = await recoveryState(root);
    throw new Error('Refusing to build while unfinished or concurrent build state is present: ' + retained.join(', '));
  }
  try {
    const retained = (await recoveryState(root)).filter(name => name !== '.dist-build.lock');
    if (retained.length) throw new Error('Refusing to build while recovery data is present: ' + retained.join(', '));
  } catch (error) {
    try {
      await rmdir(lock);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Build recovery data was preserved and the temporary build lock could not be released.');
    }
    throw error;
  }
  return lock;
}
async function replaceableOutput(output) {
  try {
    await regular(output, true);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const existing = await readdir(output);
  if (!existing.length) return true;
  if (!existing.includes('build-info.json')) throw new Error('Refusing to overwrite an unmanaged output directory.');
  await regular(join(output, 'build-info.json'));
  const previous = JSON.parse(await readUtf8(join(output, 'build-info.json')));
  if (!Array.isArray(previous.files) || !previous.files.every(MANAGED_FILE)
    || existing.some(name => name !== 'build-info.json' && !previous.files.includes(name))) {
    throw new Error('Refusing to overwrite unrecognized build output.');
  }
  for (const name of existing) await regular(join(output, name));
  return true;
}
async function publishStaged(staging, output, expectedOutput, beforePublish) {
  const currentOutput = await replaceableOutput(output);
  if (currentOutput !== expectedOutput) throw new Error('Build output changed while the artifact was staged.');
  const previous = staging + '-previous';
  let movedPrevious = false;
  try {
    if (currentOutput) {
      await rename(output, previous);
      movedPrevious = true;
    }
    if (beforePublish) await beforePublish();
    await rename(staging, output);
  } catch (error) {
    if (movedPrevious) {
      try {
        await rename(previous, output);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Artifact publication failed; recovery data was retained at ' + previous + '.');
      }
    }
    throw error;
  }
  if (movedPrevious) await rm(previous, { recursive: true });
}
async function finishBuild(staging, lock, failure) {
  const errors = failure ? [failure] : [];
  if (staging) {
    try {
      await rm(staging, { recursive: true, force: true });
    } catch (error) {
      errors.push(error);
    }
  }
  try {
    await rmdir(lock);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length > 1) throw new AggregateError(errors, 'Build failed and one or more owned temporary paths could not be released.');
  if (errors.length === 1) throw errors[0];
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
      // Anchor on the start of an attribute or whitespace so the matched
      // name is exactly `src` or `href`. A custom attribute like `data-src`,
      // `data-href`, or an inline `<svg><use xlink:href="..."/></svg>`
      // would otherwise be required to resolve to a real emitted file even
      // though the attribute is not actually a script/style/image source.
      const assetReference = /(^|[\s])(?:src|href)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)'|([^\s"'=<>`]+))/gi;
      for (const match of contents.matchAll(assetReference)) {
        requireEmitted(match[2] ?? match[3] ?? match[4], 'HTML');
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
export async function build(root = projectRoot, { beforePublish } = {}) {
  if (beforePublish !== undefined && typeof beforePublish !== 'function') throw new TypeError('beforePublish must be a function.');
  const source = join(root, 'web');
  const output = join(root, 'dist');
  await regular(root, true);
  const lock = await acquireBuildLock(root);
  let staging;
  let manifest;
  let failure;
  try {
    await regular(source, true);
    const release = await versions(root);
    const originals = {};
    for (const name of PUBLIC_FILES) {
      await regular(join(source, name));
      originals[name] = await readUtf8(join(source, name));
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
    manifest = {
      formatVersion: 2,
      workbenchVersion: release.workbenchVersion,
      researchCoreVersion: release.researchCoreVersion,
      files: [...files.keys()].sort(asciiOrder),
      artifactHash: artifactHash(files),
    };
    files.set('build-info.json', manifestText(manifest));
    const expectedOutput = await replaceableOutput(output);
    staging = await mkdtemp(join(root, '.dist-stage-'));
    for (const [name, contents] of files) {
      if (!MANAGED_FILE(name)) throw new Error('Unexpected public output.');
      await writeFile(join(staging, name), contents, { encoding: 'utf8', flag: 'wx' });
    }
    await verifyBuild(staging);
    await publishStaged(staging, output, expectedOutput, beforePublish);
  } catch (error) {
    failure = error;
  }
  await finishBuild(staging, lock, failure);
  return manifest;
}

function validateManifest(manifest, source) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || Object.keys(manifest).length !== MANIFEST_KEYS.length
    || Object.keys(manifest).some((key, index) => key !== MANIFEST_KEYS[index])
    || manifest.formatVersion !== 2
    || !validSemver(manifest.workbenchVersion) || !validSemver(manifest.researchCoreVersion)
    || !Array.isArray(manifest.files) || manifest.files.length !== 8
    || new Set(manifest.files).size !== 8
    || !manifest.files.every(name => typeof name === 'string' && MANAGED_FILE(name))
    || manifest.files.some((name, index) => index > 0 && asciiOrder(manifest.files[index - 1], name) >= 0)
    || ['index.html', '404.html', 'robots.txt'].some(name => !manifest.files.includes(name))
    || typeof manifest.artifactHash !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.artifactHash)) {
    throw new Error('Invalid build manifest.');
  }
  if (source !== manifestText(manifest)) throw new Error('Build manifest is not canonical.');
  for (const stem of ['app', 'packet', 'example', 'styles', 'favicon']) {
    if (manifest.files.filter(name => HASHED_ASSET.test(name) && name.startsWith(stem + '.')).length !== 1) {
      throw new Error('Missing or duplicate built asset.');
    }
  }
}

export async function loadVerifiedBuild(directory = join(projectRoot, 'dist')) {
  await regular(directory, true);
  const manifestPath = join(directory, 'build-info.json');
  await regular(manifestPath);
  if ((await lstat(manifestPath)).size > 32768) throw new Error('Build manifest is oversized.');
  const manifestBytes = await readFile(manifestPath);
  const manifestSource = decodeUtf8(manifestBytes, manifestPath);
  const manifest = JSON.parse(manifestSource);
  validateManifest(manifest, manifestSource);
  const release = await versions(dirname(directory));
  if (manifest.researchCoreVersion !== release.researchCoreVersion) throw new Error('Built research-core version mismatch.');
  if (manifest.workbenchVersion !== release.workbenchVersion) throw new Error('Built workbench version mismatch.');
  const existing = await readdir(directory);
  if (existing.length !== 9 || existing.some(name => name !== 'build-info.json' && !manifest.files.includes(name))) throw new Error('Unexpected public output.');
  const files = new Map();
  for (const name of manifest.files) {
    await regular(join(directory, name));
    const contents = await readFile(join(directory, name));
    if (!isUtf8(contents)) throw new Error('Built text file is not valid UTF-8: ' + name);
    const namedHash = name.match(/\.([a-f0-9]{64})\./)?.[1];
    if (namedHash && namedHash !== hash(contents)) throw new Error('Built asset digest mismatch.');
    files.set(name, contents);
  }
  if (manifest.artifactHash !== artifactHash(files)) throw new Error('Built artifact digest mismatch.');
  files.set('build-info.json', manifestBytes);
  return { manifest, files };
}

export async function verifyBuild(directory = join(projectRoot, 'dist')) {
  return (await loadVerifiedBuild(directory)).manifest;
}

function errorMessage(error, indent = '') {
  const lines = [indent + (error?.message || String(error))];
  if (error instanceof AggregateError) {
    for (const nested of error.errors) lines.push(errorMessage(nested, indent + '  '));
  }
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await build();
    await verifyBuild();
    process.stdout.write(JSON.stringify({ status: 'BUILT', ...result }) + '\n');
  } catch (error) {
    process.stderr.write('Build failed: ' + errorMessage(error) + '\n');
    process.exitCode = 1;
  }
}
