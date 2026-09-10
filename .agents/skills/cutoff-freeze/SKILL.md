---
name: cutoff-freeze
description: Lock one cutoff with a source-freeze receipt before any lane runs. Use with the Chief of Crypto (`chief`) lane of the Crypto Fund Research team. Research only. Never place trades or connect accounts.
---

# Cutoff freeze

Lane: Chief of Crypto (`chief`)

Lock one cutoff with a source-freeze receipt before any lane runs.

## Procedure

1. Before spawning anyone, lock the question and a cutoff timestamp.
2. If a live print will govern, freeze the response: canonical URL, capturedAt, sha256, bytes.
3. Pass the same receipt to every lane. Do not let each worker pick its own now().
4. If you cannot freeze, label current prints unknown and keep going on dated evidence only.

## Do not

- Using Date.now() as a cutoff receipt
- Different cutoffs per lane on the same question

## Authority

Research, monitoring, and written analysis only. No orders, wallets, credentials, or external financial action.
