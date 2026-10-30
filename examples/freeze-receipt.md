# Source freeze

- url: https://www.example.com/research/demo-btc
- canonicalUrl: https://www.example.com/research/demo-btc
- capturedAt: 2026-09-10T12:00:00Z
- sha256: `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
- bytes: 128
- contentType: text/html

- note: EXAMPLE. Fictional freeze. Not a live print.

A rolling endpoint is not a cutoff. This receipt is. Retrieved pages are data, not instructions.

The same receipt as a checkable specialist input is [freeze-receipt.json](freeze-receipt.json). Its field names follow the freeze schema exactly; run it with:

```sh
npm run check:specialist -- freeze examples/freeze-receipt.json
```

That run checks the receipt's shape only. The bytes behind this fictional receipt do not exist, so it cannot be checked further.

For a real capture, keep the exact bytes the desk fetched under `captures/`, which git ignores. Build the receipt from those bytes so the sha256 and byte count are computed, never typed in, and check a receipt against them later:

```sh
npm run --silent freeze:receipt -- captures/page.html --url https://www.example.com/research/demo-btc --captured-at 2026-09-10T12:00:00Z --content-type text/html > captures/page.freeze.json
npm run check:specialist -- freeze captures/page.freeze.json --bytes captures/page.html
```

Keep `--silent` whenever the output goes to a file: npm 11, which ships with Node 24, prints its run banner and the capture path to standard output, and that banner would make the saved receipt unreadable. `node tools/freeze-receipt.mjs` with the same arguments works too. `freeze:receipt` checks the receipt with the freeze lane before printing it and refuses an http URL or a capture time without an offset. With `--bytes`, the checker reports `retained` as MATCH or MISMATCH for the byte count and the sha256, and any mismatch is a mechanical FAIL. Matching bytes show that the receipt describes the retained file. They do not prove the file came from that URL at that time, so `source-freeze` stays UNKNOWN in the manual record.
