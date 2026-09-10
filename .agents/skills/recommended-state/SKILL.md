---
name: recommended-state
description: Emit recommended_state only: reject, monitor, deep_dive, or invalidated. Use with the Opportunity scout (`opportunity_scout`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Recommended state

Lane: Opportunity scout (`opportunity_scout`)

Emit recommended_state only: reject, monitor, deep_dive, or invalidated.

## Procedure

1. Emit recommended_state only: reject, monitor, deep_dive, or invalidated.
2. Use monitor plus quarantine_reason when liquidity, access, or mandate fit is unknown.
3. Use reject when a basic-gate failure is confirmed. Use invalidated only when a prior candidate crosses its stated observable invalidation.
4. Never write accepted state. That is the Chief after Risk.

## Do not

- Writing decision_candidate as a Scout
- Skipping quarantine_reason on thin liquidity

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
