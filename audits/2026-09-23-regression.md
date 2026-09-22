# crypto-research-desk regression baseline — 2026-09-23

## Scope
Browser workbench `crypto-research-desk@1.10.0`. Test target invoked:
`npm test`, which runs `node --test tests/*.test.mjs` against the top-level
`tests/` directory only. The Playwright browser and production suites
(`test:browser`, `test:production`) were not invoked — those require browser
binaries and are explicitly excluded by the heavy-install rule.

## Environment
- Default branch: `main`.
- Toolchain: Node v24.18.0, npm 12.0.2 on Windows.
- Audit branch: `imp/portfolio-triage-phase9-2026-09-23`.
- No dependency install required for the `npm test` target: the top-level
  `.test.mjs` files only import node built-ins and local modules. Playwright
  packages are declared as devDependencies but are not loaded by the
  `tests/*.test.mjs` glob that `npm test` runs.

## Results
- tests: 82
- pass: 82
- fail: 0
- skipped: 0
- error: 0
- duration_ms: 16,300.2

## Verdict
- All 82 node:test cases passed cleanly.
- No failures, no skips, no cancelled runs, no errors.
- Audit branch is a no-op against source, tests, and schemas. Only this report
  is added under `audits/`.

## Out of scope for this commit
- `npm run test:browser` (Playwright browser tests) and `npm run test:production`
  were skipped per the heavy-install rule. The Playwright browser binaries
  were not installed and no attempt was made to launch them.
- No PR is opened by this worker; the human opens the PR per the standing rule.