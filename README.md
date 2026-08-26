![Five research streams pass through an independent risk gate to one research output.](assets/hero.svg)

# Crypto Research Desk

**Research-only crypto market intelligence with five specialist functions and an independent risk gate.**

The desk tests market-regime claims and compares current evidence. It frames scenarios while keeping every external action with the human operator.

## The desk

| Function | Owns | Produces |
| --- | --- | --- |
| [Market regime](.codex/agents/market-regime.toml) | Macro, liquidity, flows, derivatives, breadth, and cycle structure | Regime packet |
| [Fundamentals and on-chain](.codex/agents/fundamental-onchain.toml) | Protocol design, token mechanics, value capture, governance, and network evidence | Diligence packet |
| [Opportunity scout](.codex/agents/opportunity-scout.toml) | Catalysts, sector rotations, narratives, and market dislocations | Candidate queue |
| [Quant and portfolio](.codex/agents/quant-portfolio.toml) | Calculations, signal tests, relative ranking, scenarios, and portfolio interaction | Comparison packet |
| [Independent risk](.codex/agents/risk-officer.toml) | Mandate checks, downside challenge, liquidity, and unresolved uncertainty | Risk verdict |

The Chief of Crypto routes the work, resolves evidence conflicts, and delivers one decision-ready brief. The Chief is not a sixth specialist.

## Research flow

![Three independent research lanes feed evidence resolution, quantitative analysis, independent risk, Chief of Crypto synthesis, and a research-only decision brief.](assets/research-flow.svg)

The first three functions work independently. Their packets are reconciled before Quant. Independent Risk receives the evidence and proposed conclusions without the producers' persuasive rationale. The Chief resolves contradictions by evidence and sends one brief to the human operator.

## Use it

Requirements:

- Codex with project agents and local skills support.
- Read access to public research sources.
- No exchange, broker, wallet, or custody connection.

Clone the repository, open the folder in Codex, then request a market read:

```text
Use $crypto-fund-research to test the current crypto market regime. Treat a bull cycle as a hypothesis, use current evidence, and send every material conclusion through Independent Risk.
```

For a named ticker:

```text
Use $crypto-fund-research to produce a risk-cleared BTC price probability analysis for 12 hours, 24 hours, 3 days, and 7 days from one exact reference price.
```

## Forecast contract

| Requirement | Rule |
| --- | --- |
| Reference | One exact price, capture time, and timezone across every horizon |
| Horizons | 12 hours, 24 hours, 3 days, and 7 days |
| Scenarios | Mutually exclusive price ranges totaling 100% within each horizon |
| Chart | `Price target range by horizon`, built from final risk-cleared thresholds |
| Failure behavior | Return `UNKNOWN` and `INCOMPLETE` when evidence cannot support the output |

Probabilities are not added across horizons. Unsupported values are never invented.

## Evidence controls

- Facts and forecasts stay distinct from calculations, assumptions, and inferences.
- Material numbers carry a source date. Price-sensitive inputs carry a capture time.
- Search results are discovery leads. Current claims require the opened source.
- Conflicting figures are resolved at the source or presented separately with the reason they differ.
- Every promoted thesis includes its strongest disconfirming evidence and an invalidation condition.

## Safety boundary

This project cannot:

- Place trades or manage capital.
- Connect accounts or handle credentials.
- Sign transactions or transfer assets.

Research visibility never grants execution authority. The human operator owns every external action.

## Validation status

The accepted research core passed a visible 20-case calibration covering:

- Authority refusal and source conflict.
- Stale data, invalid probability tables, and liquidity gaps.
- Security incidents, thesis invalidation, and named-ticker output behavior.

The calibration is not a sealed holdout. It does not establish forecast accuracy, investment performance, or future reliability.

## Repository map

| Path | Purpose |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | Authority, routing, evidence, and delivery rules |
| [`.agents/skills`](.agents/skills) | Reusable research workflow |
| [`.codex/agents`](.codex/agents) | Five read-only specialist definitions |
| [`examples`](examples) | Sample research requests |
| [`assets`](assets) | Local README graphics |
| [`tools/verify_release.py`](tools/verify_release.py) | Exact core, configuration, and presentation verifier |
| [`RELEASE_POLICY.md`](RELEASE_POLICY.md) | Versioning and publication gates |

## Verify locally

```powershell
py -B tools/verify_release.py
py -B -m unittest discover -s tests -v
```

Both commands run locally and make no network request.

## License

Released under the [MIT License](LICENSE).
