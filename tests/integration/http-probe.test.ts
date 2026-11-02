import { createServer, type Server } from "node:http";
import { beforeAll, afterAll, it, expect } from "vitest";
import { measure } from "../../worker/monitoring/engine";
import type { Monitor } from "../../shared/types";
let server: Server, origin: string;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/slow") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("late");
      }, 1400);
      return;
    }
    res.writeHead(req.url === "/failed" ? 503 : 200);
    res.end(req.method === "HEAD" ? undefined : "controlled local response");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Missing test listener");
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
it("performs actual HTTP GET and HEAD requests against a controlled local fixture", async () => {
  for (const method of ["GET", "HEAD"] as const) {
    const m = {
      url: "https://controlled.example.com/ok",
      method,
      timeout: 1000,
      expected_min: 200,
      expected_max: 299,
    } as Monitor;
    const fetcher: typeof fetch = (input, init) =>
      fetch(origin + new URL(String(input)).pathname, init);
    const result = await measure(
      m,
      "controlled.example.com",
      fetcher,
      async () => {},
    );
    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latency).toBeGreaterThanOrEqual(0);
  }
});
it("records actual HTTP failure and aborts a slow fixture request", async () => {
  const base = {
    url: "https://controlled.example.com/failed",
    method: "GET",
    timeout: 1000,
    expected_min: 200,
    expected_max: 299,
  } as Monitor;
  const fetcher: typeof fetch = (input, init) =>
    fetch(origin + new URL(String(input)).pathname, init);
  expect(
    (await measure(base, "controlled.example.com", fetcher, async () => {}))
      .statusCode,
  ).toBe(503);
  const result = await measure(
    { ...base, url: "https://controlled.example.com/slow" },
    "controlled.example.com",
    fetcher,
    async () => {},
  );
  expect(result.success).toBe(false);
  expect(result.error).toBe("Request timed out");
});
