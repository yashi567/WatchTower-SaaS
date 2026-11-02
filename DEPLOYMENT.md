# Deploy WatchTower to Cloudflare Free

This repository has not been deployed. These instructions use your own Cloudflare account and an HTTPS `workers.dev` hostname. No purchased domain, always-on server, or paid integration is required. The deployment commands below are deliberate actions for the operator; local development and CI never run them.

## 1. Create a free account and Workers subdomain

Create an account at https://dash.cloudflare.com/sign-up. Keep **Workers Free** selected. In **Workers & Pages**, choose your account's workers.dev subdomain if prompted. D1 is available on Free. Do not enable Workers Paid or subscribe to a paid integration.

Use Node.js 22.12+ and install the locked dependencies:

```sh
npm ci
npx wrangler login
npx wrangler whoami
```

Wrangler login opens an authorization page. Select the intended free account. If you have multiple accounts, set `account_id` in `wrangler.jsonc` to the one shown by `whoami`.

## 2. Create the D1 database

```sh
npx wrangler d1 create watchtower
```

Copy the returned UUID into `d1_databases[0].database_id` in `wrangler.jsonc`. Preserve the binding **DB** and `migrations_dir: "migrations"`. The checked-in placeholder UUID is for local development; it is not a real database. No data is uploaded by this step.

## 3. Configure the production origin and capacity

Choose the Worker name before OAuth setup, for example `watchtower-yourname`. In `wrangler.jsonc` set:

```jsonc
{
  "name": "watchtower-yourname",
  "vars": {
    "APP_URL": "https://watchtower-yourname.YOUR-SUBDOMAIN.workers.dev",
    "ENVIRONMENT": "production",
    "MAX_WORKSPACE_MONITORS": "5",
    "MAX_GLOBAL_MONITORS": "10",
    "CHECK_BATCH_SIZE": "2",
    "APPROVED_MONITOR_HOSTS": "api.your-public-host.example"
  }
}
```

Merge these fields into the existing configuration; retain assets, bindings, triggers, and compatibility settings. Approve only exact public hostnames whose DNS administration you control or trust. Use no wildcard. An empty allowlist deliberately prevents monitor creation. The example hostname must be replaced by your actual endpoint. Prefer an HTTPS health endpoint that returns a quick, small 2xx response and does not redirect.

The deployment cap is also bounded by `min(CHECK_BATCH_SIZE, 2) × 5`. Setting a larger global cap will not admit more than that throughput envelope. Set lower caps if your production CPU measurements require it. An increase is never a promise of free-tier capacity.

For local use after production configuration, override `APP_URL=http://localhost:5173` and approved hosts in ignored `.dev.vars`. Use a separate GitHub OAuth application locally.

## 4. Apply production migrations

```sh
npm run db:migrate:remote
```

Read Wrangler's database/account confirmation before proceeding. This applies all SQL files from `migrations/`, including the generated base schema and handwritten transaction/security triggers. Do not run only the generated migration. Future schema changes use `npm run db:generate`; assign a new monotonic migration number beyond existing SQL files and inspect generated changes and custom triggers before remote execution. Back up important data and review D1 Time Travel before destructive schema changes.

## 5. Configure GitHub OAuth

In GitHub, open **Settings → Developer settings → OAuth Apps → New OAuth App**. Use an OAuth App, not a GitHub App unless you deliberately configure its additional permissions.

| Setting | Production value |
| --- | --- |
| Application name | WatchTower |
| Homepage URL | `https://watchtower-yourname.YOUR-SUBDOMAIN.workers.dev` |
| Authorization callback URL | `https://watchtower-yourname.YOUR-SUBDOMAIN.workers.dev/api/auth/callback/github` |

Copy the client ID and generate a client secret. WatchTower requests `user:email` for GitHub email access. For a GitHub App, additionally grant **Email addresses: Read-only**. GitHub OAuth Apps allow one callback URL, so use a **separate local OAuth App** with homepage `http://localhost:5173` and callback `http://localhost:5173/api/auth/callback/github`.

## 6. Add production secrets

Generate two independent random values. The first is a session/OAuth encryption secret; the second is needed only if you want external alert channels:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store these privately. Enter the values through Wrangler's interactive secret prompts; do not add them to source, command history arguments, screenshots, or `wrangler.jsonc`:

```sh
npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
# Optional external channel support:
npx wrangler secret put CHANNEL_ENCRYPTION_KEY
```

The auth secret must be at least 32 characters. The channel key must decode to exactly 32 bytes. Reuse the same values across deployments until deliberately rotating them. Channel-key rotation without re-encryption makes stored destinations unreadable.

If Wrangler requires the Worker to exist before storing secrets, perform the first deployment without secrets, then set them and redeploy. The unauthenticated demo still works, and protected APIs return a setup error until OAuth is configured; there is no fallback login.

## 7. Build and deploy the Worker with Static Assets

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx wrangler deploy
```

After the first deployment, `npm run deploy` combines the last build/deploy steps. The official Cloudflare Vite plugin emits the Worker bundle, static browser assets and Wrangler deployment metadata in `dist/`. Wrangler consumes the generated deployment configuration; do not replace the Worker entrypoint with the browser's `index.html`.

Check the returned URL. If the actual workers.dev hostname differs, update `APP_URL` and the GitHub homepage/callback to the exact same HTTPS origin, then rebuild and deploy. A custom domain is optional and not used by this project.

## 8. Load the public synthetic demo

The local seed prepares a fresh, timestamped SQL file and changes only local synthetic data:

```sh
npm run db:migrate:local
npm run db:seed
```

After reviewing the target account/database, deliberately import that generated demo SQL into remote D1:

```sh
npx wrangler d1 execute DB --remote --file=.wrangler/demo.sql
```

This replaces **only organization `demo`**, which is reserved for synthetic data, and creates `/demo` and `/status/acme` content. It does not create real users or sessions. Do not rename real workspaces to the reserved organization ID. The application creates random IDs for real organizations.

## 9. Verify Cron and real monitoring

The checked-in trigger is `* * * * *`: one scheduled invocation per minute, up to two due checks, then one queued external delivery and bounded cleanup. Deployment publishes the trigger. Confirm it under **Worker → Settings → Triggers / Cron Triggers**. Changes may take several minutes to propagate. Do not create a separate paid scheduler.

Sign in through GitHub, create a workspace, and add an approved endpoint. A new monitor should move from pending to operational after a scheduled check. Use **Check now** to queue a check, respecting the five-minute manual rate limit; it is processed by Cron, not synchronously by the browser.

```sh
npx wrangler tail
```

Look for `scheduled_complete` events containing `claimed`, `stored`, `sent`, and `failed`. A successful scheduled log alone does not prove the destination check succeeded: inspect the monitor's actual persisted HTTP status and check history.

To test incidents deterministically in production, use an approved endpoint you own with a controllable `/health` response. Return 503 for the configured number of scheduled failures, confirm a single investigating incident and notification, then return 200 for the configured number of recoveries. Confirm resolution and the recovery timeline event. Never use an unrelated website outage as a deterministic test.

Local Cron testing uses `npm run check:scheduled` while `npm run dev` is running. The Local Explorer API is development-only. There is no public `/api/run-cron` production bypass.

## 10. Configure Discord (optional)

In your Discord server, create a webhook under **Server Settings → Integrations → Webhooks**. Copy its canonical `https://discord.com/api/webhooks/...` URL. Do not share it in source or issues. Set `CHANNEL_ENCRYPTION_KEY` first, then in WatchTower **Settings → Alert delivery → Add channel**, select Discord and paste the URL. The browser sends it once to the authenticated API for encryption; later API responses contain only metadata.

Choose **Send test notification** for that channel. The operation queues delivery; it does not claim immediate success. Wait for Cron, then verify both the actual Discord message and **Delivery history → delivered**. HTTP 429/5xx/network failures retry with backoff up to four attempts; permanent errors are recorded as failed. Disabled channels do not send. Recreate a failed/misconfigured channel and send a new test after fixing it.

Discord has no provider idempotency key, so crash-window duplicates remain possible. Database event/outbox idempotency is enforced, but exactly-once delivery is not claimed.

## 11. Configure Resend (optional)

The core app and Discord do not require email. If you want transactional email, create a Resend account, verify a sending domain under Resend's current requirements, and create a scoped API key. A free workers.dev hostname is not a domain you control for arbitrary DNS verification. Do not purchase a domain merely to run the core project.

```sh
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
```

Use a verified sender such as `WatchTower <alerts@your-verified-domain.example>`, then redeploy if needed. Email becomes selectable in Settings only when the server has both values. Provider testing addresses, if available on your account, may restrict recipients; verify current Resend requirements. Send a test and inspect delivery history and the actual inbox. The email integration was tested with mocked provider responses locally, not with a live account.

## 12. Verify the live application

1. Open `/`, `/demo`, `/demo/monitors`, `/demo/analytics`, and `/status/acme` without signing in. Synthetic data must be labeled.
2. Check `/api/health` reports `status: ok` and `authConfigured: true` after setup.
3. Complete GitHub OAuth, create a workspace, reload, and verify the session persists. Inspect cookies for HttpOnly, Secure and SameSite attributes; sign out and confirm protected API access stops.
4. Create/edit/pause/resume a monitor and observe real persisted scheduled measurements. Confirm missing historical windows show unavailable data.
5. Exercise the controllable endpoint outage/recovery sequence and check timeline, notifications and delivery history.
6. Invite a second GitHub identity, verify email binding, read-only viewer behavior, and workspace switching. Test wrong-workspace IDs return 404.
7. Publish a status page. Fetch its public JSON and confirm no endpoint URL, private error, internal description, channel destination, or member email appears. Unpublish and confirm 404.
8. Check mobile navigation, light/dark appearance, keyboard dialogs, and browser/network console for errors.

## 13. Measure free-tier usage before increasing capacity

In Cloudflare, inspect **Worker → Metrics** (CPU time, invocation outcome, errors, request count) and **D1 → Metrics → Row Metrics** (rows read/written, storage). Observe a representative day including failed checks, incident creation, external delivery, authentication and dashboard polling. Index updates and trigger operations count toward writes. Use actual billable metrics; local wall-clock test duration is not Worker CPU time.

Defaults imply at most 2,880 check jobs/day plus 1,440 Cron invocations/day. Do not infer D1 writes directly from the number of checks. A one-check transaction also updates scheduling, multiple aggregates and indexes, and sometimes incidents, events and delivery records. The 10 ms free CPU limit applies to Cron as well as HTTP. If invocations hit Error 1102, reduce batch size/capacity and polling/traffic, profile the actual hot path, and retest. The app does not automatically upgrade plans or provision paid resources.

Current source references: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Cloudflare Vite integration](https://developers.cloudflare.com/workers/vite-plugin/tutorial/), [Better Auth GitHub](https://better-auth.com/docs/authentication/github). Recheck these before deploying later.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Demo is empty | Apply migrations and import the demo SQL into the same local/remote D1 binding used by the Worker |
| GitHub button unavailable | Secret length and all OAuth values; health endpoint; correct Worker/account; restart dev after `.dev.vars` changes |
| Origin not permitted | Exact `APP_URL`; use `localhost:5173` locally rather than mixing `127.0.0.1` and localhost; no unexpected proxy origin |
| OAuth callback fails | Exact GitHub callback `/api/auth/callback/github`, matching HTTPS origin, correct local/production OAuth app, GitHub email permission |
| No checks arrive locally | Invoke `npm run check:scheduled`; keep Vite running; ensure hostname approval; next_check/lease and no paused state |
| No checks arrive remotely | Cron trigger published, propagation delay, due jobs, `wrangler tail`, Worker CPU outcomes, D1 quota |
| Hostname needs approval | Add the exact hostname to `APPROVED_MONITOR_HOSTS` only after reviewing DNS trust; redeploy |
| Endpoint returns redirect | Monitor the approved final URL; unchecked redirects are deliberately not followed |
| Status becomes unknown | Scheduler or destination data is stale; inspect Cron/quota/claims rather than showing invented uptime |
| Capacity error | Pause/delete an active monitor, or lower workload; verify workspace and global caps; don't assume a paid upgrade is needed |
| Delivery pending | Cron runs once/minute and sends one queued item; channel enabled; retry timestamp and lease; provider config |
| Delivery failed | Invalid webhook/key/sender, permanent provider rejection, or four failed attempts; inspect sanitized history and provider account |
| Production assets missing | Rebuild with official Vite plugin; use generated Wrangler config; preserve Static Assets SPA fallback |
| Database schema missing | Apply all migrations to the actual selected D1 database, not just local storage or the generated base SQL |
| Build cannot write configuration locally | Grant tooling access to its normal local configuration/cache directories; this does not require cloud deployment |

Cloud credentials, live OAuth authorization, real Discord/email delivery, production CPU/row accounting, and a live outage/recovery drill remain operator setup and verification tasks. Passing local tests does not certify production capacity or availability.
