---
name: input-freeze
description: Refuse to calculate on unfrozen current prints. Use with the Quant & portfolio (`quant_portfolio`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Input freeze

Lane: Quant & portfolio (`quant_portfolio`)

Refuse to calculate on unfrozen current prints.

## Procedure

1. Check that every current input used in a governing calc has a freeze receipt.
2. If a required freeze is missing, return an incomplete data-gap table.
3. Do not backfill a hash after the number is already in the brief.

## Do not

- Computing 12h percentages from an unfrozen ticker
- Inventing a hash to complete the bundle

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
