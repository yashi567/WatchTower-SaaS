import type { Env } from "../env";
import type { Monitor } from "../../shared/types";
import { id, now, rows, run } from "../db/queries";
import { validateTarget, validateDNS } from "./security";
import { capacityLimits } from "../services/capacity";
export interface Measurement {
  success: boolean;
  statusCode: number | null;
  latency: number;
  error: string | null;
}
export async function measure(
  monitor: Monitor,
  approved: string,
  fetcher: typeof fetch = fetch,
  dns: typeof validateDNS = validateDNS,
): Promise<Measurement> {
  const start = performance.now();
  let response: Response | undefined;
  try {
    const target = validateTarget(monitor.url, approved);
    await dns(target.hostname, fetcher);
    const requestStart = performance.now();
    response = await fetcher(target.toString(), {
      method: monitor.method,
      redirect: "manual",
      signal: AbortSignal.timeout(monitor.timeout),
      headers: {
        "User-Agent": "WatchTower/1.0 (uptime monitor)",
        Accept: "*/*",
      },
      cache: "no-store",
    });
    const latency = Math.round((performance.now() - requestStart) * 10) / 10;
    const success =
      response.status >= monitor.expected_min &&
      response.status <= monitor.expected_max;
    return {
      success,
      statusCode: response.status,
      latency,
      error: success
        ? null
        : response.status >= 300 && response.status < 400
          ? "Redirect not followed; monitor the final approved URL"
          : `Unexpected HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      statusCode: null,
      latency: Math.round(performance.now() - start),
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "Request timed out"
          : error instanceof Error
            ? error.message.slice(0, 200)
            : "Request failed",
    };
  } finally {
    if (response?.body) await response.body.cancel().catch(() => {});
  }
}
export async function persistMeasurement(
  db: D1Database,
  m: Monitor,
  token: string,
  result: Measurement,
  at = now(),
) {
  // A single INSERT is the commit point. Triggers update counters, aggregates, incidents, and outbox in the same SQLite transaction.
  const inserted = await run(
    db,
    `INSERT INTO monitor_checks (id,monitor_id,checked_at,success,status_code,latency,error,synthetic) SELECT ?,id,?,?,?,?,?,0 FROM monitors WHERE id=? AND claim_token=? AND claim_until>? AND status!='paused'`,
    `${token}:${m.id}`,
    at,
    +result.success,
    result.statusCode,
    result.latency,
    result.error,
    m.id,
    token,
    at,
  );
  return inserted.meta.changes > 0;
}
export async function runMonitoring(
  env: Env,
  at = now(),
  probe: (m: Monitor) => Promise<Measurement> = (m) =>
    measure(m, env.APPROVED_MONITOR_HOSTS),
) {
  const token = id(),
    batch = capacityLimits(env).batch;
  const claimed = await rows<Monitor>(
    env.DB,
    `UPDATE monitors SET claim_token=?,claim_until=? WHERE id IN (SELECT m.id FROM monitors m JOIN organizations o ON o.id=m.organization_id WHERE o.synthetic=0 AND m.status!='paused' AND m.next_check<=? AND (m.claim_until IS NULL OR m.claim_until<=?) ORDER BY m.next_check LIMIT ?) AND (claim_until IS NULL OR claim_until<=?) RETURNING *`,
    token,
    at + 90,
    at,
    at,
    batch,
    at,
  );
  // Two concurrent probes, below the six-connection platform ceiling. Each target uses two bounded DNS requests.
  const outcomes = await Promise.allSettled(
    claimed.map(async (m) => {
      const result = await probe(m);
      return persistMeasurement(env.DB, m, `${token}`, result, at);
    }),
  );
  outcomes.forEach((result) => {
    if (result.status === "rejected")
      console.error(
        JSON.stringify({
          event: "check_commit_failed",
          message:
            result.reason instanceof Error ? result.reason.message : "unknown",
        }),
      );
  });
  return {
    claimed: claimed.length,
    stored: outcomes.filter((r) => r.status === "fulfilled" && r.value).length,
  };
}
export async function cleanup(db: D1Database, at = now()) {
  // Bounded deletes are repeatable. At ten monitors, about two raw checks expire/minute; delete budget 40.
  await db.batch([
    db
      .prepare(
        "UPDATE notification_deliveries SET status='failed',last_error='Retry budget exhausted after interrupted delivery',lease_until=NULL,lease_token=NULL WHERE status='pending' AND attempts>=4 AND lease_until<=?",
      )
      .bind(at),
    db
      .prepare(
        "DELETE FROM monitor_checks WHERE id IN (SELECT id FROM monitor_checks WHERE synthetic=0 AND checked_at<? LIMIT 40)",
      )
      .bind(at - 7 * 86400),
    db
      .prepare(
        "DELETE FROM monitor_aggregates WHERE rowid IN (SELECT rowid FROM monitor_aggregates WHERE ((period='hour' AND bucket<?) OR (period='day' AND bucket<?)) AND monitor_id NOT IN (SELECT id FROM monitors WHERE organization_id='demo') LIMIT 20)",
      )
      .bind(at - 30 * 86400, at - 90 * 86400),
    db
      .prepare(
        "DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE reset_at<? LIMIT 20)",
      )
      .bind(at - 3600),
    db
      .prepare(
        "DELETE FROM notifications WHERE id IN (SELECT id FROM notifications WHERE organization_id!='demo' AND created_at<? LIMIT 10)",
      )
      .bind(at - 90 * 86400),
    db
      .prepare(
        "DELETE FROM audit_logs WHERE id IN (SELECT id FROM audit_logs WHERE created_at<? LIMIT 10)",
      )
      .bind(at - 90 * 86400),
    db
      .prepare(
        "DELETE FROM invitations WHERE id IN (SELECT id FROM invitations WHERE expires_at<? LIMIT 10)",
      )
      .bind(at - 7 * 86400),
    db
      .prepare(
        "DELETE FROM auth_rate_limit WHERE id IN (SELECT id FROM auth_rate_limit WHERE last_request<? LIMIT 20)",
      )
      .bind((at - 86400) * 1000),
    db
      .prepare(
        "DELETE FROM session WHERE id IN (SELECT id FROM session WHERE expires_at<? LIMIT 10)",
      )
      .bind(at * 1000),
    db
      .prepare(
        "DELETE FROM verification WHERE id IN (SELECT id FROM verification WHERE expires_at<? LIMIT 10)",
      )
      .bind(at * 1000),
  ]);
}
