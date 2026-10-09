import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkVersions, parseReleaseHeading, releaseNotes, tagProblems } from '../tools/check-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = join(root, 'work');
const cli = (...args) => spawnSync(process.execPath, [join(root, 'tools', 'check-version.mjs'), ...args], { encoding: 'utf8' });

const CHANGELOG = [
  '# Changelog', '', 'Preamble.', '', '## [Unreleased]', '', '- Pending change.', '',
  '## [2.1.0] - 2026-10-09', '', '### Added', '', '- New thing.', '',
  '## Workbench 2.0.0 (10-09-2026)', '', '- Legacy workbench heading.', '',
  '## 1.9.1, 30-08-2026', '', '- Legacy plain heading.', '',
  '[Unreleased]: https://github.com/EauDoon/crypto-research-desk/compare/v2.1.0...HEAD',
  '[2.1.0]: https://github.com/EauDoon/crypto-research-desk/compare/v1.1.0...v2.1.0', '',
].join('\n');

async function fixture(t, { version = '2.1.0', lockVersion = version, rootVersion = version, core = '1.1.0\n', changelog = CHANGELOG } = {}) {
  await mkdir(work, { recursive: true });
  const directory = await mkdtemp(join(work, 'version-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: 'fixture', version }, null, 2) + '\n');
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ name: 'fixture', version: lockVersion, lockfileVersion: 3,
    packages: { '': { name: 'fixture', version: rootVersion } } }, null, 2) + '\n');
  await writeFile(join(directory, 'VERSION'), core);
  await writeFile(join(directory, 'CHANGELOG.md'), changelog);
  return directory;
}

test('the repository version surfaces agree', async () => {
  const result = checkVersions(root);
  assert.deepEqual(result.problems, []);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(result.packageVersion, pkg.version);
  assert.equal(result.coreVersion, (await readFile(join(root, 'VERSION'), 'utf8')).trim());
  assert.equal(result.releases[0].version, pkg.version);
  // Every historical heading, in either legacy form, still parses.
  assert.ok(result.releases.some(release => release.version === '1.10.0' && release.legacy));
  assert.ok(result.releases.some(release => release.version === '1.0.0' && release.legacy));
  const check = cli();
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, new RegExp('repository release ' + pkg.version.replaceAll('.', '\\.') + ' '));
});

test('a consistent fixture passes with new and legacy headings', async t => {
  const result = checkVersions(await fixture(t));
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.releases.map(release => [release.version, release.legacy]), [['2.1.0', false], ['2.0.0', true], ['1.9.1', true]]);
  assert.equal(releaseNotes(result, '2.1.0'), '### Added\n\n- New thing.\n');
  assert.equal(releaseNotes(result, '1.9.1'), '- Legacy plain heading.\n', 'link reference definitions are not release notes');
  assert.equal(releaseNotes(result, '9.9.9'), null);
});

test('version disagreements and malformed changelogs fail with a named problem', async t => {
  const swap = (from, to) => CHANGELOG.replace(from, to);
  const cases = [
    [{ lockVersion: '2.0.0' }, /package-lock\.json version "2\.0\.0" differs/],
    [{ rootVersion: '2.0.0' }, /packages\[""\]\.version "2\.0\.0" differs/],
    [{ version: '2.2.0', lockVersion: '2.2.0', rootVersion: '2.2.0' }, /newest CHANGELOG\.md release is 2\.1\.0 but package\.json is 2\.2\.0/],
    [{ version: '2.1.0-rc.1', lockVersion: '2.1.0-rc.1', rootVersion: '2.1.0-rc.1' }, /package\.json version must be a release version/],
    [{ core: '1.1.0' }, /VERSION must contain exactly X\.Y\.Z/],
    [{ core: '1.1.0\n\n' }, /VERSION must contain exactly X\.Y\.Z/],
    [{ changelog: swap('## [Unreleased]\n\n- Pending change.\n\n', '') }, /must open with a "## \[Unreleased\]" section/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## [Unreleased]') }, /only one "## \[Unreleased\]" section/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## 2.0.0, 30-08-2026') }, /release 2\.0\.0 is listed more than once/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## 2.0.1, 30-08-2026') }, /release 2\.0\.1 must be listed below newer releases/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## 1.9.1, 31-02-2026') }, /not a real calendar date/],
    [{ changelog: swap('## [2.1.0] - 2026-10-09', '## [2.1.0] - 2026-02-30') }, /not a real calendar date/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## 1.9.1, 30-10-2026') }, /dated after the newer release 2\.0\.0/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## Release 1.9.1') }, /unrecognized release heading/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## [1.9] - 2026-08-30') }, /release version "1\.9" is not X\.Y\.Z/],
    [{ changelog: swap('## 1.9.1, 30-08-2026', '## [1.9.1] - 2026-08-30') }, /cannot sit below the legacy headings/],
  ];
  for (const [options, expected] of cases) {
    const result = checkVersions(await fixture(t, options));
    assert.equal(result.ok, false, String(expected));
    assert.ok(result.problems.some(problem => expected.test(problem)), expected + ' in ' + JSON.stringify(result.problems));
  }
});

test('tags are accepted only for the package release or the research core', async t => {
  const result = checkVersions(await fixture(t));
  assert.deepEqual(tagProblems('v2.1.0', result), []);
  assert.deepEqual(tagProblems('core-v1.1.0', result), []);
  for (const name of ['v2.0.0', 'v9.9.9', 'core-v1.2.0', 'core-v2.1.0', 'release-1', 'v2.1', '2.1.0', 'workbench-v2.1.0']) {
    assert.equal(tagProblems(name, result).length, 1, name);
  }

  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const core = (await readFile(join(root, 'VERSION'), 'utf8')).trim();
  for (const name of ['v' + pkg.version, 'core-v' + core]) {
    const accepted = cli('--tag', name);
    assert.equal(accepted.status, 0, name + ': ' + accepted.stderr);
  }
  for (const name of ['v9.9.9', 'core-v' + core.replace(/\d+$/, digits => String(Number(digits) + 1)), 'release-1']) {
    const rejected = cli('--tag', name);
    assert.equal(rejected.status, 1, name);
    assert.match(rejected.stderr, /Version check failed/);
  }
});

test('release notes print one section and usage errors exit 2', () => {
  const notes = cli('--notes', '1.10.0');
  assert.equal(notes.status, 0, notes.stderr);
  assert.match(notes.stdout, /^- Compare sources and review assertions by identity/);
  assert.match(notes.stdout, /research core 1\.1\.0\.\n$/);
  assert.doesNotMatch(notes.stdout, /^## /m);
  assert.equal(cli('--notes', '0.0.1').status, 1);
  for (const args of [['--notes'], ['--notes', 'latest'], ['--tag'], ['--bogus'], ['--tag', 'v1.0.0', 'extra']]) {
    const usage = cli(...args);
    assert.equal(usage.status, 2, JSON.stringify(args));
    assert.match(usage.stderr, /^Usage: node tools\/check-version\.mjs/);
  }
  assert.equal(cli('--help').status, 0);
  assert.deepEqual(parseReleaseHeading('## Workbench 1.9.0 (09-09-2026)'),
    { version: '1.9.0', year: 2026, month: 9, day: 9, legacy: true, validVersion: true, validDate: true });
});
