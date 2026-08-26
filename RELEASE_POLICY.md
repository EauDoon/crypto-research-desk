# Release Policy

This repository uses semantic versioning.

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

## Release boundary

Local development may continue between releases. Public pushes are deliberate release events. No unattended process may commit, tag, publish, or change repository metadata.

Promotion inside the research system is separate from GitHub publication. Publishing a candidate never makes it live, validated, or authorized for capital action.
