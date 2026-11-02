import { readFileSync } from "node:fs";
const workerName =
  process.env.WORKER_NAME ??
  readFileSync("wrangler.jsonc", "utf8").match(/"name"\s*:\s*"([^"]+)"/)?.[1] ??
  "watchtower";
const url =
  process.env.SCHEDULED_URL ??
  `http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=${encodeURIComponent(workerName)}`;
const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ cron: "* * * * *" }),
});
console.log(response.status, await response.text());
if (!response.ok) process.exitCode = 1;
