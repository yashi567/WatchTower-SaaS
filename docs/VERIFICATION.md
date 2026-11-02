# Verification record

Verified on **November 2, 2026** in the provided Windows workspace using Node.js 22.20.0. No Cloudflare resources were deployed or modified remotely. Tests do not certify live production capacity.

## Executed checks

| Check | Observed result |
| --- | --- |
| `npm install` / dependency compatibility | Completed; lockfile included; current Cloudflare Vite integration and Better Auth docs consulted |
| `npm run db:migrate:local` | All four migrations applied successfully to local D1; full migration set also applied to isolated test D1 databases |
| `npm run db:seed` | Completed; five synthetic services, raw checks, illustrative aggregates, incidents and `/status/acme`; only demo organization replaced |
| `npm run typecheck` | Passed with strict TypeScript |
| `npm run lint` | Passed, no lint errors |
| `npm test` | **85 passed across four files**, no skipped tests |
| `npm run build` | Passed for both Worker and browser environments |
| Production-preview Playwright | **14 passed**, seven scenarios each in desktop Chromium and emulated mobile Chromium; final run 47.7 seconds |
| Browser error collection | No page errors or console errors while capturing final landing, dashboard, monitor, status, light-theme and mobile screenshots |
| Production-preview HTTP smoke checks | `/`, `/demo/overview`, `/api/health`, `/api/demo/analytics/overview`, `/api/public/status/acme` all returned 200 |
| Security headers | Built HTML responses emitted CSP and `X-Frame-Options: DENY`; API responses emitted Hono security headers |
| `npm run check:scheduled` | Actual local Cloudflare scheduled-handler invocation returned 200 with outcome `ok` |
| `npm run measure:local` | Isolated Miniflare D1 transaction metadata saved in `docs/measurements/local-d1.json` |
| `npm audit --audit-level=moderate` | **0 vulnerabilities** in the installed dependency tree |
| `npm audit --omit=dev` | **0 vulnerabilities** in runtime dependencies |
| `npm exec wrangler -- deploy --dry-run --outdir .wrangler/dry-run` | Passed, generated configuration and bindings recognized; **no upload/deployment performed** |

The first test runs exposed fixture setup, selector, route-readiness and implementation edge cases. They were fixed and relevant suites rerun. Results above refer to the final successful checks, not the initial failing attempts. Browser tests wait for product readiness rather than assuming theme initialization means the workspace finished loading.

## Test coverage

**49 unit tests** validate HTTP URL restrictions, alternate IP forms, private/reserved DNS records, fail-closed DNS errors, Discord destination restrictions, failure/recovery thresholds, scheduling floors, incident transitions, missing uptime, nearest-rank percentiles, explicit role permissions, effective capacity clamping, stale/pending/demo status presentation, controlled measurement outcomes, redirects, timeout handling, no fetch for unapproved hosts, and AES-GCM round trips/tamper failure.

**32 workflow integration tests** use real Miniflare/workerd D1 and all migrations. They verify Better Auth OAuth initiation/state cookies, signed sessions, rejection of forged/expired sessions, logout, protected routes, CSRF origins, cross-tenant IDs, viewer/member restrictions, CRUD persistence, pause/resume/manual-check rate limits, overlapping claims, expired leases, incident opening and recovery without duplicate events, actual stored analytics, manual lifecycle transitions, public-field redaction, publish/unpublish/update/delete behavior, tenant-safe status associations, channel encryption, outbox idempotency, transient retries, permanent failures, per-member reads/preferences, email-bound invitation acceptance/consumption, new membership access, member administration boundaries, capacity admission, the exported scheduled handler with controlled external boundaries, and synthetic-versus-real retention.

**2 HTTP fixture tests** start a controlled local Node HTTP server and execute actual GET/HEAD requests, 503 responses, and a request aborted by its timeout. A test-only fetch adapter maps an already validated approved hostname to the local fixture. Production URL validation and DNS rules are unchanged; no development SSRF bypass is present.

**2 React Testing Library tests** validate accessible dialog naming/Escape behavior and persisted theme changes.

**14 Playwright tests** run against the final built Worker/Static Assets preview. They exercise the landing CTA and credential-free demo, every dashboard navigation route, monitor search/details/history/read-only form, incident timeline, analytics charts/ranges, public status page, 404, persisted themes and keyboard command search, and horizontal page overflow on representative routes. Mobile uses an iPhone-sized viewport with Chromium, not a real iOS/Safari device. No claim is made about Firefox, Safari, assistive technology audits, or real-device testing.

## Build observations

The final browser entry chunk was approximately **447.77 kB / 143.48 kB gzip**. The lazily loaded chart chunk was approximately **387.02 kB / 112.78 kB gzip**. Route modules are split from the marketing entry. Fonts are served locally.

Wrangler's dry run reported **1,787.97 KiB total Worker upload / 349.60 KiB gzip** and 26 static asset files. It recognized DB, ASSETS, variables, and generated Vite deployment configuration. The checked-in D1 UUID remains a **local placeholder**; production setup must replace it.

Rollup reported non-fatal annotation warnings in upstream Zod source comments. Both production outputs completed successfully. Installed migration tooling still includes the upstream deprecated esbuild-kit packages, but their affected esbuild dependency is overridden to a patched release and the final audit is clean. `minimatch` is also overridden to a patched release. Tests and builds passed with those overrides.

## Resource measurements and limits of the measurement

The local D1 fixture inserted five real-format checks through the actual transaction triggers. In that isolated single-monitor, no-external-channel sample, returned metadata reported **10–22 rows written** and **6–15 rows read** per check insertion. Local SQL duration was 0–1 ms; Node-to-local-D1 wall time was approximately 14–17 ms. See the saved JSON for each sample and timestamp.

Those measurements exclude scheduler claim costs, cleanup, provider delivery, authentication, real DNS/HTTP probing, browser query load, larger database behavior, and Cloudflare production accounting. **Local wall-clock time is not Worker CPU time.** The 10 ms free CPU envelope has not been validated on the deployed edge. The default ten active monitors is a conservative throughput cap, not a guarantee of quota compliance. Follow `DEPLOYMENT.md` to observe actual Worker CPU outcomes and billable D1 metrics before admitting more load.

## Still requires external configuration or live verification

- Create a free Cloudflare account and real D1 database; replace the placeholder ID; apply remote migrations; deploy to a workers.dev URL. Deployment was intentionally not performed.
- Configure the exact production APP_URL, GitHub OAuth app, callback URL and production secrets. OAuth initiation, session validation, expiry and logout passed locally; **a real GitHub callback/token exchange and human login were not performed**.
- Approve exact public hostnames whose DNS operator you trust. Automated proof of domain ownership is not implemented. DNS validation does not pin Workers fetch resolution, so the operator allowlist remains essential.
- Configure a real Discord webhook and channel encryption key, then confirm actual Discord receipt. Delivery formatting, encryption, status/retry behavior and idempotent enqueueing were tested with controlled provider responses. Crash-window duplicate Discord receipt remains possible because the provider has no idempotency key.
- Optionally configure Resend and a verified sender/domain, then confirm actual email receipt. No live email account/domain was available; no email was sent. Email is not required for the core app, invitations, or the demo.
- Verify Cron propagation, real public endpoint checks, a controlled outage/recovery drill, secure cookies on HTTPS, and per-invocation CPU/D1 usage on the actual free deployment.
- CI configuration is included but **GitHub-hosted CI itself was not run** because the workspace was not pushed to a repository.

The project is locally implemented and validated, and prepared for deployment. It is **not represented as production-certified or live production-ready** before the configuration and edge/provider verification above.
