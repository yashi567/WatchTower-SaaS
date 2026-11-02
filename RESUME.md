# WatchTower — API Monitoring & Incident Management

**Description:** Built a full-stack TypeScript monitoring platform with scheduled HTTP checks, workspace-scoped incident response, availability analytics, and public status pages on Cloudflare Workers and D1.

## Resume bullets

- Engineered a serverless HTTP monitoring pipeline with atomic D1 job claims, expiring leases, transactional state transitions, hourly/daily aggregates, and automatic incident recovery without an always-on backend.
- Implemented GitHub OAuth with Better Auth, cookie sessions, four-role workspace authorization, email-bound expiring invitations, tenant-scoped APIs, AES-GCM encrypted alert destinations, and restricted outbound URL validation.
- Built a responsive React operations console with server-side analytics, interactive Recharts visualizations, public status pages, a separate read-only synthetic demo, and automated unit, D1 integration, HTTP fixture, UI, and desktop/mobile browser tests.

Do not add production uptime, users, throughput, latency improvement, or financial savings claims without actual deployment measurements. The checked-in verification report records only tests performed in the build environment.

## Technologies

TypeScript, React, Vite, Tailwind CSS, Radix/shadcn-style components, React Router, TanStack Query, React Hook Form, Zod, Recharts, Hono, Cloudflare Workers, Cron Triggers, D1/SQLite, Drizzle ORM, Better Auth, GitHub OAuth, Discord webhooks, optional Resend, Vitest, React Testing Library, Miniflare/workerd, Playwright, GitHub Actions.

## Interview discussion points

1. Why a single conditional check insertion is the commit point, and how SQLite triggers keep measurements, aggregates, incidents and the notification outbox consistent.
2. How atomic claims, lease expiry, token validation and unique active-incident indexes handle overlapping scheduled invocations and interrupted work.
3. Why exact hostname approval is necessary in addition to DNS validation when Workers fetch cannot pin the connected IP, and what would be needed to accept untrusted DNS operators.
4. Why measured-check availability is not a time-weighted uptime SLA, why missing intervals are excluded, and why aggregate means cannot reconstruct p95.
5. Why provider delivery cannot be exactly once without provider idempotency, and how an outbox, leases, retry budget and delivery history constrain failures.
6. How per-workspace and deployment capacity admission is atomic, and why a ten-monitor cap still cannot guarantee a 10 ms CPU allowance or D1 daily quotas.
7. Why Drizzle handles schema/auth persistence while operational coordination uses explicit parameterized D1 SQL.
8. How the demo remains accessible without OAuth while being unable to authorize production writes or consume real monitor capacity.
9. Which parts were verified locally and which require a real deployment: live OAuth callback exchange, actual provider receipt, edge behavior, CPU accounting and an outage/recovery drill.
