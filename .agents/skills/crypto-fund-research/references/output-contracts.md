# Research Output Contracts

Use the smallest contract that answers the request. Omit a section only when it is irrelevant, never because the evidence is inconvenient.

## Market Pulse

A Market Pulse contains, in this order:

1. Exact as-of time and data cutoff.
2. Regime classification and change since the prior accepted pulse.
3. Five or fewer material drivers.
4. Supporting and opposing evidence.
5. Scenario table with probabilities totaling 100%.
6. Watchlist additions, removals, promotions, and invalidations.
7. Near-term triggers.
8. Risk verdict and unresolved unknowns.
9. Reproducibility bundle for every governing aggregate, including component values, basket constituents, fixed query parameters, observation times, and payload or artifact hashes.

If nothing material changed, say so in one sentence and stop.

## Opportunity Card

An Opportunity Card contains:

- asset or instrument;
- research state;
- horizon;
- thesis and mispricing claim;
- dated evidence;
- catalyst and timing;
- market and on-chain confirmation;
- scenario table;
- observable invalidation condition;
- liquidity and access evidence;
- principal permanent-loss risk;
- candidate-screen results;
- confidence and unknowns;
- source links;
- Risk verdict.

The Scout version of this card uses `recommended_state`. Only the Chief's post-Risk version may use an accepted research state.

Do not include position size while mandate fields remain incomplete. Entry levels may be presented only as research conditions with source time, never as an order or claim that execution occurred.

## Specific-Ticker Price Probability

Use this contract whenever the user asks for a named ticker's price probability, statistical likelihood, price target, or price forecast.

1. State the ticker, quote currency, venue or composite, exact reference price, capture time, and timezone.
2. Use all four mandatory horizons: `12 hours`, `24 hours`, `3 days`, and `7 days`. State the exact end timestamp for each horizon.
3. For each horizon, provide a formatted scenario table of nonoverlapping price ranges that collectively cover every price outcome. Every scenario has a percentage probability, and each horizon totals 100% independently.
4. Include the implied return range, key driver, observable trigger, invalidation condition, confidence, and whether the probability is empirical, model-derived, or judgmental.
5. State the method, source window, observation frequency, sample size, transformations, regime adjustment, event assumptions, and calibration or backtest limit.
6. Prefer ranges over false point precision. Do not treat probabilities at different horizons as additive or independent.
7. If evidence cannot support a percentage forecast for a required horizon, return an explicit incomplete data-gap table for that horizon. Do not manufacture a percentage to complete the format.
8. Include a `Price target range by horizon` chart in every delivery unless the user explicitly requests text only. Build it only from the final Risk-cleared scenario thresholds. The chart must:
   - use the fixed visual structure shown in the approved reference: four vertical bear-to-bull ranges on one shared price axis;
   - title the chart `Price target range by horizon`;
   - use the requested quote currency on the vertical price axis and `Forecast horizon` on the horizontal axis;
   - place the horizons left to right as `12h`, `24h`, `3d`, and `7d`;
   - draw a green vertical connector from each bear threshold to its bull threshold;
   - mark every bull endpoint with a pink circle and place the direct label `Bull <price>` above it;
   - mark every bear endpoint with an orange circle and place the direct label `Bear <price>` below it;
   - draw the exact reference price as a neutral dashed horizontal line across the plot and label it `Current <price>` at the right edge;
   - format prices with thousands separators and only the precision supported by the Risk-cleared inputs;
   - state the ticker, reference price, capture time, and timezone immediately above or below the plot;
   - remain readable in light and dark themes and at desktop and mobile widths without clipped or overlapping labels;
   - state that targets are scenario thresholds, not guaranteed closing prices.
9. Do not include the separate probability-only or move-required companion charts by default. Add another chart only when the user requests it or it materially answers a different question.
10. End with the independent Risk verdict and unresolved unknowns.

This output is research-only. It must not contain a position size, order, execution instruction, account action, or claim of portfolio fit while the mandate is incomplete.

## Event Alert

Send an Event Alert only when a named trigger, invalidation condition, high-severity risk, or material regime change occurs. State:

1. What changed.
2. Exact event and observation time.
3. Which thesis or watchlist item it affects.
4. Evidence and source.
5. Expected consequence and confidence.
6. Required research response.

Do not send an alert for recycled news, unexplained price movement, or a threshold that was never defined.

## Weekly Investment Committee Brief

The weekly brief contains:

1. Governing market conclusion.
2. Regime evidence and scenarios.
3. Ranked decision candidates.
4. Deep-dive queue.
5. Invalidated and rejected ideas with reasons.
6. Portfolio interaction, if the mandate permits it.
7. Next dated catalysts and triggers.
8. Independent Risk verdict.
9. Five-function run ledger and same-claim conflict ledger.

Lead with the result. Keep source and calculation detail under the claim it supports.
If no ranking rule and weights were approved in advance, group candidates by tier and preserve ties.

## Risk Packet

For each required assertion, report:

- requirement;
- result: PASS, WARN, FAIL, or UNKNOWN;
- evidence;
- severity;
- repair required.

End with one delivery recommendation: deliver, deliver with warning, repair, or withhold.
