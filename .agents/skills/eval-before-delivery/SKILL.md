---
name: eval-before-delivery
description: Grade the packet before the operator sees a brief. Use with the Chief of Crypto (`chief`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Eval before delivery

Lane: Chief of Crypto (`chief`)

Grade the packet before the operator sees a brief.

## Procedure

1. Run every machine check in [docs/EVAL.md](../../../docs/EVAL.md): authority, allocation, fact-kind, scenario-sum and horizons, scout-state, risk-isolation, fail-intact, and source-freeze.
2. Optionally send the packet (rationale stripped for Risk) to a second model with EVAL.md.
3. If the grader fails, repair or withhold. Do not deliver a buy over FAIL.

## Do not

- Skipping the grader because the thesis felt strong
- Letting the producer model grade its own packet as Risk
- Grading against a subset of the desk machine checks

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
