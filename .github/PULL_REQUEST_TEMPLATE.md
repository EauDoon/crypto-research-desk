## Summary

What changes, and why.

## Verification

Commands run on the final commit, with results:

- [ ] `py -B tools/verify_release.py` (or `python3 -B ...`) reports `VERIFIED`
- [ ] `py -B -m unittest discover -s tests -v` passes
- [ ] `npm run check` passes, including the version agreement check
- [ ] `npm run test:browser` passes in Chromium and Firefox

## Boundaries

- [ ] The frozen research core is untouched: `AGENTS.md`, `.codex/**`, the umbrella skill and `VERSION`, or the change is stated and justified here
- [ ] The research-only authority boundary holds: no orders, wallets, credentials, sizing or execution paths
- [ ] Specialists stay read-only, and the independent risk gate is unchanged
- [ ] Any change to authority, topology, output contracts, privacy, security or compatibility is stated above
- [ ] User-visible changes are recorded under `[Unreleased]` in `CHANGELOG.md`
