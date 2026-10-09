# Release Policy

This repository uses semantic versioning.

## Version identities

`VERSION` identifies the exact-byte research core. `package.json` identifies the repository release: the optional browser workbench together with the tooling, skills, schemas, examples and documentation around the core. A backward-compatible repository release may advance independently while the protected research core remains unchanged. The generated build manifest records and verifies both values; neither version is trading authority or evidence of forecast quality.

## Major versions

A major version changes at least one governing contract:

- authority or safety boundaries;
- team topology or independent risk requirements;
- research-state semantics;
- evidence or conflict-resolution rules;
- named-ticker horizons, probability schema, or chart contract;
- compatibility with an earlier project configuration.

Every major version is a publication checkpoint. Before a push, the exact Git tree must pass tests, a privacy and security scan, independent review, and explicit human approval. A prior approval never covers changed bytes.

## Minor versions

A minor version adds a backward-compatible research capability, example, or optional tool without changing a governing contract.

## Patch versions

A patch version fixes documentation, tests, validation, or implementation defects without changing the intended contract.

## Tags and GitHub Releases

- A repository release is an annotated tag `vX.Y.Z` on the merged `main` commit, where `X.Y.Z` is the `package.json` version, with the message `Crypto Research Desk vX.Y.Z`. This continues the existing `v1.0.0`, `v1.0.1` and `v1.1.0` tags, which predate `package.json`.
- A change to the research core in `VERSION` is additionally tagged `core-vX.Y.Z`, so the two version lines never share a tag name.
- [CHANGELOG.md](CHANGELOG.md) records every release under `## [X.Y.Z] - YYYY-MM-DD`, newest first, below `## [Unreleased]`. `npm run check:version` keeps `package.json`, both lockfile version fields, `VERSION` and the changelog in agreement.
- Existing tags are never moved, deleted, or force-pushed.
- An attended operator tags the merge commit only after its Quality run and the production smoke pass, then pushes the tag. The [release check](.github/workflows/release-check.yml) confirms the tag matches `package.json` or `VERSION`, points into `main`, and builds the same version. The operator then publishes the GitHub Release with notes from `node tools/check-version.mjs --notes X.Y.Z`, written outside the repository.

## Release boundary

Local development may continue between releases. Public pushes are deliberate release events. No unattended process may commit, tag, push, publish a repository release or package, or change repository metadata. An explicitly authorized merge may trigger an already-approved hosting deployment; automation does not make that rollout accepted until its exact live source and artifact are verified. Dependabot is the one automated proposer: it opens dependency update pull requests on `dependabot/*` branches and never merges, tags, publishes, or deploys production. Each proposal reaches `main` only through the owner's reviewed merge.

Promotion inside the research system is separate from GitHub publication. Publishing a candidate never makes it live, validated, or authorized for capital action.
