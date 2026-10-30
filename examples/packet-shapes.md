# Example specialist packets

These are **shapes**, not live research. Figures are fictional. A real run must replace every print with a dated source.

Run complete specialist documents through `npm run check:specialist -- <lane> <file.json>`. The snippets below are nested records, not complete command inputs. [incomplete-quant.json](incomplete-quant.json) is a complete fictional input. A mechanical PASS is never delivery clearance.

Specialist horizons require all four IDs in order and an explicit `incomplete` boolean. Incomplete rows contain only `id`, `incomplete: true`, and a nonblank `gapReason`. Complete rows contain `bearUpper`, `bullLower`, three `probabilities`, three `drivers`, three `triggers`, three `invalidations`, and `confidence`. Their boundaries must increase and probabilities total 100 with at most two decimal places.

Optional top-level `scenarios` use `{ "label": "Example", "probability": 100, "driver": "Fictional condition" }`; a nonempty table totals 100. Optional `method` records use `basis`, `description`, `sourceWindow`, `observationFrequency`, `sampleSize`, `transformations`, `regimeAdjustment`, `eventAssumptions`, and `limitations`. Sample size may be null for judgmental methods only. This is recorded methodology, not proof of calibration.

A Chief record may list its accepted research states in an optional `states` array. Each row names the `subject`, the `state`, the Independent Risk `riskVerdict` and `riskDelivery` it follows, and a `reason`. A `decision_candidate` under a FAIL or UNKNOWN verdict, or under a `repair` or `withhold` disposition, fails, and each subject has one state.

Two pseudo-lanes check the run's own records. A `run_ledger` lists one row per specialist run with its `agent`, `model`, `effort`, `task`, terminal `state` and times; [run-ledger.json](run-ledger.json) is the worked named-ticker run. A `conflict_ledger` records each repeated claim with at least two observations and a `resolution` of `consistent`, `resolved`, `both_presented` or `unknown`; a resolved row carries the `opened` source and a `resolvedValue` equal to that source's value, never a blend. [conflict-ledger.json](conflict-ledger.json) holds one resolved row and one presented both ways.

Risk requires exactly one of each of its five assertion IDs. Non-PASS assertions need repair text. FAIL or UNKNOWN assertions/verdicts cannot coexist with a delivery disposition. Source capture cannot follow the common cutoff, and publication cannot follow capture. Timestamps use the same calendar-checked, known-offset format as the workbench. Freeze byte counts are nonnegative safe integers. Unknown nested fields are rejected.

## Scout candidate (recommended_state only)

```json
{
  "asset": "EXAMPLE",
  "recommendedState": "monitor",
  "thesis": "Fictional relative-value gap after a dated unlock.",
  "catalyst": "Token unlock window stated on the opened canonical page.",
  "quarantineReason": "liquidity"
}
```

## Chief accepted state

```json
{
  "subject": "EXAMPLE",
  "state": "monitor",
  "riskVerdict": "UNKNOWN",
  "riskDelivery": "withhold",
  "reason": "Liquidity depth was not frozen, so the candidate stays on monitor."
}
```

## Conflict ledger row

```json
{
  "claim": "EXAMPLE. Circulating supply of the fictional stablecoin.",
  "unit": "USD",
  "observations": [
    { "lane": "market_regime", "value": "1250000000", "url": "https://www.example.com/aggregator/supply", "capturedAt": "2026-09-10T10:00:00Z" },
    { "lane": "fundamental_onchain", "value": "1180000000", "url": "https://www.example.org/explorer/supply", "capturedAt": "2026-09-10T10:30:00Z" }
  ],
  "resolution": "resolved",
  "opened": { "url": "https://www.example.net/issuer/attestation", "capturedAt": "2026-09-10T11:00:00Z", "value": "1180000000" },
  "resolvedValue": "1180000000",
  "reason": "The issuer page was opened directly. The aggregator counts a bridged supply twice."
}
```

## Risk assertion

```json
{
  "id": "liquidity",
  "result": "UNKNOWN",
  "evidence": "No 2% depth print with a capture time.",
  "severity": "high",
  "repair": "Open a primary venue page and freeze depth before any promotion."
}
```
