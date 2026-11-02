import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import type { Monitor, StatusPage } from "../../shared/types";
import { now, one, rows } from "../db/queries";
import { analytics, workspaceClock } from "../services/analytics";
import { capacityLimits } from "../services/capacity";
export const read = new Hono<AppEnv>();
read.get("/checks/recent", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT c.id,c.monitor_id,c.checked_at,c.success,c.status_code,c.latency,m.name monitor_name FROM monitors m JOIN monitor_checks c ON c.id IN (SELECT id FROM monitor_checks WHERE monitor_id=m.id ORDER BY checked_at DESC LIMIT 8) WHERE m.organization_id=? ORDER BY c.checked_at DESC LIMIT 8",
      c.get("workspaceId"),
    ),
  }),
);
export function paging(page?: string) {
  return Math.max(1, Math.min(10000, Math.floor(Number(page) || 1)));
}
export async function getMonitor(db: D1Database, org: string, id: string) {
  const m = await one<Monitor>(
    db,
    "SELECT * FROM monitors WHERE id=? AND organization_id=?",
    id,
    org,
  );
  if (!m) throw new HTTPException(404, { message: "Monitor not found" });
  return m;
}
read.get("/monitors", async (c) => {
  const org = c.get("workspaceId"),
    page = paging(c.req.query("page")),
    q = (c.req.query("q") ?? "").slice(0, 80),
    status = c.req.query("status");
  const order: Record<string, string> = {
    name: "m.name ASC",
    latency: "m.latency DESC",
    uptime: "uptime ASC",
    recent: "m.updated_at DESC",
  };
  const statusExpression =
    c.get("workspaceId") === "demo"
      ? "m.status"
      : "CASE WHEN m.status NOT IN ('paused','pending') AND m.last_checked+MAX(900,m.interval*3)<unixepoch() THEN 'unknown' ELSE m.status END";
  const filter = `m.organization_id=? AND instr(lower(m.name),lower(?))>0${status && status !== "all" ? ` AND (${statusExpression})=?` : ""}`,
    params = [org, q, ...(status && status !== "all" ? [status] : [])];
  const [data, total] = await Promise.all([
    rows<Monitor>(
      c.env.DB,
      `SELECT m.*, (SELECT 100.0*SUM(a.successful)/NULLIF(SUM(a.total),0) FROM monitor_aggregates a WHERE a.monitor_id=m.id AND a.period='hour' AND a.bucket>=?) uptime FROM monitors m WHERE ${filter} ORDER BY ${order[c.req.query("sort") ?? "name"] ?? order.name} LIMIT 20 OFFSET ?`,
      (await workspaceClock(c.env.DB, org)) - 86400,
      ...params,
      (page - 1) * 20,
    ),
    one<{ total: number }>(
      c.env.DB,
      `SELECT COUNT(*) total FROM monitors m WHERE ${filter}`,
      ...params,
    ),
  ]);
  return c.json({
    data: data.map((m) => publicMonitor(m, c.get("workspaceId") === "demo")),
    meta: { page, total: total?.total ?? 0, pageSize: 20 },
  });
});
export function publicMonitor(m: Monitor, synthetic = false) {
  return {
    ...m,
    status:
      !synthetic &&
      !["paused", "pending"].includes(m.status) &&
      m.last_checked &&
      m.last_checked + Math.max(900, m.interval * 3) < now()
        ? "unknown"
        : m.status,
    claim_token: undefined,
    claim_until: undefined,
  };
}
read.get("/monitors/:id", async (c) => {
  const m = await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  return c.json({ data: publicMonitor(m, c.get("workspaceId") === "demo") });
});
read.get("/monitors/:id/checks", async (c) => {
  await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  const page = paging(c.req.query("page"));
  return c.json({
    data: await rows(
      c.env.DB,
      "SELECT * FROM monitor_checks WHERE monitor_id=? ORDER BY checked_at DESC LIMIT 25 OFFSET ?",
      c.req.param("id"),
      (page - 1) * 25,
    ),
    meta: { page, pageSize: 25 },
  });
});
read.get("/monitors/:id/analytics", async (c) => {
  await getMonitor(c.env.DB, c.get("workspaceId"), c.req.param("id"));
  return c.json({
    data: await analytics(
      c.env.DB,
      c.get("workspaceId"),
      c.req.query("range"),
      c.req.param("id"),
    ),
  });
});
read.get("/analytics/overview", async (c) => {
  const monitor = c.req.query("monitorId");
  if (monitor) await getMonitor(c.env.DB, c.get("workspaceId"), monitor);
  return c.json({
    data: await analytics(
      c.env.DB,
      c.get("workspaceId"),
      c.req.query("range"),
      monitor,
    ),
  });
});
read.get("/incidents", async (c) => {
  const page = paging(c.req.query("page")),
    status = c.req.query("status"),
    monitor = c.req.query("monitorId"),
    where =
      "i.organization_id=?" +
      (status === "active"
        ? " AND i.status!='resolved'"
        : status === "resolved"
          ? " AND i.status='resolved'"
          : "") +
      (monitor ? " AND i.monitor_id=?" : "");
  const params = [c.get("workspaceId"), ...(monitor ? [monitor] : [])];
  const data = await rows(
    c.env.DB,
    `SELECT i.*,m.name monitor_name FROM incidents i LEFT JOIN monitors m ON m.id=i.monitor_id WHERE ${where} ORDER BY i.started_at DESC LIMIT 20 OFFSET ?`,
    ...params,
    (page - 1) * 20,
  );
  const total = await one<{ total: number }>(
    c.env.DB,
    `SELECT COUNT(*) total FROM incidents i WHERE ${where}`,
    ...params,
  );
  return c.json({
    data,
    meta: { page, pageSize: 20, total: total?.total ?? 0 },
  });
});
read.get("/incidents/:id", async (c) => {
  const incident = await one(
    c.env.DB,
    "SELECT i.*,m.name monitor_name,m.last_error FROM incidents i LEFT JOIN monitors m ON m.id=i.monitor_id WHERE i.id=? AND i.organization_id=?",
    c.req.param("id"),
    c.get("workspaceId"),
  );
  if (!incident)
    throw new HTTPException(404, { message: "Incident not found" });
  return c.json({
    data: {
      ...incident,
      events: await rows(
        c.env.DB,
        "SELECT e.*,u.name actor_name FROM incident_events e LEFT JOIN user u ON u.id=e.actor_id WHERE incident_id=? ORDER BY e.created_at",
        c.req.param("id"),
      ),
    },
  });
});
read.get("/notifications", async (c) => {
  const page = paging(c.req.query("page"));
  const data = await rows(
    c.env.DB,
    "SELECT n.*,CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE n.organization_id=? ORDER BY n.created_at DESC LIMIT 20 OFFSET ?",
    c.get("user").id,
    c.get("workspaceId"),
    (page - 1) * 20,
  );
  const count = await one<{ total: number; unread: number }>(
    c.env.DB,
    "SELECT COUNT(*) total,SUM(CASE WHEN r.user_id IS NULL THEN 1 ELSE 0 END) unread FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=? WHERE n.organization_id=?",
    c.get("user").id,
    c.get("workspaceId"),
  );
  return c.json({ data, meta: { page, pageSize: 20, ...count } });
});
read.get("/status-pages", async (c) => {
  const pages = await rows<StatusPage>(
    c.env.DB,
    "SELECT * FROM status_pages WHERE organization_id=? ORDER BY created_at DESC LIMIT 10",
    c.get("workspaceId"),
  );
  return c.json({
    data: await Promise.all(
      pages.map(async (p) => ({
        ...p,
        monitorIds: (
          await rows<{ monitor_id: string }>(
            c.env.DB,
            "SELECT monitor_id FROM status_page_monitors WHERE page_id=? ORDER BY position",
            p.id,
          )
        ).map((m) => m.monitor_id),
      })),
    ),
  });
});
read.get("/notification-channels", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT id,name,kind,enabled,created_at FROM notification_channels WHERE organization_id=?",
      c.get("workspaceId"),
    ),
  }),
);
read.get("/notification-deliveries", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT d.id,d.status,d.attempts,d.last_error,d.delivered_at,c.name channel_name,n.title FROM notification_deliveries d JOIN notification_channels c ON c.id=d.channel_id JOIN notifications n ON n.id=d.notification_id WHERE c.organization_id=? ORDER BY n.created_at DESC LIMIT 30",
      c.get("workspaceId"),
    ),
  }),
);
read.get("/audit-logs", async (c) =>
  c.json({
    data: await rows(
      c.env.DB,
      "SELECT a.*,u.name actor_name FROM audit_logs a LEFT JOIN user u ON u.id=a.user_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 30",
      c.get("workspaceId"),
    ),
  }),
);
read.get("/capacity", async (c) => {
  if (c.get("workspaceId") === "demo")
    return c.json({
      data: {
        workspace: 5,
        global: 5,
        workspaceLimit: 5,
        globalLimit: 10,
        approvedHosts: [],
        emailConfigured: false,
        channelsConfigured: false,
      },
    });
  const [workspace, global] = await Promise.all([
    one<{ n: number }>(
      c.env.DB,
      "SELECT COUNT(*) n FROM monitors WHERE organization_id=? AND status!='paused'",
      c.get("workspaceId"),
    ),
    one<{ n: number }>(
      c.env.DB,
      "SELECT COUNT(*) n FROM monitors m JOIN organizations o ON o.id=m.organization_id WHERE o.synthetic=0 AND m.status!='paused'",
    ),
  ]);
  return c.json({
    data: {
      workspace: workspace?.n ?? 0,
      global: global?.n ?? 0,
      workspaceLimit: capacityLimits(c.env).workspace,
      globalLimit: capacityLimits(c.env).global,
      approvedHosts: c.env.APPROVED_MONITOR_HOSTS.split(",").filter(Boolean),
      emailConfigured: !!(c.env.RESEND_API_KEY && c.env.RESEND_FROM),
      channelsConfigured: !!c.env.CHANNEL_ENCRYPTION_KEY,
    },
  });
});
