---
name: implied-return-math
description: Convert each range to a return vs the frozen reference. No EV without payoffs. Use with the Quant & portfolio (`quant_portfolio`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Implied return math

Lane: Quant & portfolio (`quant_portfolio`)

Convert each range to a return vs the frozen reference. No EV without payoffs.

## Procedure

1. Using the frozen reference, convert each scenario's lower/upper to implied return.
2. Keep returns as ranges. Do not collapse to a single target.
3. Do not compute EV unless the operator supplied both payoffs and probabilities explicitly.

## Do not

- A 'target' that is the probability-weighted midpoint

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
