# Engineering decisions

## One origin, one deployment

The official Cloudflare Vite plugin builds React static assets and an ES module Worker. Only `/api/*` runs Worker-first; browser routes use Static Assets SPA fallback. Hono owns JSON endpoints, and Better Auth owns `/api/auth/*`. Same-origin cookies avoid permissive CORS and simplify CSRF protection. The application uses no SSR, websocket server, Redis, paid queue, or continuously running process.

## Drizzle plus explicit D1 SQL

Drizzle defines the normalized schema, creates the base migration, and powers Better Auth's adapter. Operational queries use bound D1 SQL because conditional claims, `INSERT ... SELECT`, partial unique indexes, window functions, and transaction triggers need explicit atomic behavior. This is intentional: API reads, database coordination, and browser code have separate modules. Do not replace atomic SQL with a read/modify/write sequence.

There are four initial migrations: the generated relational schema; transactional measurement/incident/outbox invariants; additional configuration, tenant and preference safeguards; and scheduling/retention query indexes. Drizzle's journal tracks its generated schema, while D1 tracks all migration filenames. Future generated migrations must receive a unique monotonic SQL filename and preserve/review handwritten triggers. Test the complete migration set against a fresh local D1 database before remote changes.

## Bounded scheduling and commit point

Every minute, an atomic `UPDATE ... WHERE id IN (SELECT ... LIMIT 2) ... RETURNING *` claims due, non-demo monitors for 90 seconds. Other invocations cannot claim the same live lease. A token identifies the invocation; a check ID combines token and monitor ID. Probes run concurrently with at most two active jobs. Each uses A/AAAA lookups and one HTTP request; response bodies are cancelled. Operators approve exact hostnames with trusted DNS; DNS validation alone cannot pin Workers fetch resolution.

A measurement commits only if its monitor still has the matching token, an unexpired lease, and a non-paused state. A single check insertion triggers counter/state updates, next scheduling, hourly/daily aggregate upserts, incident opening/recovery, timeline events, notifications, and delivery enqueueing inside the same SQLite transaction. Successful insertion releases the claim in that transaction. A crash before commit leaves an expiring lease; a crash during commit rolls back; a duplicate/superseded completion cannot commit.

This avoids a cross-request transaction API and keeps JS coordination small. It shifts work to indexed SQLite operations, but does not eliminate D1 row charges or guarantee the free CPU allowance. Edits/pause/resume invalidate in-flight tokens. A queued manual check only changes `next_check` and respects scheduling/rate limits.

## Incidents

A partial unique index on monitor ID for `source='system' AND status!='resolved'` is the final duplicate-incident defense. A failure below threshold is degraded; enough consecutive failures become down. Recovering down stays down until enough consecutive successes. Auto recovery closes system incidents only and records an explicit recovery event. Human updates use an optimistic conditional insert/update transaction so competing updates cannot silently overwrite one another.

`investigating → identified → monitoring → resolved` is the usual lifecycle. Investigating and identified may resolve directly; monitoring may return to identified if a fix fails. Resolved incidents cannot reopen. Manual incidents use the same timeline and permissions but never auto-resolve.

## Analytics and honest missing data

Measurements are the source of truth. Every real check updates hour and day buckets. Availability uses completed-check counts; there is no invented success for missed intervals. Summary and chart aggregates are computed server-side. Exact nearest-rank percentiles use SQLite row-number/count windows over raw samples and require at least 20 checks. No percentile is fabricated from aggregated means. Retention is 7 days raw, 30 days hourly, and 90 days daily. Windows are UTC bucket-aligned and may include a partial first bucket. Response graphs show only collected buckets, not a fabricated backfill.

The synthetic seed is a curated illustration, not a statistically exact reconstruction: its raw, hourly, and daily views are marked synthetic and may differ. Real accounts always use the transactional measurement pipeline. The demo organization is excluded from monitoring and inaccessible to production write APIs.

Demo filters are anchored to its saved measurement timestamp. Cleanup preserves this small synthetic snapshot so a recruiter demo does not silently expire after seven days. Its timestamps remain the actual seed timestamps; it is never labeled as a live check. Real workspace windows and retention use current time.

## Notifications and external consistency

Notification event keys deduplicate logical events. A trigger creates one delivery per enabled workspace channel, enforced by a composite unique constraint. One delivery is claimed per Cron invocation for 60 seconds. Network/429/5xx failures retry with backoff; permanent rejections fail immediately; four attempts is the budget, including interrupted attempts. In-app read state is per member. A disabled in-app preference automatically marks future updates read while retaining history; workspace external channels remain independent.

Delivery to Discord cannot be exactly once without provider idempotency. A provider acceptance followed by a crash before the D1 success update can be retried. Resend receives a stable delivery ID as an idempotency key. Secrets are AES-GCM encrypted at rest and never appear in read responses. Test notifications target only the selected channel.

## Capacity and cleanup

Insert/resume capacity checks execute inside a conditional SQL mutation, avoiding race-prone check-then-insert admission. Defaults are five active monitors/workspace, ten/deployment, 20 total monitors/workspace, 20 members/workspace, three channels/workspace, and three status pages/workspace. The global active cap is also clamped by two checks/minute and the five-minute minimum interval. Deleting or pausing frees active capacity. The public demo does not consume scheduler capacity.

Cron cleanup uses limited deletes, keeping invocations bounded and repeatable. Indexes cover due jobs, tenant/status lists, check time ranges, aggregate keys, incident history, events, delivery due times, notifications and audit history. API pages have fixed small page sizes and whitelisted ordering. Active browser polling is once/minute. Expired sessions, verification records, old rate limits and invitations are also cleaned. Incident history persists until workspace deletion; watch storage growth if operating for extended periods.

Ten active monitors produce up to 2,880 checks/day. That is not the number of D1 rows written: indexes, scheduling updates, two aggregate levels, notifications and retention add work. The repository documents remote measurement before capacity expansion instead of claiming unmeasured CPU or quota guarantees.

## Verification boundaries

Unit tests exercise safety predicates and state logic. Integration tests use actual Miniflare/workerd D1 with all migrations and real Better Auth signed sessions; only external service boundaries are controlled. A separate local HTTP fixture tests real GET/HEAD requests, failure statuses and timeouts without relying on third-party uptime. Playwright uses the running seeded app on desktop and mobile Chromium. Live OAuth callback exchange, external Discord/email receipt, geographic edge behavior, and billable CPU/D1 accounting require a configured deployment.
