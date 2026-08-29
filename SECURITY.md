# Security policy

## Supported version

Security fixes target the latest published major version. The browser workbench currently uses packet schema version 1. Unsupported schema versions are rejected without automatic migration.

## Reporting

Use GitHub's private vulnerability reporting feature when it is enabled for this repository. Do not post sensitive details in a public issue. If no private reporting route is available, request a confidential contact method without disclosing the vulnerability or affected data.

Include the affected version, component, reproduction steps, impact, and a minimal synthetic test case. Never include credentials, private keys, seed phrases, personal data, confidential research, or an exploit against an unrelated system.

## Authority boundary

The project is research only. It does not place orders, connect financial accounts, manage capital, handle trading credentials, sign transactions, or transfer assets. Treat any such behavior as a security defect.

A complete packet or a recorded review never grants authority to act. Review assertions and aliases are operator-supplied data, not authenticated approvals. Different normalized aliases do not prove reviewer independence.

## Technical data model

| Data | Location and lifetime | Control |
| --- | --- | --- |
| Open or imported packet | Browser memory until the page closes or the packet is replaced | Strict bounded parsing; no application upload endpoint |
| Optional saved draft | One unencrypted localStorage entry on the current origin | Off by default; explicit save and clear controls |
| JSON, Markdown, or printed export | A destination selected through the browser | User-controlled files; the app cannot delete or secure exported copies |
| Source-link navigation | The source website, only after an explicit click | HTTPS URL checks, a new-tab notice, and no referrer |
| Page and asset requests | The hosting platform | Hosting configuration, access controls, and policies apply separately |

The application has no research telemetry, external runtime requests, remote fonts, application cookies, authentication system, or database. A host may process request metadata independently of the application. The deployment operator must document that processing and any required notices before production use.

This model does not establish legal compliance, encryption at rest, confidential hosting, or a protected identity boundary. Do not put secrets or confidential information into the app. Shared browser users, extensions, device administrators, and other scripts on the same origin may access local storage.

## Controls and limits

- Plain text is rendered with DOM text APIs and escaped in Markdown exports. There is no HTML, script, or prompt execution path for packet content.
- JSON imports require strict UTF-8 and reject duplicate keys, reserved prototype keys, unknown fields, oversized or complex data, nonfinite or precision-losing numbers, ill-formed Unicode, and hidden formatting controls.
- Forecast partitions and percentage totals are checked independently of the supplied review disposition. Missing evidence, unresolved review assertions, or elapsed research horizons withhold chart display.
- Public HTTPS links are parsed, listed local and test-only hostnames are rejected, and canonical hostnames are displayed; source content and DNS destinations are not fetched or authenticated.
- The static build has an explicit file allowlist, full content hashes, and output integrity checks. Source and build paths cannot be symlinks.
- The local development server binds only to loopback, checks Host, accepts only GET/HEAD, and serves no repository files outside its allowlist.
- The proposed Vercel configuration supplies a restrictive CSP, framing protections, MIME checks, referrer policy, and cache rules. Actual production headers still require deployment verification.

There is no server accepting research packets, so server authentication, RLS, CSRF tokens, CAPTCHA, and API quotas are not implemented. Adding a backend, account system, analytics, live data, AI service, or shared storage changes the threat model and requires a separate design and security review.

## Draft recovery and deployment

Keep JSON backups before clearing storage, replacing a draft, changing origins, or adopting a new packet schema. Corrupt data is retained without automatic overwrite. Failed saves and changes from another tab pause automatic saving.

Deploy only the built `dist/` directory. Do not publish local research files, browser data, working files, scan reports, environment files, or test artifacts. See the [packet guide](docs/WORKBENCH.md) and [deployment runbook](docs/DEPLOYMENT.md) for recovery, release verification, and rollback.
