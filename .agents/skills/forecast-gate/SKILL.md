---
name: forecast-gate
description: Four horizons from one cutoff, 100% within each, no invented precision. Use with the Independent risk (`risk_officer`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Forecast gate

Lane: Independent risk (`risk_officer`)

Four horizons from one cutoff, 100% within each, no invented precision.

## Procedure

1. Require 12h, 24h, 3d, 7d from one exact cutoff, each totaling 100% with nonoverlapping ranges.
2. Fail invented percentages, hidden gaps, or mixed cutoffs.
3. Fail any implied trade, entry, stop, allocation, or position size.

## Do not

- Passing a three-horizon forecast
- Allowing 'buy the dip at X' as research color

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
