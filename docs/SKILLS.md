# Skill catalog

Each skill is a named procedure for **one** lane. Attach the file. Do not flatten the stack into a single prompt.

Grow a lane with [ADDING-SKILLS.md](ADDING-SKILLS.md). Grade a packet with [EVAL.md](EVAL.md).

## Chief of Crypto (`chief`)

Owns: Routing, synthesis, conflict resolution, delivery to the Capital Principal
Does not own: Specialist evidence production, independent risk verdict wording

| Skill | Name | Summary |
| --- | --- | --- |
| [`routing`](../.agents/skills/routing/SKILL.md) | Smallest useful set | Assign only the lanes that add a distinct result. |
| [`conflict-ledger`](../.agents/skills/conflict-ledger/SKILL.md) | Same-claim conflict ledger | Resolve mismatches at the canonical source before Quant. |
| [`research-states`](../.agents/skills/research-states/SKILL.md) | Accepted research states | Only the Chief assigns reject, monitor, deep_dive, decision_candidate, or invalidated. |
| [`delivery-gate`](../.agents/skills/delivery-gate/SKILL.md) | Decision-ready brief | One brief to the operator, with uncertainty visible. |
| [`ledger-hygiene`](../.agents/skills/ledger-hygiene/SKILL.md) | Run ledger | Every worker appears with model, effort, task, and terminal state. |
| [`incomplete-honest`](../.agents/skills/incomplete-honest/SKILL.md) | Label incomplete | Missing evidence stays UNKNOWN. Do not smooth a hole. |

## Market regime (`market_regime`)

Owns: Macro, liquidity, flows, derivatives, breadth, cycle structure
Does not own: Token underwriting, allocation, final call

| Skill | Name | Summary |
| --- | --- | --- |
| [`macro-liquidity`](../.agents/skills/macro-liquidity/SKILL.md) | Macro liquidity | Rates, the dollar, cross-asset risk, spot and fund flows, stablecoin liquidity. |
| [`derivatives-structure`](../.agents/skills/derivatives-structure/SKILL.md) | Derivatives structure | Funding, basis, open interest, options positioning, liquidations. |
| [`breadth-and-cycle`](../.agents/skills/breadth-and-cycle/SKILL.md) | Breadth and cycle | BTC and ETH market structure, breadth, volatility, expansion vs distribution. |
| [`scenario-tables`](../.agents/skills/scenario-tables/SKILL.md) | Regime scenarios | Mutually exclusive outcomes totaling 100%. |
| [`four-horizon-anchor`](../.agents/skills/four-horizon-anchor/SKILL.md) | Four-horizon anchor | Named-ticker work uses one reference-price cutoff. |
| [`etf-stablecoin-pulse`](../.agents/skills/etf-stablecoin-pulse/SKILL.md) | ETF and stablecoin pulse | Spot ETF prints and stablecoin supply as liquidity thermometers, not as trade signals. |
| [`liquidation-crowding`](../.agents/skills/liquidation-crowding/SKILL.md) | Liquidation and crowding | Clustered liquidations and one-sided positioning as regime fragility. |

## Fundamentals & on-chain (`fundamental_onchain`)

Owns: Protocol design, token mechanics, value capture, governance, network evidence
Does not own: Whole-market regime, portfolio math, final call

| Skill | Name | Summary |
| --- | --- | --- |
| [`token-mechanics`](../.agents/skills/token-mechanics/SKILL.md) | Token mechanics | Supply, issuance, burns, unlocks, holder concentration, governance. |
| [`value-capture`](../.agents/skills/value-capture/SKILL.md) | Value capture | Fees, revenue where meaningful, treasury, and who captures it. |
| [`on-chain-evidence`](../.agents/skills/on-chain-evidence/SKILL.md) | On-chain evidence | Users, fees, flows, staking, exchange movement, with observation times. |
| [`defi-protocol-risk`](../.agents/skills/defi-protocol-risk/SKILL.md) | DeFi protocol risk | Contract, oracle, bridge, custody, liquidity, depeg, concentration. |
| [`catalyst-dating`](../.agents/skills/catalyst-dating/SKILL.md) | Catalyst dating | Roadmaps and governance only after the canonical page is opened. |
| [`unlock-and-float`](../.agents/skills/unlock-and-float/SKILL.md) | Unlock and float | Circulating supply vs unlock calendar vs what can actually trade. |
| [`competitive-set`](../.agents/skills/competitive-set/SKILL.md) | Competitive set | Two to four comparable protocols; relative value capture, not a beauty contest. |

## Opportunity scout (`opportunity_scout`)

Owns: Catalysts, sector rotations, narratives, market dislocations
Does not own: Deep underwriting, sizing, accepted state, promotion

| Skill | Name | Summary |
| --- | --- | --- |
| [`catalyst-hunt`](../.agents/skills/catalyst-hunt/SKILL.md) | Catalyst hunt | Listings, unlocks, governance, regulation, incentives, relative-value gaps. |
| [`narrative-vs-evidence`](../.agents/skills/narrative-vs-evidence/SKILL.md) | Narrative vs evidence | Reject promotion, anonymous claims, and price action without a testable thesis. |
| [`candidate-screen`](../.agents/skills/candidate-screen/SKILL.md) | Candidate screen | Score evidence, thesis, catalyst, liquidity, asymmetry, and risk clarity 0–5. |
| [`recommended-state`](../.agents/skills/recommended-state/SKILL.md) | Recommended state | Emit recommended_state only: reject, monitor, deep_dive, or invalidated. |
| [`liquidity-gate`](../.agents/skills/liquidity-gate/SKILL.md) | Liquidity gate | Depth, spread, venue, and whether the idea is even researchable at book scale. |
| [`crowding-filter`](../.agents/skills/crowding-filter/SKILL.md) | Crowding filter | Crowded narrative vs a still-testable dislocation. |

## Quant & portfolio (`quant_portfolio`)

Owns: Calculations, signal tests, ranking, scenario math, portfolio interaction
Does not own: Narrative generation, missing-input guesses, final call

| Skill | Name | Summary |
| --- | --- | --- |
| [`consistency-ledger`](../.agents/skills/consistency-ledger/SKILL.md) | Cross-packet consistency | Same-claim mismatches are blocking until the source resolves them. |
| [`scenario-math`](../.agents/skills/scenario-math/SKILL.md) | Scenario math | Four horizons, nonoverlapping ranges, 100% within each horizon. |
| [`reproducibility-bundle`](../.agents/skills/reproducibility-bundle/SKILL.md) | Reproducibility bundle | Freeze component inputs, constituents, query parameters, times, and hashes. |
| [`mandate-gap`](../.agents/skills/mandate-gap/SKILL.md) | Mandate gap | Refuse allocation sizing while risk tolerance or capital context is missing. |
| [`sensitivity-table`](../.agents/skills/sensitivity-table/SKILL.md) | Sensitivity table | Move one frozen input and show what breaks. |
| [`implied-return-math`](../.agents/skills/implied-return-math/SKILL.md) | Implied return math | Convert each range to a return vs the frozen reference. No EV without payoffs. |

## Independent risk (`risk_officer`)

Owns: Mandate checks, downside challenge, liquidity, unresolved uncertainty
Does not own: Thesis production, execution, final call

| Skill | Name | Summary |
| --- | --- | --- |
| [`independent-gate`](../.agents/skills/independent-gate/SKILL.md) | Independent gate | Do not inherit producer confidence or persuasive framing. |
| [`assertion-ledger`](../.agents/skills/assertion-ledger/SKILL.md) | Assertion ledger | PASS, WARN, FAIL, or UNKNOWN on each required assertion. |
| [`downside-challenge`](../.agents/skills/downside-challenge/SKILL.md) | Downside challenge | Find the strongest plausible failure mode, not a longer list of minor risks. |
| [`forecast-gate`](../.agents/skills/forecast-gate/SKILL.md) | Forecast gate | Four horizons from one cutoff, 100% within each, no invented precision. |
| [`source-quality`](../.agents/skills/source-quality/SKILL.md) | Source quality | Primary vs secondary, age, and host concentration. |
| [`liquidity-failure`](../.agents/skills/liquidity-failure/SKILL.md) | Liquidity failure | If the idea cannot be investigated at a realistic book scale, it cannot be a decision candidate. |


## Isolation

- Independent lanes do not read each other.
- Quant sees reconciled packets only.
- Independent Risk does not receive producer rationale.
- Only the Chief assigns accepted research states, and only after Risk.
