---
name: freeze-or-unknown
description: A current print without a freeze receipt cannot PASS evidence. Use with the Independent risk (`risk_officer`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Freeze or unknown

Lane: Independent risk (`risk_officer`)

A current print without a freeze receipt cannot PASS evidence.

## Procedure

1. For each current price or flow used as evidence, require url, capturedAt, and sha256.
2. If the freeze is missing, score evidence UNKNOWN or FAIL. Do not PASS.
3. Do not accept a producer-invented hash after the fact.

## Do not

- PASSing a live BTC print with only 'as of just now'
- Trusting a screenshot with no URL

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
