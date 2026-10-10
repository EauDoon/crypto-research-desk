# Changelog

All notable changes to this repository are recorded here. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and versions follow the [release policy](RELEASE_POLICY.md).

Record user-visible changes under `[Unreleased]` as they merge. A release moves them into a `## [X.Y.Z] - YYYY-MM-DD` section with Added, Changed, Fixed and Security subsections. That version is the `package.json` repository release; the research core in `VERSION` is versioned separately. Releases up to 1.10.0 keep their original headings unchanged. The tags v1.0.0, v1.0.1 and v1.1.0 predate `package.json`, and releases 1.2.0 to 1.10.0 were not tagged. `npm run check:version` checks these rules.

## [Unreleased]

### Fixed

- The live production smoke no longer fails in Firefox when its second page reopens `/` in the same browser context. Production serves `/` with `must-revalidate`, and Firefox reports that revalidation as 304 where Chromium reports the cached 200. Only that navigation accepts a 304; every other navigation still requires 200. The 1.11.0 deployment itself was healthy: Chromium passed the same smoke.

## [1.11.0] - 2026-10-09

This release records everything merged since 1.10.0 plus its own changes. Packet schema 1, the five read-only specialists, the four forecast horizons, the independent risk gate, the browser storage key and research core 1.1.0 are unchanged.

One stricter rule affects saved data: a packet whose sources differ only by empty query pairs, such as `?a=1` and `?a=1&`, now records one source twice and fails validation. A saved browser draft like that is kept byte for byte as an unreadable draft with download-and-clear recovery; it is never deleted or overwritten. A single URL with an empty pair still validates and keeps its spelling.

### Added

- A portable skill kit around the frozen core: 44 per-lane skills with the [skill catalogue](docs/SKILLS.md), six worker spawn files, one cross-host [STAND-UP.md](STAND-UP.md), the [eval bar](docs/EVAL.md), the [roadmap](docs/ROADMAP.md), the [skill-adding guide](docs/ADDING-SKILLS.md) and worked examples (#19 and the commits before it).
- Seven specialist JSON Schemas, including source freeze receipts.
- `npm run check:specialist`, an offline checker for specialist records built on Ajv, a development-only dependency (#60).
- Tests that keep the skill pack, its catalogue, the worker spawn files and every relative Markdown link consistent (#35, #36, #45, #46), and that fail when a rendered button has no listener (#44).
- `--help` and `--version` on `check:specialist` and the preview server, which print the lanes and exit codes or both release versions.
- `npm run check:version`, run inside `npm run check`, which keeps `package.json`, both lockfile version fields, `VERSION` and this changelog in agreement.
- A release-check workflow that verifies `vX.Y.Z` and `core-vX.Y.Z` tags, and a production-smoke workflow that runs the live Chromium and Firefox smoke after each Vercel Production deployment.
- Dependabot proposals for npm and GitHub Actions updates, merged only after review.
- [examples/freeze-receipt.json](examples/freeze-receipt.json), a freeze receipt the checker accepts. Every JSON example and packet-shape snippet is now validated in `npm test`.
- Issue and pull request templates with a private vulnerability contact link (#30), CODEOWNERS for the frozen charter (#25), and a README quick start and badges (#22, #27, #33).

### Changed

- The workbench is split into focused modules behind the `app.js` and `packet.js` entry points (#26). One dependency-ordered list now drives the build order, the manifest checks and the syntax check, which covers every shipped and test module, including the live smoke. Deriving the build order from that list left the built artifact byte-identical.
- Skill procedures were tightened: delivery is graded against all eight desk checks (#34), routing covers every charter mode (#37), the delivery gate requires the run ledger (#38), and a confirmed liquidity absence scores FAIL (#39).
- Hashed split assets are served with immutable caching (#60).
- Every browser spec shares one harness that fails on runtime errors, console warnings or errors and external requests, and applies one accessibility bar: WCAG 2.0, 2.1 and 2.2 A and AA, plus Label in Name. `BROWSER_TEST_PORT` runs the suite while another server holds port 4173.
- CI keeps an uncancelled verdict for every main commit, keeps Playwright traces when a browser check fails, and can be started by hand. Action pins name exact versions (#23).
- The changelog follows Keep a Changelog from this release; earlier headings are unchanged.
- The packet guide and security policy describe the validation rules from #48 to #59; the contributor guide and pull request template list the real gates, including the browser suite; the security policy lists supported versions; the release policy defines the tag scheme.

### Fixed

- Parsing a wide object no longer freezes the page for seconds: duplicate keys that are equal under NFC (#56) are now found in linear time.
- One source can no longer be recorded twice through NFC-equivalent Unicode (#55), reordered query parameters (#48), raw versus percent-encoded non-separators (#59), or empty query pairs.
- Text and source URLs reject Unicode noncharacters (#57) and line separators (#50), source URLs reject percent-encoded controls (#51), and source hosts that mix Latin, Cyrillic or Greek letters are rejected (#58).
- Self-review aliases are compared after Cyrillic and Greek lookalike folding (#52), recorded timestamps are compared by instant (#54), and reorder-insensitive lists are compared as multisets (#20, #49).
- Every download handler reports its own failure (#47), the monitoring worksheet button reaches its exporter (#42), the saved-draft recovery button follows the state it controls (#43), closing the editor restores focus (#40), the sequence helpers return the value their staleness guards compare (#41), and partial reviews clear on every research renewal (#18).
- Startup reports unreadable browser storage and an unreadable saved draft as different failures, and no longer logs two false console warnings.
- The source edit and citation buttons, source links and the brand link include their visible label in the accessible name (WCAG 2.5.3), and source excerpt toggles keep a 24 px target (WCAG 2.5.8).
- Check receipts, pinned baselines and packet bundles are named `(YYYY-MM-DD)SYMBOL suffix` from the packet they contain, like every other export.
- The Firefox navigation race (microsoft/playwright#42183) is contained in isolated-context tests and in the live smoke, and its recovery now requires every hashed asset of the build. The startup probe of a loaded page retries for up to three seconds on a busy machine instead of failing on one slow read.

### Security

- Spreadsheet exports neutralize formula prefixes written with compatibility lookalike characters (#53).

## Workbench 1.10.0 (10-09-2026)

- Compare sources and review assertions by identity and retain a pinned session baseline.
- Edit evidence directly, select submitted review coverage, inspect host concentration and export full evidence CSV.
- Verify saved receipt claims and round-trip integrity-checked packet bundles.
- Prepare gated manual monitoring worksheets and renew research without carrying old probabilities or clearance.
- Preserve packet schema 1, five specialist functions, independent review, local-only storage scope, and research core 1.1.0.


## Workbench 1.9.0 (09-09-2026)

- Add actionable repairs, literal evidence search, cutoff-age and submitted-review coverage audit.
- Add gated horizon comparisons, spreadsheet-safe scenario CSV, and isolated reference sensitivity.
- Add validated revision comparison and ten-step memory-only undo that resets review.
- Add rationale-separated incomplete risk handoffs and reproducible SHA-256 check receipts.
- Preserve schema version 1 and research core 1.1.0, including all five specialists and independent risk requirements.


## 1.8.1, 30-08-2026

- Accepted safely normalized internationalized top-level domains in public HTTPS evidence links.

## 1.8.0, 30-08-2026

- Added drag-and-drop JSON import through the existing strict local packet-validation path.

## 1.7.0, 30-08-2026

- Added a local raw-JSON copy action while retaining the portable JSON download.
- Aligned release, deployment, and security guidance with authorized Vercel Git builds and automatic production promotion.

## 1.6.6, 29-08-2026

- Rejected negative zero before JSON serialization can erase its sign from scenario records.
- Kept packet acceptance, rendering, and import feedback on one decision-time cutoff.
- Preserved keyboard focus when expiry withdraws a focused forecast chart.

## 1.6.5, 29-08-2026

- Kept decision-time validation, charts, and horizon labels on one cutoff instant, including expiry detected during horizon navigation.
- Prevented delayed file reads and open editors from replacing one another's in-memory packet.
- Rejected invisible Unicode formatting, carriage returns, and line breaks that editor controls cannot preserve exactly.
- Kept export filename dates aligned with the packet's recorded cutoff across UTC boundaries.
- Made the live deployment gate compare the manifest bytes and verify cache and MIME headers for every public artifact.

## 1.6.4, 29-08-2026

- Kept formatted near-limit JSON exports re-importable with a separate 320 KiB input envelope while retaining the 256 KiB semantic packet and browser-storage cap.

## 1.6.3, 29-08-2026

- Restored the visible browser-retention state when saved-draft deletion fails, and covered complete storage denial at startup.

## 1.6.2, 29-08-2026

- Prevented the fail-closed startup shell from shifting visible content when the application module arrives, with a measured Chromium regression gate.
- Kept ignored drafts, test output, dependencies, and private local files out of Vercel CLI deployment uploads.

## 1.6.1, 29-08-2026

- Kept nested scenario controls comfortably wide on 320-pixel phone layouts without changing the desktop editor.
- Made the live deployment gate enforce the complete shared security-header contract plus manifest, asset, and 404 cache and MIME behavior.

## 1.6.0, 29-08-2026

- Locked saving and clearing after cross-tab draft changes so one tab cannot overwrite another tab's newer browser value.

## 1.5.0, 29-08-2026

- Locked browser saving when an unreadable draft is detected and added a raw-download recovery action before confirmed deletion.

## 1.4.0, 29-08-2026

- Added structured four-horizon scenario editing with derived contiguous intervals, so routine packet creation no longer requires raw JSON.

## 1.3.0, 29-08-2026

- Added structured method and dated-source editing so routine packet preparation no longer requires manipulating those fields as raw JSON.

## 1.2.1, 29-08-2026

- Added a separate Chromium/Firefox production smoke that compares the live canonical manifest with the reviewed build and verifies deployment headers, public-file boundaries, accessibility, and the local-only packet workflow.

## 1.2.0, 29-08-2026

- Separated the workbench release identity from the unchanged 1.1.0 research core and added both versions to exact canonical build manifests.
- Enforced Node 24, fatal UTF-8 build inputs, raw-byte artifact digests, and immutable verified preview snapshots.
- Made publication recovery-safe with an exclusive build lock, staged verification, rollback coverage, and fail-closed preservation of interrupted-build evidence.
- Added a CI build using the exact production dependency boundary and made whitespace validation cover the complete final tree.
- Made decision-facing timestamps unambiguous across daylight-saving folds, rejected unknown offsets and special-use source namespaces, and strengthened the preparer/reviewer consistency check.
- Kept short-height navigation reachable, tied horizontal-scroll cues to measured overflow, and exposed evidence records as named heading sections.

- Hardened packet ingestion against malformed UTF-8, ill-formed Unicode, reserved example and listed local/test-only source hosts, and Markdown block injection.
- Enforced separate research and review saves for pending as well as final reviews, including safe reset of partial review data.
- Kept editor actions reachable on small screens, opened full JSON at the beginning, clarified chart boundaries, and exposed source hostnames and horizontal-scroll cues.
- Added production Vercel configuration parity checks and made the browser-test command build its own verified artifact.
- Added a static browser workbench for named-ticker research packets, with JSON import/edit/export, Markdown briefs, and printable forecast charts.
- Added strict packet validation, exact percentage totals, timestamp and evidence checks, explicit unknowns, and manual review assertions.
- Added opt-in local drafts, safe errors, keyboard navigation, mobile layouts, and automated browser/accessibility checks.
- Added deterministic hashed builds, a restricted local preview server, Vercel configuration, and a GitHub quality workflow.
- Added packet, privacy, deployment, and recovery documentation. Preserved the version 1.1.0 research core and original assets.
- Production publication and deployment remain separate release actions.

## 1.1.0, 27-08-2026

- Added local SVG hero and research-flow graphics.
- Reworked the README for faster scanning, clearer roles, and tighter navigation.
- Added exact presentation-asset verification.
- Kept the research core and execution boundary unchanged.

## 1.0.1, 27-08-2026

- Added an LF checkout policy so exact-byte verification passes on Windows when `core.autocrlf=true`.

## 1.0.0, 27-08-2026

- Published the accepted Revision Three research core.
- Defined one Chief of Crypto and five read-only specialist functions.
- Required independent risk review for actionable and portfolio-level conclusions.
- Added fixed 12-hour, 24-hour, 3-day, and 7-day named-ticker forecast horizons.
- Added fail-closed authority, evidence, conflict, source, and state controls.
- Added an exact core-file verifier and local regression tests.

[Unreleased]: https://github.com/EauDoon/crypto-research-desk/compare/v1.11.0...HEAD
[1.11.0]: https://github.com/EauDoon/crypto-research-desk/compare/v1.1.0...v1.11.0
