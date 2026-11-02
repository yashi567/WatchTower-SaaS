import { useState } from "react";
import {
  Activity,
  CheckCheck,
  Timer,
  ShieldCheck,
  ArrowDownRight,
} from "lucide-react";
import type { Analytics as AnalyticsData, Monitor } from "../../shared/types";
import { useProduct } from "@/lib/context";
import { useApi } from "@/lib/api";
import { percent, ms, duration, date } from "@/lib/utils";
import { PageHead, Panel, Loading, Failure, Empty } from "@/components/common";
import { TrendChart, ServiceChart } from "@/components/charts";
export function Analytics() {
  const { demo, workspace } = useProduct();
  const [range, setRange] = useState("24h"),
    [monitor, setMonitor] = useState("");
  const data = useApi<AnalyticsData>(
      `/analytics/overview?range=${range}${monitor ? `&monitorId=${monitor}` : ""}`,
      demo,
      workspace?.id,
    ),
    monitors = useApi<Monitor[]>("/monitors", demo, workspace?.id);
  if (data.isPending) return <Loading />;
  if (data.error)
    return <Failure error={data.error} retry={() => void data.refetch()} />;
  const a = data.data!.data,
    s = a.summary;
  return (
    <>
      <PageHead
        eyebrow="RELIABILITY, IN PERSPECTIVE"
        title="Analytics"
        description="Find the patterns behind your service performance."
      >
        <select
          aria-label="Filter analytics by monitor"
          value={monitor}
          onChange={(e) => setMonitor(e.target.value)}
        >
          <option value="">All services</option>
          {monitors.data?.data.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Analytics time range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </PageHead>
      <div className="metric-grid">
        {[
          {
            label: "Availability",
            value: percent(s.uptime),
            foot: "Successful / measured checks",
            Icon: ShieldCheck,
          },
          {
            label: "Average latency",
            value: ms(s.average),
            foot: `p50 ${ms(s.p50)} · p95 ${ms(s.p95)}`,
            Icon: Timer,
          },
          {
            label: "Successful checks",
            value: s.successful.toLocaleString(),
            foot: `${(s.total - s.successful).toLocaleString()} failed checks`,
            Icon: CheckCheck,
          },
          {
            label: "Mean time to recovery",
            value: duration(s.mttr),
            foot: `${s.incidents} incidents in this window`,
            Icon: Activity,
          },
        ].map(({ label, value, foot, Icon }) => (
          <div className="metric-card" key={label}>
            <div className="metric-label">
              {label}
              <Icon size={15} />
            </div>
            <div className="metric-value">{value}</div>
            <div className="metric-foot muted">{foot}</div>
          </div>
        ))}
      </div>
      <div className="two-columns">
        <Panel
          title="Availability over time"
          subtitle="Percentage of successful checks per bucket"
        >
          <div className="chart-pad">
            <TrendChart data={a.series} kind="uptime" />
          </div>
        </Panel>
        <Panel
          title="Response time trend"
          subtitle="Mean time until HTTP response headers arrive"
        >
          <div className="chart-pad">
            <TrendChart data={a.series} />
          </div>
        </Panel>
      </div>
      <div className="two-columns">
        <Panel
          title="Service comparison"
          subtitle="Average response latency in milliseconds"
        >
          <ServiceChart data={a.services} />
        </Panel>
        <Panel
          title="Reliability breakdown"
          subtitle="Each service contributes its actual measurements"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Uptime</th>
                  <th>Avg. latency</th>
                  <th>Checks</th>
                </tr>
              </thead>
              <tbody>
                {a.services.map((service) => (
                  <tr key={service.id}>
                    <td>{service.name}</td>
                    <td className="green mono">{percent(service.uptime)}</td>
                    <td className="mono">{ms(service.average)}</td>
                    <td className="muted mono">
                      {service.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!a.services.length && <Empty title="No services to compare" />}
          </div>
        </Panel>
      </div>
      <Panel
        title="Understanding these numbers"
        action={<ArrowDownRight size={17} className="muted" />}
      >
        <div className="methodology">
          <div>
            <h3>Measurements, not promises</h3>
            <p>
              Availability is successful checks divided by completed checks.
              Unmeasured time is excluded. A five-minute interval can miss
              shorter outages and is not an SLA.
            </p>
          </div>
          <div>
            <h3>History with a clear boundary</h3>
            <p>
              Raw checks: 7 days. Hourly aggregates: 30 days. Daily aggregates:
              90 days. Percentiles require at least 20 raw checks and are
              available only for windows up to 7 days.
            </p>
          </div>
          <div>
            <h3>A useful recovery metric</h3>
            <p>
              MTTR is the mean duration of resolved incidents started in this
              window. Open incidents are excluded. Current range starts{" "}
              {date(a.since)}.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
