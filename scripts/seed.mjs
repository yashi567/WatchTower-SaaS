import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { demoSQL } from "./demo-data.mjs";
mkdirSync(".wrangler", { recursive: true });
writeFileSync(".wrangler/demo.sql", demoSQL());
const result = spawnSync(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "execute",
    "DB",
    "--local",
    "--file=.wrangler/demo.sql",
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (result.status === 0)
  console.log(
    "Seeded local synthetic demo: 5 services, 24h raw checks, 30 days of illustrative aggregates, incidents, and /status/acme. Real workspaces were not changed.",
  );
else console.error(result.stderr || result.stdout || result.error?.message);
process.exit(result.status ?? 1);
