# Worked named-ticker example

FICTIONAL. Figures are demo shape, not live research. Use this to see isolation:

1. Market Regime returns **unknown** rather than a bull call.
2. Quant refuses to invent complete percentages. Horizons are incomplete data-gap tables.
3. Chief does **not** assign `decision_candidate`.
4. Independent Risk **withholds**. Producer rationale is not required to fail evidence.

Question:

```text
EXAMPLE. Produce a risk-cleared BTC four-horizon forecast from one exact fictional reference. Treat a bull cycle as a hypothesis. If a horizon cannot be supported, mark it incomplete.
```

## Lane results

| Lane | Outcome |
| --- | --- |
| `market_regime` | classification `unknown`. ETF and stablecoin prints not frozen, so excluded. |
| `quant_portfolio` | Four horizons from a fictional 100000 reference. Incomplete. No allocation. No EV. |
| `chief` | One brief. States remain unassigned. Capital Principal owns any action. |
| `risk_officer` | `UNKNOWN` · `withhold`. Evidence and liquidity are UNKNOWN. Authority passes because there is no trade language. |

## Risk assertion ledger

- `authority`: PASS — No order, size, or credential language.
- `evidence`: UNKNOWN — Material current prints were not frozen from a canonical page.
- `scenarios`: WARN — Four horizons present but marked incomplete. Totals are demo only.
- `liquidity`: UNKNOWN — No 2% depth print.
- `invalidation`: PASS — Observable invalidation is stated: a primary freeze that supports expansion.

This is a written workflow example, separate from the browser's Load demo fixture (DEMO at a fictional 100 USD reference). Its run ledger is [run-ledger.json](run-ledger.json), and its incomplete Quant packet is [incomplete-quant.json](incomplete-quant.json); check them with `npm run check:specialist -- run_ledger examples/run-ledger.json` and `npm run check:specialist -- quant_portfolio examples/incomplete-quant.json`. Do not treat the 100000 reference as a live print.
