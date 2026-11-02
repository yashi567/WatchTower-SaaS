import { now, one, rows } from "../db/queries";
import type { Analytics } from "../../shared/types";
export async function workspaceClock(db: D1Database, org: string) {
  if (org !== "demo") return now();
  const snapshot = await one<{ at: number | null }>(
    db,
    "SELECT MAX(last_checked) at FROM monitors WHERE organization_id='demo'",
  );
  return snapshot?.at ?? now();
}
export async function analytics(
  db: D1Database,
  org: string,
  range = "24h",
  monitorId?: string,
): Promise<Analytics> {
  const clock = await workspaceClock(db, org);
  const days =
      range === "90d" ? 90 : range === "30d" ? 30 : range === "7d" ? 7 : 1,
    period = days > 30 ? "day" : "hour",
    width = period === "hour" ? 3600 : 86400,
    since = Math.floor((clock - days * 86400) / width) * width;
  const scope = "m.organization_id=?" + (monitorId ? " AND m.id=?" : ""),
    params: unknown[] = [org, ...(monitorId ? [monitorId] : []), period, since];
  const base = `FROM monitor_aggregates a JOIN monitors m ON m.id=a.monitor_id WHERE ${scope} AND a.period=? AND a.bucket>=?`;
  const [summary, series, services, incidentStats, orgData] = await Promise.all(
    [
      one<{ total: number; successful: number; average: number | null }>(
        db,
        `SELECT COALESCE(SUM(a.total),0) total,COALESCE(SUM(a.successful),0) successful,SUM(a.latency_sum)/NULLIF(SUM(a.total),0) average ${base}`,
        ...params,
      ),
      rows<Analytics["series"][number]>(
        db,
        `SELECT a.bucket time,SUM(a.total) total,SUM(a.successful) successful,SUM(a.latency_sum)/SUM(a.total) average,100.0*SUM(a.successful)/SUM(a.total) uptime ${base} GROUP BY a.bucket ORDER BY a.bucket`,
        ...params,
      ),
      rows<Analytics["services"][number]>(
        db,
        `SELECT m.id,m.name,COALESCE(SUM(a.total),0) total,COALESCE(SUM(a.successful),0) successful,SUM(a.latency_sum)/NULLIF(SUM(a.total),0) average,100.0*SUM(a.successful)/NULLIF(SUM(a.total),0) uptime FROM monitors m LEFT JOIN monitor_aggregates a ON a.monitor_id=m.id AND a.period=? AND a.bucket>=? WHERE ${scope} GROUP BY m.id ORDER BY m.name`,
        period,
        since,
        org,
        ...(monitorId ? [monitorId] : []),
      ),
      one<{ incidents: number; mttr: number | null }>(
        db,
        "SELECT COUNT(*) incidents,AVG(CASE WHEN resolved_at IS NOT NULL THEN resolved_at-started_at END) mttr FROM incidents WHERE organization_id=? AND started_at>=?" +
          (monitorId ? " AND monitor_id=?" : ""),
        org,
        since,
        ...(monitorId ? [monitorId] : []),
      ),
      one<{ synthetic: number }>(
        db,
        "SELECT synthetic FROM organizations WHERE id=?",
        org,
      ),
    ],
  );
  // Exact SQL percentiles only within raw retention. Do not derive misleading percentiles from means.
  let p50: number | null = null,
    p95: number | null = null;
  if (days <= 7) {
    const percentile = await one<{ p50: number | null; p95: number | null }>(
      db,
      `WITH ranked AS (SELECT c.latency,ROW_NUMBER() OVER (ORDER BY c.latency) rn,COUNT(*) OVER () n FROM monitor_checks c JOIN monitors m ON m.id=c.monitor_id WHERE ${scope} AND c.checked_at>=?) SELECT MAX(CASE WHEN rn=CAST((n+1)/2 AS INTEGER) THEN latency END) p50,MAX(CASE WHEN rn=CAST((n*95+99)/100 AS INTEGER) THEN latency END) p95 FROM ranked WHERE n>=20`,
      org,
      ...(monitorId ? [monitorId] : []),
      since,
    );
    p50 = percentile?.p50 ?? null;
    p95 = percentile?.p95 ?? null;
  }
  const total = summary?.total ?? 0,
    successful = summary?.successful ?? 0;
  return {
    summary: {
      total,
      successful,
      average: summary?.average ?? null,
      uptime: total ? (successful / total) * 100 : null,
      p50,
      p95,
      incidents: incidentStats?.incidents ?? 0,
      mttr: incidentStats?.mttr ?? null,
    },
    series,
    services,
    range,
    since,
    synthetic: !!orgData?.synthetic,
  };
}
