# Security model

Report suspected security issues privately to the repository maintainer using GitHub private vulnerability reporting when enabled. Do not include session cookies, OAuth secrets, webhook tokens, or customer endpoint credentials in public issues.

## Identity and tenancy

Better Auth handles GitHub OAuth state, signed sessions, expiry and logout using the Drizzle D1 adapter. Production HTTPS enables Secure cookies; session cookies are HttpOnly and use Better Auth's SameSite protections. OAuth tokens are encrypted with the authentication secret. Production write APIs always authenticate and verify a workspace membership from D1; a caller-provided ID never establishes access. Permission checks are server-side. Viewer is read-only; member operates monitors/incidents; admin manages operational configuration and non-admin members; owner additionally manages ownership and workspace lifecycle. No debug-login route, hardcoded user, environment auth bypass, or demo-to-production write path exists.

Invitation tokens have 72 random UUID characters, are stored only as SHA-256 digests, expire after seven days, are email-bound to the signed-in GitHub identity, and are consumed atomically. Admins cannot invite/manage admins or owners. A partial unique index limits each workspace to one owner. Transfers demote the current owner and promote an existing member in a D1 transaction.

## Browser boundary

All state-changing API requests require `Origin` to match `APP_URL` and `Content-Type: application/json`; requests without an origin are rejected. Same-origin deployment avoids permissive CORS. React renders text rather than untrusted HTML. Static assets have CSP, anti-framing, content-type and referrer headers; API routes use Hono security headers. Zod validates bounded inputs; Hono limits request bodies to 32 KB. Queries bind values and whitelist sort fragments.

## Outbound monitoring and SSRF

Monitoring is **not** a general URL-fetching API. Only deployment-operator-approved **exact** DNS hostnames are allowed. The operator must control or trust the endpoint and its DNS administration. This is an explicit trust restriction, not an automated ownership verification feature.

- Only HTTP/HTTPS and standard ports. HTTPS is preferred.
- Reject embedded credentials, fragments, IP literals (including alternate IPv4 forms canonicalized by `URL`), loopback/internal names, trailing dots, and unsafe hostname syntax.
- Validate A and AAAA records through Cloudflare DNS-over-HTTPS before each probe. Reject private, loopback, link-local, shared, documentation, metadata, multicast and reserved addresses conservatively; IPv6 is limited to global-unicast forms with excluded special ranges.
- Reject mixed public/non-public DNS answers, empty answers, DNS errors, and unexpected record types.
- No redirects are followed. Configure the final URL explicitly. No arbitrary request headers, POST bodies, cookies, customer credentials, or proxy responses are supported.
- Use bounded DNS/HTTP timeouts, two concurrent probes at most, and cancel bodies immediately after headers.

**Residual limitation:** Workers fetch performs its own DNS resolution; the DoH validation does not pin the connected IP. DNS rebinding and changes between validation and connection cannot be eliminated by these checks. The exact allowlist of trusted DNS operators is therefore essential. Do not approve arbitrary tenant-controlled domains. A public multi-tenant service that accepts untrusted DNS administrators would need a separately enforced egress boundary or a platform-supported pinned-resolution mechanism before expanding this model.

## Secret handling and notification delivery

Discord destinations are restricted to canonical HTTPS `discord.com/api/webhooks/<id>/<token>` URLs. They are encrypted with AES-256-GCM, random nonces and a separate encryption key before storage. Responses expose only channel metadata. Resend is optional, uses a server-only API key and verified sender, and is disabled when configuration is absent. Discord mentions are suppressed. Logs do not include decrypted destinations or provider response bodies.

Durable event keys and `(notification_id, channel_id)` uniqueness deduplicate outbox inserts. Delivery claims have leases, a four-attempt budget, exponential backoff for network/429/5xx errors, and permanent failure for other HTTP errors. There is **no exactly-once guarantee for Discord**: a crash after Discord accepts a request but before D1 records success can lead to a retry. Resend receives an idempotency key. Delivery history reports failed/pending/delivered explicitly.

Changing `CHANNEL_ENCRYPTION_KEY` makes existing destinations unreadable. Recreate channels or implement an offline re-encryption procedure. Rotating `BETTER_AUTH_SECRET` invalidates sessions and encrypted OAuth tokens; revoke/reconnect provider accounts as appropriate. Keep keys in `.dev.vars` locally and Wrangler secrets in production. Never commit either.

## Public data

Public status endpoints use an explicit projection: page title/description/accent, selected service names/statuses/availability, and incident titles/severities/timestamps. They omit endpoint URLs, organization IDs, raw error messages, internal incident descriptions/events, user emails, and channel configuration. Administrators are responsible for the text they deliberately publish. Unpublished pages return 404. The public demo reads only its synthetic organization; its capacity response never exposes deployment configuration.

## Operational limits

Rate limits apply to monitor creation, manual checks, edits/state changes, incident creation, invitations, workspace creation, channel tests, generic operational writes, and Better Auth endpoints. These D1-backed limits are not a replacement for Cloudflare abuse protection. Quotas include index and trigger work. Authentication, public traffic, and multi-workspace activity can exhaust the free plan; a monitor count alone cannot prevent every platform limit. Keep the Cloudflare account on Free, observe CPU/row usage, restrict operator-approved hostnames, and lower capacity before considering increases.

Integration tests exercise horizontal privilege escalation, wrong-workspace resource IDs, viewer writes, member administration, signed/forged/expired sessions, CSRF origins, unsafe URLs, lease overlap, incident duplication, public-field leakage, and outbox retries. See `docs/VERIFICATION.md` for remaining live verification tasks.
