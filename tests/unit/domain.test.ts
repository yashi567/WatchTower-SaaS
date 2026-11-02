import { describe, it, expect, vi } from "vitest";
import {
  validateTarget,
  publicIPv4,
  publicIPv6,
  validateDNS,
  validateDiscord,
} from "../../worker/monitoring/security";
import {
  transition,
  uptime,
  percentile,
  nextCheck,
  canTransition,
} from "../../worker/monitoring/state";
import { allowed } from "../../worker/middleware/access";
import { measure } from "../../worker/monitoring/engine";
import { encrypt, decrypt } from "../../worker/notifications/delivery";
import { capacityLimits } from "../../worker/services/capacity";
import { publicMonitor } from "../../worker/api/read";
import type { Monitor } from "../../shared/types";
describe("outbound URL safety", () => {
  it.each([
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "http://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://2130706433",
    "https://0x7f000001",
    "https://0177.0.0.1",
    "https://example.com:8080",
    "https://example.com./",
    "https://evil.local",
    "http://169.254.169.254",
    "https://example.com/#secret",
    "https://unapproved.example.org",
  ])("rejects %s", (raw) =>
    expect(() => validateTarget(raw, "example.com")).toThrow(),
  );
  it("allows only exact operator-approved public DNS names", () => {
    expect(
      validateTarget("https://example.com/health?q=1", "example.com").hostname,
    ).toBe("example.com");
    expect(() =>
      validateTarget("https://sub.example.com", "example.com"),
    ).toThrow();
  });
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "127.1.2.3",
    "169.254.0.1",
    "172.16.1.2",
    "192.168.1.2",
    "100.64.0.1",
    "198.18.0.1",
    "192.0.2.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "255.255.255.255",
  ])("rejects non-public IPv4 %s", (ip) => expect(publicIPv4(ip)).toBe(false));
  it("accepts public addresses and rejects private/mapped IPv6", () => {
    expect(publicIPv4("1.1.1.1")).toBe(true);
    expect(publicIPv6("2606:4700:4700::1111")).toBe(true);
    for (const ip of [
      "::1",
      "fc00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "2001:db8::1",
      "2002:7f00:1::",
    ])
      expect(publicIPv6(ip)).toBe(false);
  });
  it("rejects mixed public and private DNS answers", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            Status: 0,
            Answer: [
              { type: 1, data: "1.1.1.1" },
              { type: 1, data: "10.0.0.1" },
            ],
          }),
        ),
    );
    await expect(validateDNS("example.com", fetcher)).rejects.toThrow(
      "non-public",
    );
  });
  it("fails closed when DNS has no addresses", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify({ Status: 0 })),
      );
    await expect(validateDNS("example.com", fetcher)).rejects.toThrow();
  });
  it("strictly validates Discord destinations", () => {
    const valid =
      "https://discord.com/api/webhooks/123456789012345678/AbcDef_" +
      "x".repeat(60);
    expect(validateDiscord(valid)).toBe(valid);
    for (const bad of [
      valid.replace("discord.com", "discord.com.evil.com"),
      valid + "?secret=x",
      valid.replace("https:", "http:"),
    ])
      expect(() => validateDiscord(bad)).toThrow();
  });
});
describe("monitor and incident state machines", () => {
  it.each([
    ["3", "100", "100", 2, 5, 10],
    ["1", "5", "25", 1, 5, 5],
    ["invalid", "-1", "0", 2, 5, 10],
  ])(
    "clamps configuration %s/%s/%s to an effective free-tier envelope",
    (
      batch,
      workspace,
      global,
      expectedBatch,
      expectedWorkspace,
      expectedGlobal,
    ) => {
      expect(
        capacityLimits({
          CHECK_BATCH_SIZE: String(batch),
          MAX_WORKSPACE_MONITORS: String(workspace),
          MAX_GLOBAL_MONITORS: String(global),
        }),
      ).toEqual({
        batch: expectedBatch,
        workspace: expectedWorkspace,
        global: expectedGlobal,
      });
    },
  );
  it("presents stale real checks as unknown while keeping resumed monitors pending and demo snapshots explicit", () => {
    const old = {
      status: "operational",
      last_checked: 1,
      interval: 300,
    } as Monitor;
    expect(publicMonitor(old).status).toBe("unknown");
    expect(publicMonitor({ ...old, status: "pending" }).status).toBe("pending");
    expect(publicMonitor(old, true).status).toBe("operational");
  });
  it("degrades below threshold and goes down at threshold", () => {
    expect(transition("operational", false, 0, 5, 3, 2)).toEqual({
      status: "degraded",
      failures: 1,
      successes: 0,
    });
    expect(transition("degraded", false, 2, 0, 3, 2).status).toBe("down");
  });
  it("requires consecutive recovery successes", () => {
    expect(transition("down", true, 3, 0, 3, 2).status).toBe("down");
    expect(transition("down", true, 0, 1, 3, 2).status).toBe("operational");
    expect(transition("down", false, 0, 1, 3, 2).successes).toBe(0);
  });
  it("leaves paused monitors untouched", () =>
    expect(transition("paused", false, 0, 0, 3, 2).status).toBe("paused"));
  it("uses a five-minute scheduling floor", () => {
    expect(nextCheck(1000, 60)).toBe(1300);
    expect(nextCheck(1000, 900)).toBe(1900);
  });
  it("does not count unavailable data as uptime", () => {
    expect(uptime(0, 0)).toBeNull();
    expect(uptime(9, 10)).toBe(90);
  });
  it("calculates nearest-rank latencies", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(percentile([], 0.95)).toBeNull();
  });
  it("allows recovery transitions and rejects reopening resolved incidents", () => {
    expect(canTransition("investigating", "identified")).toBe(true);
    expect(canTransition("monitoring", "resolved")).toBe(true);
    expect(canTransition("resolved", "investigating")).toBe(false);
    expect(canTransition("identified", "investigating")).toBe(false);
  });
  it("enforces explicit role permissions", () => {
    expect(allowed("viewer", "read")).toBe(true);
    expect(allowed("viewer", "operate")).toBe(false);
    expect(allowed("member", "operate")).toBe(true);
    expect(allowed("member", "manage")).toBe(false);
    expect(allowed("admin", "manage")).toBe(true);
    expect(allowed("admin", "own")).toBe(false);
    expect(allowed("owner", "own")).toBe(true);
  });
});
describe("bounded measurement requests", () => {
  const m = {
    url: "https://example.com/health",
    method: "GET",
    timeout: 1000,
    expected_min: 200,
    expected_max: 299,
  } as Monitor;
  it("records real HTTP response outcomes through a controlled fetch boundary", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const result = await measure(m, "example.com", fetcher, async () => {});
    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("does not follow redirects", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1" },
      }),
    );
    expect(
      (await measure(m, "example.com", fetcher, async () => {})).error,
    ).toContain("Redirect not followed");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("records a timeout as failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    expect(
      (await measure(m, "example.com", fetcher, async () => {})).error,
    ).toBe("Request timed out");
  });
  it("never fetches an unapproved destination", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      (await measure(m, "different.example", fetcher, async () => {})).success,
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe("encrypted secrets", () => {
  it("round trips AES-GCM ciphertext without exposing plaintext", async () => {
    const key = btoa("x".repeat(32)),
      secret = "sensitive-discord-token";
    const value = await encrypt(secret, key);
    expect(value).not.toContain(secret);
    expect(await decrypt(value, key)).toBe(secret);
    await expect(decrypt(value, btoa("y".repeat(32)))).rejects.toThrow();
  });
});
