# Changelog

## Unreleased

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
