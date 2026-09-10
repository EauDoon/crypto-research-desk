# Roadmap

This repository stands up a research-only crypto agent team. Do not add a sixth specialist. Do not add execution.

## Done

- Five read-only specialists, a Chief, and an independent risk gate
- Named skills with procedures and fail-modes
- One stand-up file for every host: [STAND-UP.md](../STAND-UP.md)
- Frozen Codex core (`AGENTS.md`, `.codex/agents/*.toml`)
- Packet schemas, eval bars, worker spawn files, deterministic grader
- Worked ticker, hunt, and independent-risk examples

## Now

- Grade every specialist packet before delivery
- Spawn workers from [`.agents/workers/`](../.agents/workers/), not from memory
- Grow a skill when a real FAIL repeats — do not write a slogan

## Next

- Second-model eval harness: packet in, [EVAL.md](EVAL.md) out, no producer rationale
- Source-freeze receipts for live pages (hash, captured-at, canonical URL)
- More skills only when a lane misses a repeating procedure
- Never: orders, wallets, credentials, or a trading API
