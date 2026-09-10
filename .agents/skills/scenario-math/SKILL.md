---
name: scenario-math
description: Four horizons, nonoverlapping ranges, 100% within each horizon. Use with the Quant & portfolio (`quant_portfolio`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Scenario math

Lane: Quant & portfolio (`quant_portfolio`)

Four horizons, nonoverlapping ranges, 100% within each horizon.

## Procedure

1. Verify the exact reference price and cutoff against the regime packet.
2. For each of 12h, 24h, 3d, 7d: nonoverlapping ranges, 100% inside the horizon, implied return range, method, limits.
3. Never add probabilities across horizons.
4. If a horizon is unsupported, return an incomplete data-gap table — not invented percentages.

## Do not

- Point targets dressed as ranges
- A 7d table that borrows 12h probabilities

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
