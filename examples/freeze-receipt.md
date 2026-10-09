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

A mechanical PASS checks the shape only. It does not prove the bytes were captured or hashed correctly.
