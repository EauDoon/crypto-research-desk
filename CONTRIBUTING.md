# Contributing

Contributions should preserve the research-only authority boundary and the independent risk gate.

## Growing the agent team

This repository is a stand-up kit. Prefer a new **skill** over a sixth specialist.

1. Read [docs/ADDING-SKILLS.md](docs/ADDING-SKILLS.md).
2. Add `.agents/skills/<skill-id>/SKILL.md` with procedure and fail-modes.
3. Attach the skill to exactly one lane.
4. Add a pass/fail line in [docs/EVAL.md](docs/EVAL.md).
5. Keep specialists read-only. Never teach orders, wallets, or credentials.
6. Do not add host-specific stand-up files. Host notes belong in [STAND-UP.md](STAND-UP.md).

## Local setup

Use Node 24.x and Python 3.11 or later. Install the pinned test dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
```

Run the release-core and workbench checks before opening a pull request:

```sh
python3 -B tools/verify_release.py
python3 -B -m unittest discover -s tests -v
npm run check
```

Before opening a pull request:

1. Keep every specialist read-only.
2. Preserve source dates, capture times, unknown values, and conflict receipts.
3. Keep named-ticker forecasts on the four required horizons.
4. Do not add extra files under `.codex/agents/` — that set is the verified specialist list.
5. Do not silently rewrite the frozen research core (`AGENTS.md`, the five TOMLs, the umbrella skill).
6. State any change to authority, topology, output contracts, privacy, security, or compatibility.

Do not submit secrets, account details, wallet data, private datasets, copied research, paid-source content, or unlicensed assets.
