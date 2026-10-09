import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Keeps every version surface in agreement. Node built-ins only.
//   package.json "version"  the repository and workbench release, tagged vX.Y.Z
//   package-lock.json       both version fields mirror package.json
//   VERSION                 the frozen research core, tagged core-vX.Y.Z
//   CHANGELOG.md            '## [Unreleased]' first, then releases newest first;
//                           the newest release is the package.json version
// Release headings use '## [X.Y.Z] - YYYY-MM-DD' (Keep a Changelog). Entries
// written before 1.11.0 keep their original '## Workbench X.Y.Z (DD-MM-YYYY)'
// or '## X.Y.Z, DD-MM-YYYY' headings, and no new entry may use those forms.
// Exit codes: 0 agreement, 1 mismatch, 2 usage.

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const UNRELEASED = '## [Unreleased]';

const usage = [
  'Usage: node tools/check-version.mjs [--tag NAME | --notes X.Y.Z]',
  '',
  '  (no flag)      check package.json, package-lock.json, VERSION and CHANGELOG.md agree',
  '  --tag NAME     also accept NAME only as vX.Y.Z for the package.json release',
  '                 or core-vX.Y.Z for the VERSION research core',
  '  --notes X.Y.Z  print the CHANGELOG.md section for that release',
  '',
  'Exit codes: 0 agreement, 1 mismatch, 2 usage.',
].join('\n') + '\n';

function compareVersions(left, right) {
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}

function realDate(year, month, day) {
  return year >= 1970 && month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseReleaseHeading(heading) {
  const forms = [
    [/^## \[([^\]]+)\] - (\d{4})-(\d{2})-(\d{2})$/, match => [match[2], match[3], match[4]], false],
    [/^## Workbench (\S+) \((\d{2})-(\d{2})-(\d{4})\)$/, match => [match[4], match[3], match[2]], true],
    [/^## (\S+), (\d{2})-(\d{2})-(\d{4})$/, match => [match[4], match[3], match[2]], true],
  ];
  for (const [pattern, dateParts, legacy] of forms) {
    const match = pattern.exec(heading);
    if (!match) continue;
    const [year, month, day] = dateParts(match).map(Number);
    return { version: match[1], year, month, day, legacy,
      validVersion: RELEASE_VERSION.test(match[1]), validDate: realDate(year, month, day) };
  }
  return null;
}

export function changelogSections(text) {
  const sections = [];
  let current = null, fenced = false;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^(?:```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) sections.push(current = { heading: line, line: index + 1, body: [] });
    else if (current) current.body.push(line);
  }
  return sections;
}

export function checkVersions(root = projectRoot) {
  const problems = [];
  const read = name => {
    try { return readFileSync(join(root, name), 'utf8'); }
    catch (error) { problems.push(name + ' cannot be read (' + (error.code ?? error.message) + ').'); return null; }
  };
  const json = name => {
    const text = read(name);
    if (text === null) return null;
    try { return JSON.parse(text); } catch { problems.push(name + ' is not valid JSON.'); return null; }
  };

  const pkg = json('package.json'), lock = json('package-lock.json');
  const packageVersion = pkg?.version;
  if (pkg && !(typeof packageVersion === 'string' && RELEASE_VERSION.test(packageVersion))) {
    problems.push('package.json version must be a release version X.Y.Z; found ' + JSON.stringify(packageVersion) + '.');
  }
  if (pkg && lock) {
    if (lock.version !== packageVersion) problems.push('package-lock.json version ' + JSON.stringify(lock.version) + ' differs from package.json ' + JSON.stringify(packageVersion) + '.');
    if (lock.packages?.['']?.version !== packageVersion) problems.push('package-lock.json packages[""].version ' + JSON.stringify(lock.packages?.['']?.version) + ' differs from package.json ' + JSON.stringify(packageVersion) + '.');
  }

  const versionText = read('VERSION');
  const coreVersion = versionText === null ? null : versionText.replace(/\n$/, '');
  if (versionText !== null && (!RELEASE_VERSION.test(coreVersion) || versionText !== coreVersion + '\n')) {
    problems.push('VERSION must contain exactly X.Y.Z followed by one newline.');
  }

  const releases = [];
  const changelog = read('CHANGELOG.md');
  if (changelog !== null) {
    const sections = changelogSections(changelog);
    if (sections[0]?.heading !== UNRELEASED) problems.push('CHANGELOG.md must open with a "' + UNRELEASED + '" section above every release.');
    let legacySeen = false;
    for (const [index, section] of sections.entries()) {
      const where = 'CHANGELOG.md line ' + section.line + ': ';
      if (section.heading === UNRELEASED) {
        if (index > 0) problems.push(where + 'only one "' + UNRELEASED + '" section is allowed, at the top.');
        continue;
      }
      const release = parseReleaseHeading(section.heading);
      if (!release) { problems.push(where + 'unrecognized release heading ' + JSON.stringify(section.heading) + '; use "## [X.Y.Z] - YYYY-MM-DD".'); continue; }
      if (!release.validVersion) { problems.push(where + 'release version ' + JSON.stringify(release.version) + ' is not X.Y.Z.'); continue; }
      if (!release.validDate) problems.push(where + 'release date is not a real calendar date.');
      if (release.legacy) legacySeen = true;
      else if (legacySeen) problems.push(where + 'a "## [X.Y.Z] - YYYY-MM-DD" release cannot sit below the legacy headings.');
      const previous = releases.at(-1);
      if (releases.some(earlier => earlier.version === release.version)) problems.push(where + 'release ' + release.version + ' is listed more than once.');
      else if (previous && compareVersions(previous.version, release.version) <= 0) problems.push(where + 'release ' + release.version + ' must be listed below newer releases, not after ' + previous.version + '.');
      if (previous && release.validDate && previous.validDate
        && release.year * 10000 + release.month * 100 + release.day > previous.year * 10000 + previous.month * 100 + previous.day) {
        problems.push(where + 'release ' + release.version + ' is dated after the newer release ' + previous.version + '.');
      }
      releases.push({ ...release, section });
    }
    if (!releases.length) problems.push('CHANGELOG.md has no release sections.');
    else if (typeof packageVersion === 'string' && releases[0].version !== packageVersion) {
      problems.push('The newest CHANGELOG.md release is ' + releases[0].version + ' but package.json is ' + packageVersion + '.');
    }
  }
  return { ok: problems.length === 0, problems, packageVersion, coreVersion, releases };
}

export function tagProblems(name, result) {
  const release = /^v(\d+\.\d+\.\d+)$/.exec(name);
  if (release) {
    if (release[1] !== result.packageVersion) return ['Tag ' + name + ' does not match the package.json release ' + result.packageVersion + '.'];
    if (!result.releases.some(entry => entry.version === release[1])) return ['Tag ' + name + ' has no CHANGELOG.md section.'];
    return [];
  }
  const core = /^core-v(\d+\.\d+\.\d+)$/.exec(name);
  if (core) return core[1] === result.coreVersion ? [] : ['Tag ' + name + ' does not match the VERSION research core ' + result.coreVersion + '.'];
  return ['Tag ' + JSON.stringify(name) + ' is neither vX.Y.Z (repository release) nor core-vX.Y.Z (research core).'];
}

// The body of one release section, without link reference definitions.
export function releaseNotes(result, version) {
  const release = result.releases.find(entry => entry.version === version);
  if (!release) return null;
  const lines = release.section.body.filter(line => !/^\[[^\]]+\]: \S+$/.test(line));
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  return lines.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const mode = args.length === 0 ? 'check'
    : args.length === 1 && ['--help', '-h'].includes(args[0]) ? 'help'
      : args.length === 2 && ['--tag', '--notes'].includes(args[0]) ? args[0].slice(2) : 'usage';
  if (mode === 'help') process.stdout.write(usage);
  else if (mode === 'usage' || (mode === 'notes' && !RELEASE_VERSION.test(args[1]))) {
    process.stderr.write(usage); process.exitCode = 2;
  } else {
    const result = checkVersions();
    const problems = [...result.problems, ...(mode === 'tag' && result.ok ? tagProblems(args[1], result) : [])];
    if (problems.length) {
      process.stderr.write('Version check failed:\n' + problems.map(problem => '- ' + problem).join('\n') + '\n');
      process.exitCode = 1;
    } else if (mode === 'notes') {
      const notes = releaseNotes(result, args[1]);
      if (notes === null) { process.stderr.write('CHANGELOG.md has no release ' + args[1] + '.\n'); process.exitCode = 1; }
      else process.stdout.write(notes);
    } else if (mode === 'tag') {
      process.stdout.write('Tag ' + args[1] + ' matches ' + (args[1].startsWith('core-') ? 'the VERSION research core.' : 'package.json, package-lock.json and CHANGELOG.md.') + '\n');
    } else {
      process.stdout.write('Versions agree: repository release ' + result.packageVersion + ' (package.json, package-lock.json, CHANGELOG.md); research core '
        + result.coreVersion + ' (VERSION).\n');
    }
  }
}
