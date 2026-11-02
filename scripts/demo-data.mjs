const q = (v) =>
  v === null
    ? "NULL"
    : typeof v === "number"
      ? String(v)
      : `'${String(v).replaceAll("'", "''")}'`;
export function demoSQL(at = Math.floor(Date.now() / 1000)) {
  const statements = [
    "DELETE FROM organizations WHERE id='demo';",
    `INSERT INTO organizations(id,name,synthetic,created_at) VALUES('demo','Acme Engineering',1,${at - 35 * 86400});`,
  ];
  const services = [
    [
      "demo-api",
      "Production API",
      "https://api.acme.example/health",
      142,
      "operational",
      "api,production",
    ],
    [
      "demo-web",
      "Web application",
      "https://acme.example",
      87,
      "operational",
      "web,production",
    ],
    [
      "demo-payments",
      "Payment gateway",
      "https://payments.acme.example/health",
      1284,
      "down",
      "payments,critical",
    ],
    [
      "demo-auth",
      "Authentication",
      "https://auth.acme.example/health",
      213,
      "operational",
      "auth,production",
    ],
    [
      "demo-cdn",
      "Asset delivery",
      "https://cdn.acme.example",
      46,
      "operational",
      "cdn,edge",
    ],
  ];
  services.forEach(([mid, name, url, latency, status, tags], index) => {
    statements.push(
      `INSERT INTO monitors(id,organization_id,name,url,status,latency,last_checked,last_error,next_check,tags,created_at,updated_at) VALUES(${q(mid)},'demo',${q(name)},${q(url)},${q(status)},${latency},${at - 35},${q(status === "down" ? "Unexpected HTTP 503" : null)},${at + 265},${q(JSON.stringify(tags.split(",")))},${at - 35 * 86400},${at - 35});`,
    );
    for (let n = 0; n < 288; n++) {
      const t = at - n * 300 - 35;
      const failed = index === 2 && (n < 4 || (n >= 85 && n < 88));
      const ms = Math.round(
        latency * (index === 2 && n > 4 ? 0.19 : 1) +
          Math.sin(n * 1.6 + index) * 18 +
          Math.cos(n * 0.2) * 12,
      );
      statements.push(
        `INSERT INTO monitor_checks(id,monitor_id,checked_at,success,status_code,latency,error,synthetic) VALUES(${q(`${mid}-${n}`)},${q(mid)},${t},${failed ? 0 : 1},${failed ? 503 : 200},${ms},${q(failed ? "Unexpected HTTP 503" : null)},1);`,
      );
    }
    for (let h = 0; h < 720; h++) {
      const bucket = Math.floor(at / 3600) * 3600 - h * 3600;
      const failures = index === 2 && (h === 0 || h === 7) ? 2 : 0;
      const average = Math.round(
        (index === 2 ? 240 : latency) +
          Math.sin(h * 0.7 + index) * 17 +
          Math.cos(h * 0.18) * 11,
      );
      statements.push(
        `INSERT INTO monitor_aggregates(monitor_id,period,bucket,total,successful,latency_sum,latency_min,latency_max) VALUES(${q(mid)},'hour',${bucket},12,${12 - failures},${average * 12},${average - 20},${average + 40});`,
      );
    }
    for (let d = 0; d < 30; d++) {
      const bucket = Math.floor(at / 86400) * 86400 - d * 86400;
      const failures = index === 2 && (d === 0 || d === 12) ? 4 : 0;
      statements.push(
        `INSERT INTO monitor_aggregates(monitor_id,period,bucket,total,successful,latency_sum,latency_min,latency_max) VALUES(${q(mid)},'day',${bucket},288,${288 - failures},${(index === 2 ? 240 : latency) * 288},40,1284);`,
      );
    }
  });
  const incidents = [
    [
      "demo-payment-outage",
      "demo-payments",
      "Elevated errors on payment gateway",
      "investigating",
      "critical",
      at - 21 * 60,
      null,
    ],
    [
      "demo-api-incident",
      "demo-api",
      "Increased API response times",
      "resolved",
      "minor",
      at - 27 * 3600,
      at - 27 * 3600 + 720,
    ],
    [
      "demo-auth-incident",
      "demo-auth",
      "Authentication requests intermittently failing",
      "resolved",
      "major",
      at - 3 * 86400,
      at - 3 * 86400 + 1500,
    ],
  ];
  incidents.forEach(([iid, mid, title, status, severity, start, end]) => {
    statements.push(
      `INSERT INTO incidents(id,organization_id,monitor_id,title,description,status,severity,source,started_at,resolved_at) VALUES(${q(iid)},'demo',${q(mid)},${q(title)},'Synthetic scenario for exploring the incident workflow.',${q(status)},${q(severity)},'manual',${start},${q(end)});`,
    );
    statements.push(
      `INSERT INTO incident_events(id,incident_id,status,message,created_at) VALUES(${q(iid + "-update")},${q(iid)},${q(status)},${q(status === "resolved" ? "Service recovered and all checks are passing." : "Our team is investigating elevated errors from the upstream payment processor.")},${end ?? start + 300});`,
    );
  });
  statements.push(
    `INSERT INTO status_pages(id,organization_id,title,slug,description,published,accent,created_at) VALUES('demo-status','demo','Acme system status','acme','Real-time service availability and incident updates. This is a synthetic demonstration.',1,'indigo',${at - 30 * 86400});`,
  );
  services.forEach(([mid], i) =>
    statements.push(
      `INSERT INTO status_page_monitors(page_id,monitor_id,position) VALUES('demo-status',${q(mid)},${i});`,
    ),
  );
  statements.push(
    `INSERT INTO notifications(id,organization_id,event_key,title,message,link,created_at) VALUES('demo-notice','demo','demo:welcome','Welcome to your observability workspace','Explore five synthetic services, investigate incidents, and inspect thirty days of illustrative metrics.','/overview',${at - 3600});`,
  );
  return statements.join("\n");
}
