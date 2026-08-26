# Crypto Research Desk

A research-only Codex project that routes crypto market questions through four specialist research lanes and an independent risk gate.

## What it provides

- Market regime analysis across macro, liquidity, flows, derivatives, breadth, and cycle conditions.
- Fundamental and on-chain diligence for protocols, token mechanics, value capture, governance, and security risk.
- Opportunity discovery for catalysts, sector rotations, narratives, and market dislocations.
- Quantitative comparison for signal testing, scenarios, relative ranking, and portfolio interaction.
- Independent risk review before any actionable opportunity or portfolio-level conclusion reaches the user.
- A fixed named-ticker forecast contract covering 12 hours, 24 hours, 3 days, and 7 days from one reference-price cutoff.

The Chief of Crypto routes the work, resolves evidence conflicts, and delivers one decision-ready brief. The Chief is not a sixth specialist.

## Quick start

Requirements:

- Codex with project agents and local skills support.
- Read access to public research sources.
- No exchange, broker, wallet, or custody connection.

Clone the repository, open the folder in Codex, then ask:

```text
Use $crypto-fund-research to test the current crypto market regime. Treat a bull cycle as a hypothesis, use current evidence, and send every material conclusion through Independent Risk.
```

For a named ticker:

```text
Use $crypto-fund-research to produce a risk-cleared BTC price probability analysis for 12 hours, 24 hours, 3 days, and 7 days from one exact reference price.
```

## How it works

```text
Market Regime     Fundamental and On-chain     Opportunity Scout
       \                    |                         /
        \                   |                        /
         +---------- evidence and conflicts --------+
                              |
                       Quant and Portfolio
                              |
                       Independent Risk
                              |
                        Chief of Crypto
                              |
                     decision-ready research
```

The workflow keeps facts, calculations, assumptions, inferences, and forecasts separate. Material inputs carry dates or capture times. Conflicting figures are resolved at the source or reported separately. Missing evidence stays unknown.

## Named-ticker forecasts

A named-ticker price forecast must use one exact reference price and show all four horizons. Each horizon uses mutually exclusive ranges whose probabilities total 100%. The default output also includes a `Price target range by horizon` chart built from the final risk-cleared scenario thresholds.

If the available evidence cannot support a horizon, the workflow returns `UNKNOWN` and `INCOMPLETE`. It does not invent probabilities or a chart.

## Safety and limits

This project does not place trades, connect accounts, handle credentials, sign transactions, transfer assets, or manage capital. Research visibility never grants execution authority. The human operator owns every external action.

The accepted v1 core passed a visible 20-case calibration covering authority refusal, source conflict, stale data, invalid probability tables, liquidity gaps, security incidents, thesis invalidation, and named-ticker output behavior. That calibration is not a sealed holdout. It does not establish forecast accuracy, investment performance, or future reliability.

## Repository map

- [`AGENTS.md`](AGENTS.md): project authority, routing, evidence, and delivery rules.
- [`.agents/skills`](.agents/skills): reusable research workflow.
- [`.codex/agents`](.codex/agents): five read-only specialist definitions.
- [`examples`](examples): sample research requests.
- [`tools/verify_release.py`](tools/verify_release.py): exact core-file and configuration verifier.
- [`RELEASE_POLICY.md`](RELEASE_POLICY.md): semantic versioning and publication gates.

## Verify the release

```powershell
py -B tools/verify_release.py
py -B -m unittest discover -s tests -v
```

Both commands run locally and make no network request.

## License

Released under the [MIT License](LICENSE).
