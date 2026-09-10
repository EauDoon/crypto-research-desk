---
name: four-horizon-anchor
description: Named-ticker work uses one reference-price cutoff. Use with the Market regime (`market_regime`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Four-horizon anchor

Lane: Market regime (`market_regime`)

Named-ticker work uses one reference-price cutoff.

## Procedure

1. Lock one exact reference price, capture time, timezone, and venue or composite.
2. Cover 12 hours, 24 hours, 3 days, and 7 days. State each horizon-end timestamp.
3. Inside a horizon: nonoverlapping ranges, collectively exhaustive, probabilities 100%.
4. Never add probabilities across horizons. If a horizon cannot be supported, mark it incomplete.

## Do not

- Different cutoffs per horizon
- Adding 12h and 7d probabilities

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
