import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import {
  monitorSchema,
  incidentSchema,
  incidentUpdateSchema,
  pageSchema,
  channelSchema,
} from "../../shared/schemas";
import { permit, rateLimit } from "../middleware/access";
import { now, id, one, run, audit } from "../db/queries";
import { getMonitor } from "./read";
import { validateTarget, validateDiscord } from "../monitoring/security";
import { canTransition } from "../monitoring/state";
import { encrypt, notify } from "../notifications/delivery";
import { capacityLimits } from "../services/capacity";
export const write = new Hono<AppEnv>();
function limits(c: { env: AppEnv["Bindings"] }) {
  return capacityLimits(c.env);
}
write.post("/monitors", permit("operate"), async (c) => {
  const data = monitorSchema.parse(await c.req.json());
  try {
    validateTarget(data.url, c.env.APPROVED_MONITOR_HOSTS);
  } catch (e) {
    throw new HTTPException(422, {
      message: e instanceof Error ? e.message : "Unsafe URL",
    });
  }
  const org = c.get("workspaceId"),
    monitorId = id(),
    at = now(),
    cap = limits(c);
  await rateLimit(c.env.DB, `monitor:create:${org}`, 10, 3600);
  const result = await run(
    c.env.DB,
    `INSERT INTO monitors (id,organization_id,name,url,method,interval,timeout,expected_min,expected_max,failure_threshold,recovery_threshold,tags,alerts,next_check,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM monitors WHERE organization_id=? AND status!='paused')<? AND (SELECT COUNT(*) FROM monitors m JOIN organizations o ON o.id=m.organization_id WHERE o.synthetic=0 AND m.status!='paused')<? AND (SELECT COUNT(*) FROM monitors WHERE organization_id=?)<20`,
    monitorId,
    org,
    data.name,
    data.url,
    data.method,
    data.interval,
    data.timeout,
    data.expectedMin,
    data.expectedMax,
    data.failureThreshold,
    data.recoveryThreshold,
    JSON.stringify(data.tags),
    +data.alerts,
    at,
    at,
    at,
    org,
    cap.workspace,
    cap.global,
    org,
  );
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message:
        "Monitor capacity reached. Pause or delete a monitor before adding another.",
    });
  await audit(c.env.DB, org, c.get("user").id, "monitor.created", monitorId);
  return c.json({ data: await getMonitor(c.env.DB, org, monitorId) }, 201);
});
write.put("/monitors/:id", permit("operate"), async (c) => {
  const data = monitorSchema.parse(await c.req.json());
  const m = await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  try {
    validateTarget(data.url, c.env.APPROVED_MONITOR_HOSTS);
  } catch (e) {
    throw new HTTPException(422, {
      message: e instanceof Error ? e.message : "Unsafe URL",
    });
  }
  await rateLimit(c.env.DB, `monitor:edit:${c.get("workspaceId")}`, 30, 3600);
  await run(
    c.env.DB,
    "UPDATE monitors SET name=?,url=?,method=?,interval=?,timeout=?,expected_min=?,expected_max=?,failure_threshold=?,recovery_threshold=?,tags=?,alerts=?,claim_token=NULL,claim_until=NULL,updated_at=?,next_check=?,successes=0,failures=0 WHERE id=? AND organization_id=?",
    data.name,
    data.url,
    data.method,
    data.interval,
    data.timeout,
    data.expectedMin,
    data.expectedMax,
    data.failureThreshold,
    data.recoveryThreshold,
    JSON.stringify(data.tags),
    +data.alerts,
    now(),
    now(),
    m.id,
    c.get("workspaceId"),
  );
  await notify(
    c.env.DB,
    c.get("workspaceId"),
    `config:${m.id}:${id()}`,
    "Monitor configuration updated",
    `${data.name} has a new monitoring configuration.`,
    `/monitors/${m.id}`,
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "monitor.updated",
    m.id,
  );
  return c.json({
    data: await getMonitor(c.env.DB, c.get("workspaceId"), m.id),
  });
});
write.patch("/monitors/:id/state", permit("operate"), async (c) => {
  const { paused } = z
      .object({ paused: z.boolean() })
      .parse(await c.req.json()),
    org = c.get("workspaceId"),
    m = await getMonitor(c.env.DB, org, c.req.param("id")),
    cap = limits(c);
  await rateLimit(c.env.DB, `monitor:state:${org}`, 30, 3600);
  const result = await run(
    c.env.DB,
    `UPDATE monitors SET status=?,next_check=?,claim_token=NULL,claim_until=NULL,failures=0,successes=0,updated_at=? WHERE id=? AND organization_id=? AND (?=1 OR status!='paused' OR ((SELECT COUNT(*) FROM monitors WHERE organization_id=? AND status!='paused')<? AND (SELECT COUNT(*) FROM monitors m JOIN organizations o ON o.id=m.organization_id WHERE o.synthetic=0 AND m.status!='paused')<?))`,
    paused ? "paused" : "pending",
    now(),
    now(),
    m.id,
    org,
    +paused,
    org,
    cap.workspace,
    cap.global,
  );
  if (!result.meta.changes)
    throw new HTTPException(409, {
      message: "Active monitor capacity reached",
    });
  await audit(
    c.env.DB,
    org,
    c.get("user").id,
    paused ? "monitor.paused" : "monitor.resumed",
    m.id,
  );
  return c.json({ data: { updated: true } });
});
write.post("/monitors/:id/check", permit("operate"), async (c) => {
  const m = await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  if (m.status === "paused")
    throw new HTTPException(409, { message: "Resume the monitor first" });
  await rateLimit(c.env.DB, `manual:${m.id}`, 1, 300);
  await run(
    c.env.DB,
    "UPDATE monitors SET next_check=? WHERE id=? AND organization_id=? AND status!='paused'",
    now(),
    m.id,
    c.get("workspaceId"),
  );
  return c.json(
    {
      data: {
        queued: true,
        message: "Check queued for the next scheduled batch",
      },
    },
    202,
  );
});
write.delete("/monitors/:id", permit("operate"), async (c) => {
  const m = await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE incidents SET status='resolved',resolved_at=?,updated_by=? WHERE monitor_id=? AND organization_id=? AND status!='resolved'",
    ).bind(now(), c.get("user").id, m.id, c.get("workspaceId")),
    c.env.DB.prepare(
      "DELETE FROM monitors WHERE id=? AND organization_id=?",
    ).bind(m.id, c.get("workspaceId")),
  ]);
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "monitor.deleted",
    m.id,
  );
  return c.json({ data: { deleted: true } });
});
write.post("/incidents", permit("operate"), async (c) => {
  const data = incidentSchema.parse(await c.req.json()),
    incidentId = id();
  if (data.monitorId)
    await getMonitor(c.env.DB, c.get("workspaceId"), data.monitorId);
  await rateLimit(c.env.DB, `incident:${c.get("workspaceId")}`, 30, 3600);
  await run(
    c.env.DB,
    "INSERT INTO incidents (id,organization_id,monitor_id,title,description,severity,status,source,started_at,created_by,updated_by) VALUES (?,?,?,?,?,?,'investigating','manual',?,?,?)",
    incidentId,
    c.get("workspaceId"),
    data.monitorId ?? null,
    data.title,
    data.description,
    data.severity,
    now(),
    c.get("user").id,
    c.get("user").id,
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "incident.created",
    incidentId,
  );
  return c.json({ data: { id: incidentId } }, 201);
});
write.patch("/incidents/:id", permit("operate"), async (c) => {
  const data = incidentUpdateSchema.parse(await c.req.json());
  const incident = await one<{ status: string }>(
    c.env.DB,
    "SELECT status FROM incidents WHERE id=? AND organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  if (!incident)
    throw new HTTPException(404, { message: "Incident not found" });
  if (
    (data.status !== incident.status &&
      !canTransition(incident.status, data.status)) ||
    incident.status === "resolved"
  )
    throw new HTTPException(409, {
      message: "That incident transition is not allowed",
    });
  const event = id(),
    at = now();
  const result = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO incident_events (id,incident_id,status,message,created_at,actor_id) SELECT ?,id,?,?,?,? FROM incidents WHERE id=? AND organization_id=? AND status=?",
    ).bind(
      event,
      data.status,
      data.message,
      at,
      c.get("user").id,
      c.req.param("id"),
      c.get("workspaceId"),
      incident.status,
    ),
    c.env.DB.prepare(
      "UPDATE incidents SET status=?,resolved_at=?,updated_by=? WHERE id=? AND organization_id=? AND EXISTS (SELECT 1 FROM incident_events WHERE id=?)",
    ).bind(
      data.status,
      data.status === "resolved" ? at : null,
      c.get("user").id,
      c.req.param("id"),
      c.get("workspaceId"),
      event,
    ),
  ]);
  if (!result[0].meta.changes)
    throw new HTTPException(409, {
      message: "Incident changed. Refresh and try again.",
    });
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "incident.updated",
    c.req.param("id"),
  );
  return c.json({ data: { updated: true } });
});
write.post("/notifications/read", async (c) => {
  const data = z
    .object({ id: z.string().optional() })
    .parse(await c.req.json());
  await run(
    c.env.DB,
    "INSERT OR IGNORE INTO notification_reads (notification_id,user_id) SELECT id,? FROM notifications WHERE organization_id=?" +
      (data.id ? " AND id=?" : ""),
    c.get("user").id,
    c.get("workspaceId"),
    ...(data.id ? [data.id] : []),
  );
  return c.json({ data: { updated: true } });
});
write.post("/notification-channels", permit("manage"), async (c) => {
  const data = channelSchema.parse(await c.req.json());
  if (!c.env.CHANNEL_ENCRYPTION_KEY)
    throw new HTTPException(503, {
      message: "Set CHANNEL_ENCRYPTION_KEY before adding delivery channels",
    });
  let destination: string;
  try {
    destination =
      data.kind === "discord"
        ? validateDiscord(data.destination)
        : z.email().parse(data.destination);
  } catch {
    throw new HTTPException(422, { message: "Invalid channel destination" });
  }
  if (data.kind === "email" && (!c.env.RESEND_API_KEY || !c.env.RESEND_FROM))
    throw new HTTPException(503, {
      message: "Email delivery is not configured",
    });
  const count = await one<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) n FROM notification_channels WHERE organization_id=?",
    c.get("workspaceId"),
  );
  if ((count?.n ?? 0) >= 3)
    throw new HTTPException(409, {
      message: "Maximum three notification channels per workspace",
    });
  const channelId = id();
  await run(
    c.env.DB,
    "INSERT INTO notification_channels (id,organization_id,name,kind,encrypted_destination,enabled,created_at) VALUES (?,?,?,?,?,?,?)",
    channelId,
    c.get("workspaceId"),
    data.name,
    data.kind,
    await encrypt(destination, c.env.CHANNEL_ENCRYPTION_KEY),
    +data.enabled,
    now(),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "channel.created",
    channelId,
  );
  return c.json({ data: { id: channelId } }, 201);
});
write.patch("/notification-channels/:id", permit("manage"), async (c) => {
  const data = z.object({ enabled: z.boolean() }).parse(await c.req.json());
  await run(
    c.env.DB,
    "UPDATE notification_channels SET enabled=? WHERE id=? AND organization_id=?",
    +data.enabled,
    c.req.param("id"),
    c.get("workspaceId"),
  );
  return c.json({ data: { updated: true } });
});
write.delete("/notification-channels/:id", permit("manage"), async (c) => {
  await run(
    c.env.DB,
    "DELETE FROM notification_channels WHERE id=? AND organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "channel.deleted",
    c.req.param("id"),
  );
  return c.json({ data: { deleted: true } });
});
write.post("/notification-channels/:id/test", permit("manage"), async (c) => {
  const channel = await one<{ id: string; name: string }>(
    c.env.DB,
    "SELECT id,name FROM notification_channels WHERE id=? AND organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  if (!channel) throw new HTTPException(404);
  await rateLimit(c.env.DB, `channel:test:${channel.id}`, 3, 3600);
  const notificationId = id();
  await notify(
    c.env.DB,
    c.get("workspaceId"),
    `test:${notificationId}`,
    "WatchTower test notification",
    `Testing delivery to ${channel.name}. Check delivery history for the outcome.`,
    "/settings",
    channel.id,
  );
  return c.json({ data: { queued: true } }, 202);
});
write.post("/status-pages", permit("manage"), async (c) => {
  const data = pageSchema.parse(await c.req.json());
  const count = await one<{ n: number }>(
    c.env.DB,
    "SELECT COUNT(*) n FROM status_pages WHERE organization_id=?",
    c.get("workspaceId"),
  );
  if ((count?.n ?? 0) >= 3)
    throw new HTTPException(409, {
      message: "Maximum three status pages per workspace",
    });
  await savePage(c.env.DB, c.get("workspaceId"), id(), data, false);
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "status_page.created",
  );
  return c.json({ data: { created: true } }, 201);
});
write.put("/status-pages/:id", permit("manage"), async (c) => {
  const data = pageSchema.parse(await c.req.json());
  const exists = await one(
    c.env.DB,
    "SELECT id FROM status_pages WHERE id=? AND organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  if (!exists) throw new HTTPException(404);
  await savePage(c.env.DB, c.get("workspaceId"), c.req.param("id"), data, true);
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "status_page.updated",
    c.req.param("id"),
  );
  return c.json({ data: { updated: true } });
});
write.delete("/status-pages/:id", permit("manage"), async (c) => {
  await run(
    c.env.DB,
    "DELETE FROM status_pages WHERE id=? AND organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  await audit(
    c.env.DB,
    c.get("workspaceId"),
    c.get("user").id,
    "status_page.deleted",
    c.req.param("id"),
  );
  return c.json({ data: { deleted: true } });
});
async function savePage(
  db: D1Database,
  org: string,
  pageId: string,
  data: z.infer<typeof pageSchema>,
  update: boolean,
) {
  for (const monitorId of data.monitorIds) await getMonitor(db, org, monitorId);
  const statements: D1PreparedStatement[] = [
    update
      ? db
          .prepare(
            "UPDATE status_pages SET title=?,slug=?,description=?,published=?,accent=? WHERE id=? AND organization_id=?",
          )
          .bind(
            data.title,
            data.slug,
            data.description,
            +data.published,
            data.accent,
            pageId,
            org,
          )
      : db
          .prepare(
            "INSERT INTO status_pages (id,organization_id,title,slug,description,published,accent,created_at) VALUES (?,?,?,?,?,?,?,?)",
          )
          .bind(
            pageId,
            org,
            data.title,
            data.slug,
            data.description,
            +data.published,
            data.accent,
            now(),
          ),
    db.prepare("DELETE FROM status_page_monitors WHERE page_id=?").bind(pageId),
    ...data.monitorIds.map((mid, i) =>
      db
        .prepare(
          "INSERT INTO status_page_monitors (page_id,monitor_id,position) VALUES (?,?,?)",
        )
        .bind(pageId, mid, i),
    ),
  ];
  await db.batch(statements);
}
