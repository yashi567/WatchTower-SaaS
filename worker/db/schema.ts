import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user").on(t.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("account_user").on(t.userId),
    uniqueIndex("account_provider").on(t.providerId, t.accountId),
  ],
);
export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("verification_identifier").on(t.identifier)],
);
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  synthetic: integer("synthetic").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const memberships = sqliteTable(
  "memberships",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "admin", "member", "viewer"],
    }).notNull(),
    notifications: integer("notifications").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index("memberships_user").on(t.userId),
  ],
);
export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    acceptedAt: integer("accepted_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("invitations_org").on(t.organizationId)],
);
export const monitors = sqliteTable(
  "monitors",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    method: text("method").notNull().default("GET"),
    interval: integer("interval").notNull().default(300),
    timeout: integer("timeout").notNull().default(8000),
    expectedMin: integer("expected_min").notNull().default(200),
    expectedMax: integer("expected_max").notNull().default(299),
    failureThreshold: integer("failure_threshold").notNull().default(3),
    recoveryThreshold: integer("recovery_threshold").notNull().default(2),
    tags: text("tags").notNull().default("[]"),
    alerts: integer("alerts").notNull().default(1),
    status: text("status").notNull().default("pending"),
    successes: integer("successes").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    lastChecked: integer("last_checked"),
    latency: real("latency"),
    lastError: text("last_error"),
    nextCheck: integer("next_check").notNull(),
    claimToken: text("claim_token"),
    claimUntil: integer("claim_until"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("monitors_org_status").on(t.organizationId, t.status),
    index("monitors_due").on(t.nextCheck, t.claimUntil),
  ],
);
export const checks = sqliteTable(
  "monitor_checks",
  {
    id: text("id").primaryKey(),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    checkedAt: integer("checked_at").notNull(),
    success: integer("success").notNull(),
    statusCode: integer("status_code"),
    latency: real("latency").notNull(),
    error: text("error"),
    synthetic: integer("synthetic").notNull().default(0),
  },
  (t) => [
    index("checks_monitor_time").on(t.monitorId, t.checkedAt),
    index("checks_retention").on(t.checkedAt),
  ],
);
export const aggregates = sqliteTable(
  "monitor_aggregates",
  {
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    bucket: integer("bucket").notNull(),
    total: integer("total").notNull(),
    successful: integer("successful").notNull(),
    latencySum: real("latency_sum").notNull(),
    latencyMin: real("latency_min").notNull(),
    latencyMax: real("latency_max").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.monitorId, t.period, t.bucket] }),
    index("aggregates_retention").on(t.period, t.bucket),
  ],
);
export const incidents = sqliteTable(
  "incidents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id").references(() => monitors.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    severity: text("severity").notNull(),
    status: text("status").notNull(),
    source: text("source").notNull(),
    startedAt: integer("started_at").notNull(),
    resolvedAt: integer("resolved_at"),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    updatedBy: text("updated_by").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("incidents_org_time").on(t.organizationId, t.startedAt),
    index("incidents_monitor").on(t.monitorId, t.status),
  ],
);
export const incidentEvents = sqliteTable(
  "incident_events",
  {
    id: text("id").primaryKey(),
    incidentId: text("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    message: text("message").notNull(),
    createdAt: integer("created_at").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
  },
  (t) => [index("events_incident").on(t.incidentId, t.createdAt)],
);
export const channels = sqliteTable(
  "notification_channels",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    encryptedDestination: text("encrypted_destination").notNull(),
    enabled: integer("enabled").notNull().default(1),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("channels_org").on(t.organizationId)],
);
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    eventKey: text("event_key").notNull().unique(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    link: text("link").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("notifications_org").on(t.organizationId, t.createdAt)],
);
export const notificationReads = sqliteTable(
  "notification_reads",
  {
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.notificationId, t.userId] })],
);
export const deliveries = sqliteTable(
  "notification_deliveries",
  {
    id: text("id").primaryKey(),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttempt: integer("next_attempt").notNull(),
    leaseUntil: integer("lease_until"),
    leaseToken: text("lease_token"),
    lastError: text("last_error"),
    deliveredAt: integer("delivered_at"),
  },
  (t) => [
    uniqueIndex("delivery_idempotency").on(t.notificationId, t.channelId),
    index("deliveries_due").on(t.status, t.nextAttempt),
  ],
);
export const statusPages = sqliteTable(
  "status_pages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description").notNull(),
    published: integer("published").notNull().default(0),
    accent: text("accent").notNull().default("indigo"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("status_pages_org").on(t.organizationId)],
);
export const pageMonitors = sqliteTable(
  "status_page_monitors",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: text("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.monitorId] })],
);
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceId: text("resource_id"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("audit_org_time").on(t.organizationId, t.createdAt)],
);
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: integer("reset_at").notNull(),
});
export const authRateLimit = sqliteTable("auth_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: integer("last_request", { mode: "number" }).notNull(),
});
