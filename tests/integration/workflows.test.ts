import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFileSync, readdirSync } from "node:fs";
import worker, { app } from "../../worker/index";
import {
  runMonitoring,
  persistMeasurement,
  cleanup,
} from "../../worker/monitoring/engine";
import {
  deliverPending,
  notify,
  encrypt,
} from "../../worker/notifications/delivery";
import { analytics } from "../../worker/services/analytics";
import { run, rows, one, now } from "../../worker/db/queries";
import type { Env } from "../../worker/env";
import type { Monitor } from "../../shared/types";
let mf: Miniflare,
  db: D1Database,
  env: Env,
  cookie: string,
  viewerCookie: string,
  memberCookie: string;
const secret = "test-secret-for-better-auth-at-least-32-characters";
async function signedCookie(token: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)),
      ),
    ),
  );
  return `better-auth.session_token=${encodeURIComponent(token + "." + sig)}`;
}
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  org = "alpha",
  auth = cookie,
) {
  return app.request(
    `http://localhost:5173/api${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
        "X-Workspace-Id": org,
        ...(auth ? { Cookie: auth } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    env,
  );
}
async function json(response: Response) {
  return response.json() as Promise<{
    data: Record<string, unknown>;
    error: { message: string };
  }>;
}
const config = {
  name: "Controlled API",
  url: "https://example.com/health",
  method: "GET",
  interval: 300,
  timeout: 1000,
  expectedMin: 200,
  expectedMax: 299,
  failureThreshold: 3,
  recoveryThreshold: 2,
  tags: ["integration"],
  alerts: true,
};
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          name: "tests",
          modules: true,
          script: 'export default {fetch(){return new Response("test")}}',
          compatibilityDate: "2026-11-01",
          d1Databases: ["DB"],
        },
      ],
    }),
  );
  db = (await mf.getD1Database("DB", "tests")) as unknown as D1Database;
  for (const filename of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const content = readFileSync(`migrations/${filename}`, "utf8").replace(
      /^--.*$/gm,
      "",
    );
    const statements =
      content.match(/\s*CREATE TRIGGER[\s\S]*?END;|[^;]+;/g) ?? [];
    for (const statement of statements) await db.prepare(statement).run();
  }
  env = {
    DB: db,
    ASSETS: {} as Fetcher,
    APP_URL: "http://localhost:5173",
    ENVIRONMENT: "test",
    BETTER_AUTH_SECRET: secret,
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-client-secret",
    APPROVED_MONITOR_HOSTS: "example.com",
    MAX_WORKSPACE_MONITORS: "5",
    MAX_GLOBAL_MONITORS: "10",
    CHECK_BATCH_SIZE: "2",
    CHANNEL_ENCRYPTION_KEY: btoa("k".repeat(32)),
  };
  for (const [uid, token] of [
    ["alice", "alice-session"],
    ["viewer", "viewer-session"],
    ["member", "member-session"],
    ["bob", "bob-session"],
  ]) {
    const at = Date.now();
    await run(
      db,
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,1,?,?)",
      uid,
      uid,
      `${uid}@example.com`,
      at,
      at,
    );
    await run(
      db,
      "INSERT INTO session(id,token,expires_at,created_at,updated_at,user_id) VALUES (?,?,?,?,?,?)",
      uid,
      token,
      at + 86400000,
      at,
      at,
      uid,
    );
  }
  cookie = await signedCookie("alice-session");
  viewerCookie = await signedCookie("viewer-session");
  memberCookie = await signedCookie("member-session");
  await run(
    db,
    "INSERT INTO organizations(id,name,created_at) VALUES ('alpha','Alpha',?),('beta','Beta',?)",
    now(),
    now(),
  );
  await run(
    db,
    "INSERT INTO memberships(organization_id,user_id,role,created_at) VALUES ('alpha','alice','owner',?),('alpha','viewer','viewer',?),('alpha','member','member',?)",
    now(),
    now(),
    now(),
  );
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
describe("authenticated API and tenant isolation", () => {
  it("starts OAuth with a protected state cookie and database rate limiting", async () => {
    const response = await call("/auth/sign-in/social", "POST", {
      provider: "github",
      callbackURL: "/app",
    });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { url: string };
    expect(result.url).toContain("github.com");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });
  it("requires authentication and rejects forged session cookies", async () => {
    expect(
      (await call("/monitors", "GET", undefined, "alpha", "")).status,
    ).toBe(401);
    expect(
      (
        await call(
          "/monitors",
          "GET",
          undefined,
          "alpha",
          "better-auth.session_token=forged",
        )
      ).status,
    ).toBe(401);
  });
  it("accepts a real Better Auth signed session from D1", async () => {
    const response = await call("/workspaces");
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).toContain("Alpha");
  });
  it("creates and persists a validated monitor", async () => {
    const response = await call("/monitors", "POST", config);
    expect(response.status).toBe(201);
    const result = await json(response);
    expect(result.data.name).toBe(config.name);
    expect(
      (await rows(db, "SELECT * FROM monitors WHERE organization_id='alpha'"))
        .length,
    ).toBe(1);
  });
  it("rejects invalid and unsafe endpoints", async () => {
    expect(
      (await call("/monitors", "POST", { ...config, url: "http://127.0.0.1" }))
        .status,
    ).toBe(422);
    expect(
      (await call("/monitors", "POST", { ...config, interval: 30 })).status,
    ).toBe(422);
  });
  it("rejects access to an organization the session does not belong to", async () =>
    expect((await call("/monitors", "GET", undefined, "beta")).status).toBe(
      404,
    ));
  it("hides another tenant’s monitor even when its ID is known", async () => {
    await run(
      db,
      "INSERT INTO monitors(id,organization_id,name,url,next_check,created_at,updated_at) VALUES ('foreign','beta','Other','https://example.com',?,?,?)",
      now() + 9999,
      now(),
      now(),
    );
    expect((await call("/monitors/foreign")).status).toBe(404);
    expect((await call("/monitors/foreign", "PUT", config)).status).toBe(404);
    expect((await call("/monitors/foreign", "DELETE", {})).status).toBe(404);
  });
  it("denies viewer writes and member administration", async () => {
    expect(
      (await call("/monitors", "POST", config, "alpha", viewerCookie)).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/notification-channels",
          "POST",
          { name: "bad", kind: "email", destination: "x@example.com" },
          "alpha",
          memberCookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/workspaces/alpha/invitations",
          "POST",
          { email: "x@example.com", role: "admin" },
          "alpha",
          memberCookie,
        )
      ).status,
    ).toBe(403);
  });
  it("rejects cross-origin state changes", async () => {
    const r = await app.request(
      "http://localhost:5173/api/monitors",
      {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
          Cookie: cookie,
          "X-Workspace-Id": "alpha",
        },
        body: JSON.stringify(config),
      },
      env,
    );
    expect(r.status).toBe(403);
  });
  it("does not permit demo writes", async () => {
    expect((await call("/demo/monitors", "POST", config)).status).toBe(403);
  });
  it("supports edit, pause, resume, manual queue, and delete", async () => {
    const create = await json(
        await call("/monitors", "POST", { ...config, name: "CRUD test" }),
      ),
      mid = create.data.id as string;
    expect(
      (await call(`/monitors/${mid}`, "PUT", { ...config, name: "Renamed" }))
        .status,
    ).toBe(200);
    expect(
      (await call(`/monitors/${mid}/state`, "PATCH", { paused: true })).status,
    ).toBe(200);
    expect((await json(await call(`/monitors/${mid}`))).data.status).toBe(
      "paused",
    );
    expect(
      (await call(`/monitors/${mid}/state`, "PATCH", { paused: false })).status,
    ).toBe(200);
    expect((await call(`/monitors/${mid}/check`, "POST", {})).status).toBe(202);
    expect((await call(`/monitors/${mid}/check`, "POST", {})).status).toBe(429);
    expect((await call(`/monitors/${mid}`, "DELETE", {})).status).toBe(200);
    expect((await call(`/monitors/${mid}`)).status).toBe(404);
  });
});
describe("monitoring persistence, leases, incidents and analytics", () => {
  it("handles failure and recovery thresholds with idempotent incidents", async () => {
    const monitor = await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    );
    expect(monitor).toBeTruthy();
    const mid = monitor!.id,
      at = now();
    for (let step = 0; step < 4; step++) {
      await run(
        db,
        "UPDATE monitors SET next_check=?,claim_until=NULL,claim_token=NULL WHERE id=?",
        at,
        mid,
      );
      await runMonitoring(env, at + step, async () => ({
        success: false,
        statusCode: 503,
        latency: 210,
        error: "Controlled 503",
      }));
    }
    expect(
      (await one<Monitor>(db, "SELECT * FROM monitors WHERE id=?", mid))!
        .status,
    ).toBe("down");
    expect(
      (
        await rows(
          db,
          "SELECT * FROM incidents WHERE monitor_id=? AND status!='resolved'",
          mid,
        )
      ).length,
    ).toBe(1);
    expect(
      (
        await rows(
          db,
          "SELECT * FROM notifications WHERE event_key LIKE 'incident.created:%'",
        )
      ).length,
    ).toBe(1);
    for (let step = 0; step < 2; step++) {
      await run(db, "UPDATE monitors SET next_check=? WHERE id=?", at, mid);
      await runMonitoring(env, at + 10 + step, async () => ({
        success: true,
        statusCode: 200,
        latency: 120,
        error: null,
      }));
      expect(
        (await one<Monitor>(db, "SELECT * FROM monitors WHERE id=?", mid))!
          .status,
      ).toBe(step === 0 ? "down" : "operational");
    }
    expect(
      (
        await rows(
          db,
          "SELECT * FROM incidents WHERE monitor_id=? AND status='resolved'",
          mid,
        )
      ).length,
    ).toBe(1);
    expect(
      (
        await rows(
          db,
          "SELECT * FROM notifications WHERE event_key LIKE 'incident.resolved:%'",
        )
      ).length,
    ).toBe(1);
    const a = await analytics(db, "alpha");
    expect(a.summary.total).toBe(6);
    expect(a.summary.successful).toBe(2);
    expect(a.summary.uptime).toBeCloseTo(100 / 3);
    expect(a.summary.p95).toBeNull();
  });
  it("prevents overlap from recording duplicate checks", async () => {
    const m = (await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    ))!;
    const at = now() + 30;
    await run(
      db,
      "UPDATE monitors SET next_check=?,claim_until=NULL,claim_token=NULL WHERE id=?",
      at,
      m.id,
    );
    let calls = 0;
    const probe = async () => {
      calls++;
      return { success: true, statusCode: 200, latency: 90, error: null };
    };
    const outcomes = await Promise.all([
      runMonitoring(env, at, probe),
      runMonitoring(env, at, probe),
    ]);
    expect(calls).toBe(1);
    expect(outcomes.reduce((n, o) => n + o.stored, 0)).toBe(1);
  });
  it("discards results with expired or superseded claim tokens", async () => {
    const m = (await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    ))!;
    expect(
      await persistMeasurement(db, m, "stale", {
        success: false,
        statusCode: 500,
        latency: 5,
        error: "stale",
      }),
    ).toBe(false);
  });
  it("never schedules synthetic demo monitors", async () => {
    await run(
      db,
      "INSERT INTO organizations(id,name,synthetic,created_at) VALUES ('demo','Demo',1,?)",
      now(),
    );
    await run(
      db,
      "INSERT INTO monitors(id,organization_id,name,url,next_check,created_at,updated_at) VALUES ('demo-monitor','demo','Synthetic','https://example.com',0,?,?)",
      now(),
      now(),
    );
    await run(
      db,
      "UPDATE monitors SET next_check=? WHERE organization_id!='demo'",
      now() + 9999,
    );
    const probe = vi.fn().mockResolvedValue({
      success: true,
      statusCode: 200,
      latency: 1,
      error: null,
    });
    expect((await runMonitoring(env, now(), probe)).claimed).toBe(0);
    expect(probe).not.toHaveBeenCalled();
  });
  it("claims abandoned work again after lease expiration", async () => {
    const m = (await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    ))!;
    await run(
      db,
      "UPDATE monitors SET next_check=0,claim_token='abandoned',claim_until=? WHERE id=?",
      now() - 1,
      m.id,
    );
    expect(
      (
        await runMonitoring(env, now(), async () => ({
          success: true,
          statusCode: 200,
          latency: 2,
          error: null,
        }))
      ).stored,
    ).toBe(1);
  });
  it("handles manual incidents and rejects invalid transitions", async () => {
    const result = await json(
      await call("/incidents", "POST", {
        title: "Manual incident",
        description: "Controlled incident",
        severity: "minor",
      }),
    );
    const iid = result.data.id;
    expect(
      (
        await call(`/incidents/${iid}`, "PATCH", {
          status: "monitoring",
          message: "Fix applied",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/incidents/${iid}`, "PATCH", {
          status: "resolved",
          message: "Recovery confirmed",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(`/incidents/${iid}`, "PATCH", {
          status: "investigating",
          message: "Reopen",
        })
      ).status,
    ).toBe(409);
  });
  it("applies retention repeatedly without breaking aggregates", async () => {
    await cleanup(db);
    await cleanup(db);
    expect((await analytics(db, "alpha")).summary.total).toBeGreaterThan(0);
  });
});
describe("public pages and safe channel delivery", () => {
  it("publishes only selected service summaries and hides private fields", async () => {
    const m = (await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    ))!;
    const response = await call("/status-pages", "POST", {
      title: "Alpha status",
      slug: "alpha-status",
      description: "Public summary",
      published: true,
      accent: "indigo",
      monitorIds: [m.id],
    });
    expect(response.status).toBe(201);
    const page = await call(
      "/public/status/alpha-status",
      "GET",
      undefined,
      "",
      "",
    );
    expect(page.status).toBe(200);
    const text = await page.text();
    expect(text).toContain("Alpha status");
    for (const field of [
      "https://example.com",
      "last_error",
      "organization_id",
      "encrypted_destination",
      "Controlled 503",
    ])
      expect(text).not.toContain(field);
  });
  it("rejects cross-tenant status-page associations", async () =>
    expect(
      (
        await call("/status-pages", "POST", {
          title: "Unsafe page",
          slug: "unsafe-page",
          published: true,
          monitorIds: ["foreign"],
        })
      ).status,
    ).toBe(404));
  it("returns 404 for unpublished pages", async () => {
    expect(
      (await call("/public/status/not-published", "GET", undefined, "", ""))
        .status,
    ).toBe(404);
  });
  it("stores channels encrypted and delivers an event only once", async () => {
    const dest =
      "https://discord.com/api/webhooks/123456789012345678/" + "a".repeat(70);
    await run(
      db,
      "INSERT INTO notification_channels(id,organization_id,name,kind,encrypted_destination,created_at) VALUES (?,?,?,?,?,?)",
      "discord",
      "alpha",
      "Engineering",
      "discord",
      await encrypt(dest, env.CHANNEL_ENCRYPTION_KEY!),
      now(),
    );
    await notify(
      db,
      "alpha",
      "unique-event",
      "Test event",
      "Controlled notification",
      "/settings",
    );
    await notify(
      db,
      "alpha",
      "unique-event",
      "Test event",
      "Controlled notification",
      "/settings",
    );
    expect(
      (
        await rows(
          db,
          "SELECT * FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE event_key='unique-event')",
        )
      ).length,
    ).toBe(1);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    expect((await deliverPending(env, fetcher)).sent).toBe(1);
    expect((await deliverPending(env, fetcher)).sent).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const channels = await (await call("/notification-channels")).text();
    expect(channels).not.toContain("encrypted_destination");
    expect(channels).not.toContain(dest);
  });
  it("records transient failure and retries later", async () => {
    await notify(
      db,
      "alpha",
      "retry-event",
      "Retry test",
      "Transient failure",
      "/settings",
    );
    const at = now(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await deliverPending(env, fetcher, at)).failed).toBe(1);
    expect((await deliverPending(env, fetcher, at)).sent).toBe(0);
    expect((await deliverPending(env, fetcher, at + 121)).sent).toBe(1);
  });
  it("does not retry permanent provider rejection", async () => {
    await notify(
      db,
      "alpha",
      "permanent-event",
      "Rejected test",
      "Permanent failure",
      "/settings",
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 404 }));
    expect((await deliverPending(env, fetcher)).failed).toBe(1);
    expect(
      (await one<{ status: string }>(
        db,
        "SELECT d.status FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.event_key='permanent-event'",
      ))!.status,
    ).toBe("failed");
  });
  it("marks notifications read for the current member only", async () => {
    expect((await call("/notifications/read", "POST", {})).status).toBe(200);
    const own = await json(await call("/notifications"));
    expect(JSON.stringify(own)).toContain('"read":1');
    expect(
      (await one<{ n: number }>(
        db,
        "SELECT COUNT(*) n FROM notification_reads WHERE user_id='viewer'",
      ))!.n,
    ).toBe(0);
  });
});

describe("additional lifecycle and quota checks", () => {
  it("updates, unpublishes, republishes, and deletes a status page", async () => {
    const page = await one<{ id: string }>(
      db,
      "SELECT id FROM status_pages WHERE slug='alpha-status'",
    );
    const m = (await one<Monitor>(
      db,
      "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
    ))!;
    const body = {
      title: "Updated status",
      slug: "alpha-status",
      description: "Public",
      published: false,
      accent: "blue",
      monitorIds: [m.id],
    };
    expect((await call(`/status-pages/${page!.id}`, "PUT", body)).status).toBe(
      200,
    );
    expect(
      (await call("/public/status/alpha-status", "GET", undefined, "", ""))
        .status,
    ).toBe(404);
    expect(
      (
        await call(`/status-pages/${page!.id}`, "PUT", {
          ...body,
          published: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("/public/status/alpha-status", "GET", undefined, "", ""))
        .status,
    ).toBe(200);
    expect((await call(`/status-pages/${page!.id}`, "DELETE", {})).status).toBe(
      200,
    );
  });
  it("supports secure invitations, email binding, consumption, and member administration", async () => {
    const response = await json(
      await call("/workspaces/alpha/invitations", "POST", {
        email: "bob@example.com",
        role: "viewer",
      }),
    );
    expect(response.data.url).toBeTypeOf("string");
    const token = String(response.data.url).split("/").at(-1)!;
    expect(
      (
        await call(
          "/workspaces/accept-invitation",
          "POST",
          { token },
          "alpha",
          viewerCookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/workspaces/accept-invitation",
          "POST",
          { token },
          "alpha",
          await signedCookie("bob-session"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/workspaces/accept-invitation",
          "POST",
          { token },
          "alpha",
          await signedCookie("bob-session"),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await call(
          "/monitors",
          "GET",
          undefined,
          "alpha",
          await signedCookie("bob-session"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/workspaces/alpha/members/member", "PATCH", {
          role: "admin",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("/workspaces/alpha/members/alice", "DELETE", {})).status,
    ).toBe(403);
    expect(
      (
        await call("/workspaces/alpha/members/member", "PATCH", {
          role: "member",
        })
      ).status,
    ).toBe(200);
  });
  it("enforces active monitor capacity and allows a paused slot to be reused", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const result = await json(
        await call("/monitors", "POST", { ...config, name: `Capacity ${i}` }),
      );
      ids.push(result.data.id as string);
    }
    expect(
      (await call("/monitors", "POST", { ...config, name: "Over limit" }))
        .status,
    ).toBe(409);
    expect(
      (await call(`/monitors/${ids[0]}/state`, "PATCH", { paused: true }))
        .status,
    ).toBe(200);
    expect(
      (await call(`/monitors/${ids[0]}/state`, "PATCH", { paused: false }))
        .status,
    ).toBe(200);
    for (const mid of ids) await call(`/monitors/${mid}`, "DELETE", {});
  });
  it("uses notification preferences for newly arriving in-app updates", async () => {
    expect(
      (
        await call("/workspaces/alpha/preferences", "PATCH", {
          notifications: false,
        })
      ).status,
    ).toBe(200);
    await notify(
      db,
      "alpha",
      "muted-event",
      "Muted event",
      "Still available in history",
      "/settings",
    );
    const read = await one(
      db,
      "SELECT r.notification_id FROM notification_reads r JOIN notifications n ON n.id=r.notification_id WHERE n.event_key='muted-event' AND r.user_id='alice'",
    );
    expect(read).toBeTruthy();
    await call("/workspaces/alpha/preferences", "PATCH", {
      notifications: true,
    });
  });
  it("runs the exported scheduled handler with controlled external boundaries", async () => {
    const at = now(),
      m = (await one<Monitor>(
        db,
        "SELECT * FROM monitors WHERE organization_id='alpha' LIMIT 1",
      ))!;
    await run(
      db,
      "UPDATE monitors SET next_check=0,claim_until=NULL,claim_token=NULL WHERE id=?",
      m.id,
    );
    await run(
      db,
      "UPDATE monitors SET next_check=? WHERE id!=?",
      at + 9999,
      m.id,
    );
    const before = await one<{ n: number }>(
      db,
      "SELECT COUNT(*) n FROM monitor_checks WHERE monitor_id=?",
      m.id,
    );
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input) =>
      String(input).includes("cloudflare-dns.com")
        ? new Response(
            JSON.stringify({
              Status: 0,
              Answer: [{ type: 1, data: "1.1.1.1" }],
            }),
          )
        : new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    try {
      await worker.scheduled(
        {
          scheduledTime: Date.now(),
          cron: "* * * * *",
          noRetry() {},
        } as ScheduledController,
        env,
        {} as ExecutionContext,
      );
    } finally {
      vi.unstubAllGlobals();
    }
    expect(
      (await one<{ n: number }>(
        db,
        "SELECT COUNT(*) n FROM monitor_checks WHERE monitor_id=?",
        m.id,
      ))!.n,
    ).toBe(before!.n + 1);
    expect(
      fetcher.mock.calls.some(
        (call) => String(call[0]) === "https://example.com/health",
      ),
    ).toBe(true);
  });
  it("rejects expired sessions and signs out through Better Auth", async () => {
    await run(
      db,
      "UPDATE session SET expires_at=? WHERE user_id='viewer'",
      Date.now() - 1000,
    );
    expect(
      (await call("/monitors", "GET", undefined, "alpha", viewerCookie)).status,
    ).toBe(401);
    expect(
      (await call("/auth/sign-out", "POST", {}, "alpha", memberCookie)).status,
    ).toBe(200);
    expect(
      (await call("/monitors", "GET", undefined, "alpha", memberCookie)).status,
    ).toBe(401);
  });
  it("retains a clearly synthetic snapshot while expiring real raw measurements", async () => {
    const at = now() - 180 * 86400;
    await run(
      db,
      "UPDATE monitors SET last_checked=?,status='operational' WHERE id='demo-monitor'",
      at,
    );
    await run(
      db,
      "INSERT INTO monitor_checks(id,monitor_id,checked_at,success,status_code,latency,synthetic) VALUES ('old-demo','demo-monitor',?,1,200,12,1)",
      at,
    );
    await run(
      db,
      "INSERT INTO monitor_aggregates(monitor_id,period,bucket,total,successful,latency_sum,latency_min,latency_max) VALUES ('demo-monitor','hour',?,1,1,12,12,12)",
      Math.floor(at / 3600) * 3600,
    );
    await run(
      db,
      "INSERT INTO monitor_checks(id,monitor_id,checked_at,success,status_code,latency,synthetic) VALUES ('expired-real','foreign',?,1,200,12,0)",
      at,
    );
    await cleanup(db);
    expect(
      await one(db, "SELECT id FROM monitor_checks WHERE id='old-demo'"),
    ).toBeTruthy();
    expect(
      await one(db, "SELECT id FROM monitor_checks WHERE id='expired-real'"),
    ).toBeNull();
    expect((await analytics(db, "demo")).summary.total).toBe(1);
    expect(
      (
        await call(
          "/demo/monitors?status=operational",
          "GET",
          undefined,
          "",
          "",
        )
      ).status,
    ).toBe(200);
  });
});
