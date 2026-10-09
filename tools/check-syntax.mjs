import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Syntax-checks every JavaScript module the repository ships or runs: the web
// sources, the Node tools, the Playwright configs and every test module,
// including tests/production, which no CI job loads. Uses Node built-ins only.
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const byName = (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

function listFiles(root, directory, pattern, recurse) {
  let entries;
  try {
    entries = readdirSync(join(root, directory), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries.sort(byName)) {
    const path = directory ? directory + '/' + entry.name : entry.name;
    if (entry.isDirectory()) {
      if (recurse && entry.name !== 'node_modules') found.push(...listFiles(root, path, pattern, recurse));
    } else if (entry.isFile() && pattern.test(entry.name)) found.push(path);
  }
  return found;
}

export function syntaxTargets(root = projectRoot) {
  return [
    ...listFiles(root, '', /\.mjs$/, false),
    ...listFiles(root, 'web', /\.js$/, false),
    ...listFiles(root, 'tools', /\.mjs$/, false),
    ...listFiles(root, 'tests', /\.mjs$/, true),
  ];
}

export function checkSyntax(root = projectRoot) {
  const files = syntaxTargets(root);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', join(root, file)], { encoding: 'utf8' });
    if (result.status !== 0) return { ok: false, file, files, detail: (result.stderr || result.error?.message || '').trim() };
  }
  return { ok: true, files };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkSyntax();
  if (result.ok) {
    process.stdout.write('Syntax OK: ' + result.files.length + ' JavaScript modules.\n');
  } else {
    process.stderr.write('Syntax check failed: ' + result.file + '\n' + result.detail + '\n');
    process.exitCode = 1;
  }
}
