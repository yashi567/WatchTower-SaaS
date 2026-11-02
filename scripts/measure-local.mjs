import { mkdirSync, writeFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readdirSync, readFileSync } from "node:fs";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script: 'export default {fetch(){return new Response("fixture")}}',
    compatibilityDate: "2026-11-01",
    d1Databases: ["DB"],
  }),
);
try {
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync("migrations/" + file, "utf8").replace(
      /^--.*$/gm,
      "",
    );
    for (const statement of sql.match(
      /\s*CREATE TRIGGER[\s\S]*?END;|[^;]+;/g,
    ) ?? [])
      await db.prepare(statement).run();
  }
  const at = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      "INSERT INTO organizations(id,name,created_at) VALUES ('fixture','Fixture',?)",
    )
    .bind(at)
    .run();
  await db
    .prepare(
      "INSERT INTO monitors(id,organization_id,name,url,next_check,created_at,updated_at) VALUES ('probe','fixture','Probe','https://example.com',?,?,?)",
    )
    .bind(at, at, at)
    .run();
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const success = i >= 3;
    const start = performance.now();
    const result = await db
      .prepare(
        "INSERT INTO monitor_checks(id,monitor_id,checked_at,success,status_code,latency,error) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        "sample-" + i,
        "probe",
        at + i * 300,
        +success,
        success ? 200 : 503,
        100,
        success ? null : "Controlled HTTP 503",
      )
      .run();
    samples.push({
      scenario:
        i === 2
          ? "failure threshold / incident"
          : i === 4
            ? "recovery threshold / resolution"
            : success
              ? "successful check"
              : "failed check",
      wallClockMs: Math.round((performance.now() - start) * 100) / 100,
      ...result.meta,
    });
  }
  const report = {
    measuredAt: new Date().toISOString(),
    runtime: "Local Miniflare/workerd D1",
    note: "Local D1 operation metadata and wall time only. Not Cloudflare billable CPU or production capacity certification. No outbound requests in this measurement.",
    samples,
  };
  mkdirSync("docs/measurements", { recursive: true });
  writeFileSync(
    "docs/measurements/local-d1.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await mf.dispose();
}
