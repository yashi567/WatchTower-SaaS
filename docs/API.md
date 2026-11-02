# API contracts

All application endpoints use JSON on the same origin. Successful application responses are `{ "data": ... }`, with paginated lists adding `{ "meta": { "page", "pageSize", "total" } }`. Check history omits expensive total counts and exposes whether another full page exists through its returned item count. Better Auth endpoints follow Better Auth's own response contracts. Errors are `{ "error": { "code", "message", "issues"?, "reference"? } }` with appropriate 4xx/5xx statuses. Production responses never include stack traces.

Protected routes require the Better Auth session cookie. Operational routes additionally require `X-Workspace-Id` matching a real membership. Workspace subresource path IDs must match that selection. Every mutation requires the exact `APP_URL` Origin and `Content-Type: application/json`. A missing/wrong session, wrong tenant, disallowed role, invalid input, capacity conflict, and rate limit return 401, 404, 403, 422, 409, and 429 respectively. Auth not configured returns 503. Payloads larger than 32 KB return 413.

## Public routes

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/health` | Database connectivity, version, and auth configuration boolean |
| GET/POST | `/api/auth/*` | Better Auth GitHub sign-in/callback/session/sign-out endpoints |
| GET | `/api/public/status/:slug` | Published selected-service summaries only; 404 for draft/missing |
| GET | `/api/demo/...` | Read routes below, scoped to synthetic organization; all other methods denied |

Demo capacity data is a labeled synthetic configuration; it never exposes real deployment hostnames or provider setup. No public endpoint can create a real measurement or mutate a real organization.

## Workspaces and members

| Method | Path | Permission / body |
| --- | --- | --- |
| GET | `/api/workspaces` | Authenticated user's memberships |
| POST | `/api/workspaces` | Authenticated; `{name}`; creates owner membership |
| PATCH | `/api/workspaces/:id` | Owner; `{name}` |
| DELETE | `/api/workspaces/:id` | Owner; `{confirmation:"DELETE"}`; cascades workspace data |
| GET | `/api/workspaces/:id/members` | Member of workspace |
| PATCH | `/api/workspaces/:id/members/:userId` | Owner/admin within role boundaries; `{role}` |
| DELETE | `/api/workspaces/:id/members/:userId` | Owner/admin within role boundaries; cannot remove owner |
| GET/POST | `/api/workspaces/:id/invitations` | Owner/admin; POST `{email,role}` returns expiring share link |
| DELETE | `/api/workspaces/:id/invitations/:invitationId` | Owner/admin; revoke |
| POST | `/api/workspaces/accept-invitation` | Authenticated matching email; `{token}` |
| POST | `/api/workspaces/:id/transfer` | Owner; `{userId}` of existing member |
| PATCH | `/api/workspaces/:id/preferences` | Self; `{notifications:boolean}` |

An admin cannot assign/invite/manage another admin or an owner. Only an owner can transfer ownership. Tokens are hashed in storage and cannot be recovered from invitation listings.

## Operational reads

| Path (GET) | Queries / response |
| --- | --- |
| `/api/monitors` | `q`, `status`, `sort=name|latency|uptime|recent`, `page`; 20/page |
| `/api/monitors/:id` | Configuration and current measured state; no lease tokens |
| `/api/monitors/:id/checks` | `page`; 25 raw checks/page, newest first |
| `/api/monitors/:id/analytics` | `range=24h|7d|30d|90d` |
| `/api/checks/recent` | Eight latest workspace measurements |
| `/api/analytics/overview` | `range`, optional `monitorId`; summaries, series, services |
| `/api/incidents` | `status=active|resolved|all`, optional `monitorId`, `page`; 20/page |
| `/api/incidents/:id` | Incident and ordered timeline, internal errors for authorized members |
| `/api/notifications` | `page`; 20/page and unread count for current member |
| `/api/notification-channels` | Channel metadata only |
| `/api/notification-deliveries` | Last 30 sanitized delivery records |
| `/api/status-pages` | Workspace pages and ordered monitor IDs |
| `/api/audit-logs` | Last 30 operations |
| `/api/capacity` | Effective active limits, approved hosts, provider setup booleans |

Analytics missing values are `null`, not fabricated zero uptime/latency. Current stale status is derived at read time. Raw measurements contain `synthetic=0` for real probes; the seed uses `1`.

## Operational writes

Member/admin/owner can operate monitors and incidents. Admin/owner manage status pages and delivery channels. Viewer cannot mutate operational data. Self notification reads/preferences are allowed for any real membership.

```json
{
  "name": "Production API",
  "url": "https://api.your-approved-host.example/health",
  "method": "GET",
  "interval": 300,
  "timeout": 8000,
  "expectedMin": 200,
  "expectedMax": 299,
  "failureThreshold": 3,
  "recoveryThreshold": 2,
  "tags": ["production", "api"],
  "alerts": true
}
```

| Method | Path | Body / behavior |
| --- | --- | --- |
| POST | `/api/monitors` | Monitor configuration above; 201, atomic capacity admission |
| PUT | `/api/monitors/:id` | Full validated configuration; invalidates in-flight claim |
| PATCH | `/api/monitors/:id/state` | `{paused:boolean}`; resuming checks capacity |
| POST | `/api/monitors/:id/check` | `{}`; 202 queued, at most once/5 minutes/monitor |
| DELETE | `/api/monitors/:id` | `{}`; closes related open incidents, deletes measurements |
| POST | `/api/incidents` | `{title,description,severity,monitorId?}`; 201 manual incident |
| PATCH | `/api/incidents/:id` | `{status,message}`; validates lifecycle and optimistic update |
| POST | `/api/notifications/read` | `{}` marks all read, or `{id}` marks one; current member only |
| POST | `/api/notification-channels` | `{name,kind:"discord"|"email",destination,enabled}`; encrypts secret |
| PATCH | `/api/notification-channels/:id` | `{enabled:boolean}` |
| DELETE | `/api/notification-channels/:id` | `{}` |
| POST | `/api/notification-channels/:id/test` | `{}`; 202 queued only for selected enabled channel |
| POST | `/api/status-pages` | `{title,slug,description,published,accent,monitorIds}` |
| PUT | `/api/status-pages/:id` | Full page body; monitorIds order defines public order |
| DELETE | `/api/status-pages/:id` | `{}` |

Intervals: 300/600/900/1800/3600 seconds. Timeouts: 1–10 seconds. Failure/recovery thresholds: 1–5 consecutive checks. Monitor tags: at most five. Public page accents: indigo/emerald/blue. Page slugs use lowercase alphanumerics separated by single hyphens. All referenced monitor IDs are tenant-checked before mutation and by database triggers where practical.

No endpoint returns an arbitrary fetched body. Manual checks enter the scheduler instead of bypassing limits or URL safety. There is no remote Cron-testing HTTP endpoint.
