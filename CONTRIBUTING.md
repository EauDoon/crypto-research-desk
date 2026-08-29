# Contributing

Contributions should preserve the research-only authority boundary and the independent risk gate.

## Local setup

Use Node 24.x and Python 3.11 or later. Install the pinned test dependencies without lifecycle scripts:

```sh
npm ci --ignore-scripts
```

Run the release-core and workbench checks before opening a pull request:

```sh
python3 -B tools/verify_release.py
python3 -B -m unittest discover -s tests -v
npm run check
npx playwright install chromium firefox
npm run test:browser
```

On Windows, use `py` in place of `python3`. Browser installation downloads local test binaries. The browser command builds `dist/` automatically and exercises responsive behavior, keyboard access, accessibility, storage recovery, imports, and exports with fictional packets.

Before opening a pull request:

1. Keep every specialist read-only.
2. Preserve source dates, capture times, unknown values, and conflict receipts.
3. Keep named-ticker forecasts on the four required horizons.
4. Add or update tests for every behavior change.
5. Run the release verifier, unit suite, deterministic build, and relevant browser tests.
6. Preserve strict UTF-8 import, inert rendering/export, opt-in storage, and production security-header parity.
7. State any change to authority, topology, output contracts, privacy, security, or compatibility.
8. Include screenshots for visible changes and a concise verification receipt.

Do not submit secrets, account details, wallet data, private datasets, copied research, paid-source content, or unlicensed assets.
