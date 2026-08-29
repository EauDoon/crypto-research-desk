# Deployment runbook

This is a static browser application. The build uses Node built-ins and produces `dist/`. It needs no runtime API, database, environment secret, authentication provider, or trading integration.

A successful local build is not a completed production release. GitHub publication, Vercel project creation, deployment, promotion, and metadata changes each require authorization for their exact targets.

## Local verification

Use Node 24.x and Python 3.11 or later. Build and preview commands fail fast on another Node major. From the repository root:

```powershell
npm ci --ignore-scripts
npm run check
py -B tools/verify_release.py
py -B -m unittest discover -s tests -v
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) 'work\playwright-browsers'
npx playwright install chromium firefox
npm run test:browser
```

On Linux, use the available Python 3 executable and install Playwright browser system dependencies as the CI workflow does. On a restricted Windows host, browser execution may need permission to start and stop its own child processes.

`npm run dev` serves source files on loopback only. `npm run preview` loads and verifies a production build once, then serves that immutable in-memory byte snapshot even if `dist/` changes. Restart preview to inspect a later build. Both commands default to `http://127.0.0.1:4173` and support `-- --port 4174`. Do not expose this development server to a network.

The [CI workflow](../.github/workflows/ci.yml) runs the exact research-core check, Python regressions, Node tests, build, dependency audit, and Chromium/Firefox browser and accessibility tests. Its actions are pinned to immutable commits, its token is read-only, and it does not deploy. Check the CI result for the exact proposed commit, not a previous revision.

## Build contract

The build copies only the reviewed files named in [web-config.mjs](../tools/web-config.mjs). It never publishes the repository root, research instructions, local packets, dependency folders, test results, or working files.

JavaScript, CSS, and the favicon receive full SHA-256 filenames. Module imports and HTML references are rewritten before publication. Canonical `build-info.json` records exactly the workbench version, research-core version, ordered public file names, and aggregate content digest. The workbench version comes from `package.json` and must match both lockfile version fields; the independently verified research-core version remains in `VERSION`, so the two values may intentionally differ.

Rebuilding the same inputs produces the same digest. Text inputs and manifests require valid UTF-8, while artifact verification hashes the emitted bytes without lossy decoding. Preview startup checks the canonical manifest, both versions, asset membership, regular-file boundaries, and content hashes. A digest identifies bytes; it is not a signature, source verification, or independent security certification.

`dist/` is reserved for generated output. The builder takes an exclusive `.dist-build.lock`, refuses symlinked inputs, unmanaged output, and unexpected files, writes and verifies a sibling staging directory, then performs a guarded replacement. An installation error triggers restoration of the prior artifact. A concurrent build or pre-existing lock, stage, or backup fails closed and preserves that recovery evidence for inspection; nothing pre-existing is deleted automatically. If a guard or recovery step trips, inspect the reported paths and preserve anything valuable. Do not bypass the guard with a blanket cleanup command.

## Configure the exact Vercel project

After project creation and deployment are authorized, select the intended Vercel account/team and import only `EauDoon/crypto-research-desk`.

| Setting | Value |
| --- | --- |
| Framework preset | Other, represented by `framework: null` |
| Root directory | Repository root |
| Node version | 24.x |
| Install command | `npm ci --ignore-scripts --omit=dev` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Runtime secrets | None |
| Functions, cron, and database | None |

These values are in [vercel.json](../vercel.json). Confirm that dashboard overrides do not contradict them. The build needs no test dependencies; CI installs those separately. Review [Vercel configuration](https://vercel.com/docs/project-configuration/vercel-json) and [Node version selection](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) when platform behavior changes.

Use a preview deployment first. Record the actual project ID, deployment ID, source commit, target environment, generated URL, and build log result. Never assume a guessed hostname belongs to this project. Preserve deployment protection. Do not create bypass links or relax permissions to obtain a passing test.

The app's CSP excludes third-party scripts and runtime connections. Do not enable toolbar injection, analytics, or another integration by weakening that policy. Any such feature needs a separate privacy/security review and authorization.

Git integration can automatically deploy branch pushes. Review the selected production branch and preview behavior before connecting it, and include those side effects in approval. See [Vercel Git integration](https://vercel.com/docs/git).

## Preview and production acceptance

Before promotion, verify all of the following against the actual HTTPS deployment:

1. GitHub's source commit and tree match the approved candidate; its required checks succeeded.
2. Vercel reports a successful deployment from that commit. Download `build-info.json` and compare its artifact digest with the local reviewed build.
3. The root page loads all hashed assets. Verify import, rejection of malformed input, review reset, JSON/Markdown downloads, local saving/clearing, and keyboard navigation with fictional test data.
4. Check Chromium and Firefox, a narrow mobile viewport, the custom 404, and print/PDF output. Confirm that no research payload or unexpected request leaves the page.
5. Inspect the actual CSP, framing protections, MIME types, referrer policy, and HTTPS/HSTS behavior. Verify HTML/manifest revalidation and immutable caching of hashed assets using response headers. Platform precedence is not proven by local tests. See [Vercel cache headers](https://vercel.com/docs/caching/cache-control-headers).
6. Confirm that no repository files, environment files, packets, source maps, or test artifacts are publicly served.
7. Record the operator, support route, hosting access-log location and retention, applicable privacy notice, and backup expectations. Technical privacy documentation does not establish legal compliance.
8. Obtain separate authorization for production promotion or a merge that triggers it. Verify the promoted URL and exact source after the action.

After the local gates pass, run the separate live acceptance smoke against the exact HTTPS origin:

```sh
PRODUCTION_URL=https://crypto-research-desk.vercel.app npm run test:production
```

On PowerShell, set `$env:PRODUCTION_URL` first. For a protected preview, also set the project's `VERCEL_AUTOMATION_BYPASS_SECRET`; the test sends Vercel's documented bypass headers without disabling protection. This rebuilds locally, compares the live canonical manifest with that reviewed artifact, checks production security and cache headers, confirms repository metadata returns 404, and exercises the local-only workflow in Chromium and Firefox. It does not replace the manual ownership, privacy, support, or Git-source checks above.

Do not call the release production-ready if required access, checks, ownership, or live verification is missing. Do not publish a forecast-quality claim based on software tests.

## Operations and rollback

Use deployment status and platform-level request/error information without collecting research packet contents. This application has no research logging endpoint or active monitoring service.

For a failed rollout, retain the last known good deployment ID and reviewed source commit. Obtain authorization to restore that deployment through Vercel's supported rollback/promotion controls. Verify the resulting source, artifact, routes, and headers after rollback. A Git revert or branch push alone does not prove that production changed.

Local drafts stay tied to their browser origin. Schema version 1 rejects unsupported formats without automatic conversion. Keep JSON exports before changing domains, origins, or packet format. An incompatible future schema requires an explicit migration and recovery plan.

Do not delete branches, deployments, user drafts, or historical evidence as part of routine release cleanup. Do not force-push or rewrite public history.
