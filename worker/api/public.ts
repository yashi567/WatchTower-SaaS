import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../env";
import { now, one, rows } from "../db/queries";
export const publicApi = new Hono<AppEnv>();
publicApi.get("/status/:slug", async (c) => {
  const page = await one<{
    id: string;
    title: string;
    description: string;
    accent: string;
    synthetic: number;
    asOf: number;
  }>(
    c.env.DB,
    "SELECT p.id,p.title,p.description,p.accent,o.synthetic,COALESCE((SELECT MAX(m.last_checked) FROM monitors m JOIN status_page_monitors s ON s.monitor_id=m.id WHERE s.page_id=p.id),p.created_at) asOf FROM status_pages p JOIN organizations o ON o.id=p.organization_id WHERE p.slug=? AND p.published=1",
    c.req.param("slug"),
  );
  if (!page)
    throw new HTTPException(404, {
      message: "This status page is not published",
    });
  const clock = page.synthetic ? page.asOf : now();
  const [monitors, incidents, history] = await Promise.all([
    rows(
      c.env.DB,
      `SELECT m.id,m.name,CASE WHEN ?=0 AND m.status NOT IN ('paused','pending') AND m.last_checked+MAX(900,m.interval*3)<? THEN 'unknown' ELSE m.status END status,m.last_checked,(SELECT 100.0*SUM(a.successful)/NULLIF(SUM(a.total),0) FROM monitor_aggregates a WHERE a.monitor_id=m.id AND a.period='day' AND a.bucket>=?) uptime FROM monitors m JOIN status_page_monitors p ON p.monitor_id=m.id WHERE p.page_id=? ORDER BY p.position`,
      page.synthetic,
      now(),
      clock - 30 * 86400,
      page.id,
    ),
    rows<{
      id: string;
      title: string;
      severity: string;
      status: string;
      started_at: number;
      resolved_at: number | null;
    }>(
      c.env.DB,
      `SELECT i.id,i.title,i.severity,i.status,i.started_at,i.resolved_at FROM incidents i WHERE i.monitor_id IN (SELECT monitor_id FROM status_page_monitors WHERE page_id=?) AND i.started_at>=? ORDER BY i.started_at DESC LIMIT 20`,
      page.id,
      clock - 30 * 86400,
    ),
    rows(
      c.env.DB,
      `SELECT a.monitor_id,a.bucket,100.0*a.successful/a.total uptime FROM monitor_aggregates a JOIN status_page_monitors p ON p.monitor_id=a.monitor_id WHERE p.page_id=? AND a.period='day' AND a.bucket>=? ORDER BY a.bucket`,
      page.id,
      clock - 30 * 86400,
    ),
  ]);
  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    data: {
      page,
      monitors,
      incidents,
      history,
      updatedAt: Math.max(
        page.asOf,
        ...incidents.map((i) => i.resolved_at ?? i.started_at),
      ),
    },
  });
});
