# Research workbench

The browser workbench helps inspect and preserve a **named-ticker forecast packet**. It does not run agents, retrieve market data, certify evidence, authenticate reviewers, or authorize financial action.

The existing [research workflow](../AGENTS.md) remains authoritative. A complete market scan still needs its run ledger, conflict resolution receipts, frozen calculation inputs, Quant handoff, and independent Risk review. This browser packet is not a replacement for those records.

## Start a packet

1. Open the app through a local HTTP server or an approved deployment. Opening `index.html` directly as a file is not supported.
2. Choose **New packet** for empty research fields, or **Load demo** to inspect a fictional DEMO packet.
3. Use **Edit details** for the asset, reference cutoff, thesis, risks, and manual review record. Use **Edit full packet** for source records, method details, and scenarios.
4. Import an existing UTF-8 JSON packet with **Import JSON**. Strict decoding, parsing, and validation happen in the browser. Invalid input leaves the open packet unchanged.
5. Export JSON for a portable, editable record. Export a Markdown brief for text and tables. Use **Print / PDF** for the chart and all four horizon tables.

The example's asset, price, probabilities, sources, and people are fictional. It is not a forecast or a record of a completed independent review. New packets use empty text and `null` for unknown values; they do not inherit the example's forecasts.

## Packet schema, version 1

The runtime contract is implemented in [packet.js](../web/packet.js). [example.js](../web/example.js) creates a complete synthetic packet. The app can export either a blank or example packet as a starting point.

All listed fields are required, including empty fields. Unknown keys and unsupported schema versions are rejected. There is no automatic schema migration.

| Object | Fields |
| --- | --- |
| Root | `schemaVersion`, `kind`, `preparedBy`, `asset`, `reference`, `thesis`, `disconfirmingEvidence`, `invalidation`, `liquidity`, `risks`, `unknowns`, `method`, `sources`, `horizons`, `riskReview` |
| `asset` | `symbol`, `name`, `quoteCurrency`, `venue` |
| `reference` | `price`, `capturedAt`, `timezone` |
| `method` | `basis`, `description`, `sourceWindow`, `observationFrequency`, `sampleSize`, `transformations`, `regimeAdjustment`, `eventAssumptions`, `limitations` |
| Each source | `id`, `title`, `url`, `type`, `publishedAt`, `capturedAt`, `claim`, `excerpt` |
| Each horizon | `id`, `endAt`, `status`, `gapReason`, `scenarios` |
| Each scenario | `label`, `lower`, `upper`, `probability`, `driver`, `trigger`, `invalidation`, `confidence` |
| `riskReview` | `status`, `reviewer`, `reviewedAt`, `notes`, `sourceIds`, `assertions` |
| Each review assertion | `id`, `result`, `evidence`, `severity`, `repair` |

`kind` is `research` or `synthetic`. The researcher and reviewer fields are aliases supplied by the operator, not verified identities. Asset symbols use 1 to 20 uppercase letters, digits, periods, or hyphens. Quote symbols use 2 to 12 uppercase letters or digits.

### Limits and dates

- Packets must fit within 256 KiB of UTF-8 JSON. Individual prose fields accept at most 5,000 characters, with tighter limits for identifiers, names, and URLs.
- Risks, unknowns, and sources each accept at most 32 entries. The parser also limits nesting, total nodes, and array lengths.
- Duplicate keys, reserved prototype keys, sparse lists, nonfinite numbers, precision-losing numbers, malformed UTF-8, ill-formed Unicode, and hidden Unicode formatting controls are rejected.
- Prices are numbers from zero to 1 trillion, with a strictly positive reference price. Use `null` for an unknown reference price and the unbounded upper tail.
- Timestamps require seconds and a known explicit offset, such as `2026-08-20T09:00:00Z`; the RFC 3339 unknown-offset marker `-00:00` is rejected. Calendar dates are checked. The display timezone is an IANA name such as `UTC` or `Asia/Singapore`. Decision-facing timestamps include the local wall time, its numeric UTC offset, and the canonical UTC instant so repeated daylight-saving times remain unambiguous.
- Evidence must be published before or at capture, and captured before or at the common reference cutoff. Review time cannot predate that evidence or cutoff. A five-minute tolerance accommodates clock skew; it does not establish freshness.
- An elapsed research horizon withholds the chart and receives an **ELAPSED** label. Checks refresh at least every minute while visible and when the page becomes visible again. Exports and printing recheck the current time. Synthetic examples remain visibly fictional rather than expiring.

### Evidence and method

Source URLs must be public HTTPS URLs without embedded credentials, a custom port, or a listed local, test-only, or special-use namespace such as `.example`, `.onion`, `.home.arpa`, or `.alt`. At least one primary source record is required for structural completeness. Reserved example domains cannot support a packet labeled `research`. The workbench displays the canonical hostname beside each operator-supplied source title.

The app validates URL form and recorded chronology. It does not open sources, inspect DNS destinations, prove primary-source status, verify excerpts, resolve contradictions, or determine whether evidence is stale for a particular claim. The operator must do that work.

`method.basis` is `judgmental`, `empirical`, or `model-derived`. All method descriptions must explain the supplied probabilities. Empirical and model-derived methods require a positive integer sample size; judgmental methods may use `null` when a sample size is not applicable. None of these labels establishes calibration or predictive accuracy.

### Scenarios and chart

Horizons appear exactly once, in this order: `12h`, `24h`, `3d`, `7d`. Each `endAt` must equal the shared cutoff plus 12, 24, 72, or 168 hours.

Each complete horizon contains exactly three scenarios, in Bear, Base, Bull order:

| Scenario | Required interval |
| --- | --- |
| Bear | Zero inclusive to its finite upper bound exclusive |
| Base | Bear's upper bound inclusive to its own finite upper bound exclusive |
| Bull | Base's upper bound inclusive with `upper: null` for the unbounded tail |

Adjacent bounds must meet exactly. Each percentage uses at most two decimal places; the three values must total exactly 100.00% in integer hundredths. Probabilities are not additive across horizons.

An incomplete horizon must have a nonempty `gapReason` and an empty `scenarios` list. Do not substitute guesses for missing evidence.

Confidence is `low`, `medium`, or `high`. It is supplied by the researcher, not calculated by the app. Implied returns are approximate displays rounded to two decimal places. Numerical overflow displays **UNKNOWN**, never an infinite return. Original price values remain available in JSON, tables, and exact chart endpoint labels; chart axis ticks are abbreviated.

The chart uses the exclusive Bear ceiling and inclusive Bull floor from each complete horizon. Those scenario boundaries are not confidence intervals or guaranteed closing prices. The chart appears only when structural checks and the supplied review record are complete.

### Manual review record

The five assertion IDs are `authority`, `evidence`, `scenarios`, `liquidity`, and `invalidation`. Each records `PASS`, `WARN`, `FAIL`, or `UNKNOWN`, evidence, severity (`low`, `medium`, `high`), and any required repair.

A final review must account for every source and all five assertions. Warnings require a warning disposition; failed or unknown assertions block the chart. `repair` and `withhold` block delivery. `deliver` cannot coexist with unresolved unknowns. Non-PASS assertions require a repair description.

The preparer and reviewer aliases cannot match after Unicode compatibility normalization, whitespace collapse, and case normalization. This is only a consistency check. Different aliases, even a structurally complete record, do not prove that two independent people reviewed the work.

Every material local input edit resets final or partial review data to a blank pending record. Save the changed inputs first, then record the actual new review. Attempts to change inputs and review data together are rejected without clearing the editor. Reordering JSON keys, review assertions, or reviewed source IDs does not count as a review change. Saving unchanged details does not reset the review. Imported records remain self-reported and unverified.

The details form preserves valid multiline risk and unknown entries on a no-op save. If one of those lists already contains a multiline entry, edit it in the full packet editor; the compact one-item-per-line control refuses a lossy rewrite.

## Saving, privacy, and recovery

Local saving is off by default. **Remember this packet** stores one unencrypted draft under `crypto-research-desk.packet.v1` in the current browser origin. It is not account storage, synchronization, or a backup. Different deployment URLs have separate browser storage.

**Clear saved draft** removes only this app's storage key and leaves the open packet in memory. The open copy is then treated as unsaved, so closing or navigating away receives the browser's unsaved-change protection. Replacing an edited draft requires confirmation. If another tab changes storage, automatic saving pauses rather than overwriting the open packet.

Corrupt saved data is retained without being overwritten. Storage failures disable automatic saving and display a warning. Export the open packet, retain any recoverable original JSON, and clear the app's saved data only when ready. Browsers and device administrators can remove local storage independently.

The app has no research upload endpoint, runtime API requests, telemetry, remote fonts, cookies of its own, or financial account integration. Hosting providers still receive ordinary page and asset requests. Clicking a source link opens that external site in a new tab without a referrer; that site's own policies apply. Browser extensions and other users of a shared browser can access local information.

Do not enter credentials, wallet secrets, personal financial records, or confidential evidence. See the [security policy](../SECURITY.md) and [deployment runbook](DEPLOYMENT.md).
