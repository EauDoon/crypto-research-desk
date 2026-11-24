# Roadmap

This repository stands up a research-only crypto agent team. Do not add a sixth specialist. Do not add execution.

## Done

- Five read-only specialists, a Chief, and an independent risk gate
- Named skills with procedures and fail-modes
- One stand-up file for every host: [STAND-UP.md](../STAND-UP.md)
- Frozen Codex core (`AGENTS.md`, `.codex/agents/*.toml`)
- Packet schemas, eval bars, worker spawn files
- Offline specialist schema, chronology, and arithmetic checker
- Documented manual second-model review procedure (not an automated harness)
- Source-freeze receipts (canonical URL, capturedAt, sha256, bytes)
- Worked ticker, hunt, and independent-risk examples

## Next workbench patch: readable scenario bounds

1. Preserve the exact price interval as the reference; add percentage precision only when the usual two decimals would hide a move or merge two boundaries.
2. Check narrow, one-sided, ordinary and numerically indistinguishable bands. Both the workbench and the Markdown export must use the same label function.
3. Require the existing release checks and production artifact smoke. No schema, research-core, evidence-gate or execution changes.

## Now

- Run deterministic checks, then complete independent semantic review before delivery
- Freeze every current print or mark it unknown
- Spawn workers from [`.agents/workers/`](../.agents/workers/)
- Grow a skill only when a real FAIL repeats

## Never

- Orders, wallets, credentials, exchange connections, or a trading API
- A sixth specialist
- Averaging conflicts or inventing percentages
