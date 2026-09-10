# Roadmap

This repository stands up a research-only crypto agent team. Do not add a sixth specialist. Do not add execution.

## Done

- Five read-only specialists, a Chief, and an independent risk gate
- Named skills with procedures and fail-modes
- One stand-up file for every host: [STAND-UP.md](../STAND-UP.md)
- Frozen Codex core (`AGENTS.md`, `.codex/agents/*.toml`)
- Packet schemas, eval bars, worker spawn files
- Machine grader plus second-model eval harness
- Source-freeze receipts (canonical URL, capturedAt, sha256, bytes)
- Worked ticker, hunt, and independent-risk examples

## Now

- Grade every packet (machine, then second model) before delivery
- Freeze every current print or mark it unknown
- Spawn workers from [`.agents/workers/`](../.agents/workers/)
- Grow a skill only when a real FAIL repeats

## Never

- Orders, wallets, credentials, exchange connections, or a trading API
- A sixth specialist
- Averaging conflicts or inventing percentages
