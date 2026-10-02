# Example specialist packets

These are **shapes**, not live research. Figures are fictional. A real run must replace every print with a dated source.

Run complete specialist documents through `npm run check:specialist -- <lane> <file.json>`. The snippets below are nested records, not complete command inputs. [incomplete-quant.json](incomplete-quant.json) is a complete fictional input. A mechanical PASS is never delivery clearance.

Specialist horizons require all four IDs in order and an explicit `incomplete` boolean. Incomplete rows contain only `id`, `incomplete: true`, and a nonblank `gapReason`. Complete rows contain `bearUpper`, `bullLower`, three `probabilities`, three `drivers`, three `triggers`, three `invalidations`, and `confidence`. Their boundaries must increase and probabilities total 100 with at most two decimal places.

Optional top-level `scenarios` use `{ "label": "Example", "probability": 100, "driver": "Fictional condition" }`; a nonempty table totals 100. Optional `method` records use `basis`, `description`, `sourceWindow`, `observationFrequency`, `sampleSize`, `transformations`, `regimeAdjustment`, `eventAssumptions`, and `limitations`. Sample size may be null for judgmental methods only. This is recorded methodology, not proof of calibration.

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
