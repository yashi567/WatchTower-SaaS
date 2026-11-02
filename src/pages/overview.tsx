import { Link } from "react-router-dom";
import { useState } from "react";
import {
  Plus,
  ArrowUpRight,
  CheckCheck,
  ArrowRight,
  Timer,
  Radio,
  Activity,
  TriangleAlert,
  ShieldCheck,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import { useProduct } from "@/lib/context";
import { useApi } from "@/lib/api";
import { percent, ms, relative, date, duration } from "@/lib/utils";
import {
  PageHead,
  Panel,
  Status,
  Loading,
  Failure,
  Empty,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { TrendChart } from "@/components/charts";
import { MonitorDialog } from "./monitors";
import type { Analytics, Monitor, Incident, Check } from "../../shared/types";
export function Overview() {
  const { demo, workspace } = useProduct(),
    base = demo ? "/demo" : "/app";
  const [create, setCreate] = useState(false),
    [range, setRange] = useState("24h");
  const stats = useApi<Analytics>(
      `/analytics/overview?range=${range}`,
      demo,
      workspace?.id,
    ),
    monitors = useApi<Monitor[]>("/monitors?sort=name", demo, workspace?.id),
    incidents = useApi<Incident[]>("/incidents", demo, workspace?.id);
  const recentChecks = useApi<(Check & { monitor_name: string })[]>(
    "/checks/recent",
    demo,
    workspace?.id,
  );
  if (stats.isPending || monitors.isPending || incidents.isPending)
    return <Loading />;
  const error = stats.error ?? monitors.error ?? incidents.error;
  if (error)
    return (
      <Failure
        error={error}
        retry={() => {
          void stats.refetch();
          void monitors.refetch();
          void incidents.refetch();
        }}
      />
    );
  const data = stats.data!.data,
    services = monitors.data!.data,
    events = incidents.data!.data,
    down = services.filter((m) => m.status === "down"),
    active = events.filter((i) => i.status !== "resolved"),
    healthy = services.filter((m) => m.status === "operational");
  const affected = services.filter((m) =>
    ["down", "degraded"].includes(m.status),
  );
  const metrics = [
    {
      label: "Overall uptime",
      value: percent(data.summary.uptime),
      foot: "Across measured checks",
      Icon: ShieldCheck,
      color: "green",
    },
    {
      label: "Active monitors",
      value: String(
        services.filter((m) => m.status !== "paused").length,
      ).padStart(2, "0"),
      foot: `${healthy.length} operational · ${down.length} down`,
      Icon: Radio,
      color: "indigo",
    },
    {
      label: "Avg. response time",
      value: ms(data.summary.average),
      foot: "Across recorded check durations",
      Icon: Timer,
      color: "indigo",
    },
    {
      label: "Active incidents",
      value: String(active.length).padStart(2, "0"),
      foot: active.length ? "Requires your attention" : "Everything looks good",
      Icon: TriangleAlert,
      color: active.length ? "amber" : "green",
    },
  ];
  return (
    <>
      <PageHead
        eyebrow="YOUR RELIABILITY AT A GLANCE"
        title="Overview"
        description="A little visibility. A lot more peace of mind."
      >
        <Button
          variant="outline"
          onClick={() => {
            void stats.refetch();
            void monitors.refetch();
          }}
          aria-label="Refresh dashboard"
        >
          <RefreshCw size={14} />
        </Button>
        <select
          aria-label="Dashboard time range"
          value={range}
          onChange={(e) => setRange(e.target.value)}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <Button onClick={() => setCreate(true)}>
          <Plus size={15} /> Add monitor
        </Button>
      </PageHead>
      <div className={`health-banner ${affected.length ? "has-issue" : ""}`}>
        <div className="health-banner-icon">
          {affected.length ? <Activity size={21} /> : <CheckCheck size={21} />}
        </div>
        <div>
          <strong>
            {affected.length
              ? `${healthy.length} services operational. ${affected.length} ${affected.length === 1 ? "needs" : "need"} attention.`
              : services.length
                ? healthy.length === services.length
                  ? "All systems are looking good."
                  : `${healthy.length} operational. Waiting for fresh service signals.`
                : "Ready when you are."}
          </strong>
          <p>
            {affected.length
              ? "We’re keeping an eye on your services. Review the affected monitors for the latest signals."
              : services.length
                ? healthy.length === services.length
                  ? "Your services are being watched, so you can focus on what’s next."
                  : "Pending, paused, and stale checks are never presented as healthy measurements."
                : "Add your first monitor to start collecting real availability data."}
          </p>
        </div>
        <Link to={`${base}/${active.length ? "incidents" : "monitors"}`}>
          {active.length ? "View incident" : "View monitors"}
          <ArrowRight size={14} />
        </Link>
      </div>
      <div className="metric-grid">
        {metrics.map(({ label, value, foot, Icon, color }) => (
          <div className="metric-card" key={label}>
            <div className="metric-label">
              {label}
              <Icon size={15} />
            </div>
            <div className="metric-value">{value}</div>
            <div className={`metric-foot ${color}`}>
              <span className="tiny-live" />
              {foot}
            </div>
          </div>
        ))}
      </div>
      <div className="overview-charts">
        <Panel
          title="Response time"
          subtitle="A clear picture of your service performance"
          action={
            <span className="chart-key">
              <i /> Average response
            </span>
          }
        >
          <div className="chart-summary">
            <strong>{ms(data.summary.average)}</strong>
            <span>
              average <span className="chart-summary-divider">/</span>
              <span className="muted">p95</span> {ms(data.summary.p95)}
            </span>
          </div>
          <div className="chart-pad">
            <TrendChart data={data.series} />
          </div>
        </Panel>
        <Panel
          title="Service health"
          subtitle="The state of your stack, right now"
          action={<Radio size={16} className="muted" />}
        >
          <div className="health-summary">
            <span className="health-total">
              {services.length}
              <small>total services</small>
            </span>
            <div>
              <span>
                <i className="dot green-bg" />
                Operational <b>{healthy.length}</b>
              </span>
              <span>
                <i className="dot red-bg" />
                Down <b>{down.length}</b>
              </span>
              <span>
                <i className="dot neutral-bg" />
                Other <b>{services.length - healthy.length - down.length}</b>
              </span>
            </div>
          </div>
          <div className="health-segment-bar">
            {services.map((m) => (
              <span
                title={`${m.name}: ${m.status}`}
                className={`segment-${m.status}`}
                key={m.id}
              />
            ))}
          </div>
          <div className="service-list">
            {services.slice(0, 5).map((m) => (
              <Link to={`${base}/monitors/${m.id}`} key={m.id}>
                <span className={`service-light ${m.status}`} />
                <span>{m.name}</span>
                <span className={m.status === "down" ? "red" : "muted"}>
                  {ms(m.latency)}
                </span>
                <ArrowUpRight size={13} />
              </Link>
            ))}
            {!services.length && <Empty title="Your services belong here" />}
          </div>
        </Panel>
      </div>
      <Panel
        title="Monitored services"
        subtitle="Small signals. The full picture."
        action={
          <Link className="text-link" to={`${base}/monitors`}>
            All monitors
            <ArrowUpRight size={14} />
          </Link>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Service</th>
                <th>Status</th>
                <th>
                  Availability <span className="muted">24h</span>
                </th>
                <th>Response time</th>
                <th>Last checked</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.slice(0, 5).map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link
                      className="service-name"
                      to={`${base}/monitors/${m.id}`}
                    >
                      <span className={`service-tile ${m.status}`}>
                        <Radio size={16} />
                      </span>
                      <span>
                        {m.name}
                        <small>{new URL(m.url).hostname}</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Status value={m.status} />
                  </td>
                  <td>
                    <div className="availability-cell">
                      <span className={`availability-bar ${m.status}`}>
                        <i style={{ width: `${m.uptime ?? 0}%` }} />
                      </span>
                      {percent(m.uptime)}
                    </div>
                  </td>
                  <td className="mono">{ms(m.latency)}</td>
                  <td className="muted">{relative(m.last_checked)}</td>
                  <td>
                    <Link
                      to={`${base}/monitors/${m.id}`}
                      aria-label={`Open ${m.name}`}
                      className="icon-button"
                    >
                      <ArrowUpRight size={15} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!services.length && (
            <Empty
              title="No monitors yet"
              description="Start with a public API or website you own."
              action={
                <Button onClick={() => setCreate(true)}>
                  Add your first monitor
                </Button>
              }
            />
          )}
        </div>
        <div className="table-footer">
          <span>
            <span className="tiny-live" />{" "}
            {demo
              ? "Illustrative measurements"
              : "Automatic monitoring enabled"}
          </span>
          <span>
            {services.length} services <span className="footer-dot">·</span> 5
            min default interval
          </span>
        </div>
      </Panel>
      <div className="bottom-grid">
        <Panel
          title="Recent incidents"
          action={
            <Link className="text-link" to={`${base}/incidents`}>
              View all
              <ArrowUpRight size={13} />
            </Link>
          }
        >
          {events.length ? (
            events.slice(0, 3).map((event) => (
              <Link
                className="incident-row"
                key={event.id}
                to={`${base}/incidents/${event.id}`}
              >
                <span
                  className={`event-icon ${event.status === "resolved" ? "green" : "amber"}`}
                >
                  {event.status === "resolved" ? (
                    <CheckCheck size={17} />
                  ) : (
                    <TriangleAlert size={17} />
                  )}
                </span>
                <div>
                  <strong>{event.title}</strong>
                  <span>
                    {event.monitor_name} <span>·</span>{" "}
                    {relative(event.started_at)}
                  </span>
                </div>
                <Status value={event.status} />
              </Link>
            ))
          ) : (
            <Empty
              title="A quiet incident log"
              description="When a service needs attention, you’ll see it here."
            />
          )}
        </Panel>
        <Panel
          title="Monitoring snapshot"
          subtitle="Measured availability, without the guesswork"
        >
          <div className="snapshot-stats">
            <div>
              <Activity size={16} />
              <span>Checks performed</span>
              <strong>{data.summary.total.toLocaleString()}</strong>
            </div>
            <div>
              <CheckCheck size={16} />
              <span>Successful checks</span>
              <strong>{data.summary.successful.toLocaleString()}</strong>
            </div>
            <div>
              <Timer size={16} />
              <span>Mean time to recovery</span>
              <strong>{duration(data.summary.mttr)}</strong>
            </div>
            <div>
              <CalendarDays size={16} />
              <span>Window begins</span>
              <strong>{date(data.since)}</strong>
            </div>
          </div>
        </Panel>
      </div>
      <div className="two-columns" style={{ marginTop: 20 }}>
        <Panel
          title="Availability trend"
          subtitle="Successful checks divided by completed checks"
        >
          <div className="chart-pad">
            <TrendChart data={data.series} kind="uptime" />
          </div>
        </Panel>
        <Panel
          title="Recent checks"
          subtitle="The latest measured signals from your services"
        >
          {recentChecks.error ? (
            <Failure
              error={recentChecks.error}
              retry={() => void recentChecks.refetch()}
            />
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>HTTP</th>
                    <th>Latency</th>
                    <th>Checked</th>
                  </tr>
                </thead>
                <tbody>
                  {recentChecks.data?.data.map((check) => (
                    <tr key={check.id}>
                      <td>
                        <Link to={`${base}/monitors/${check.monitor_id}`}>
                          <span className={check.success ? "green" : "red"}>
                            ●
                          </span>{" "}
                          {check.monitor_name}
                        </Link>
                      </td>
                      <td className="mono">{check.status_code ?? "—"}</td>
                      <td className="mono">{ms(check.latency)}</td>
                      <td className="muted">{relative(check.checked_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!recentChecks.data?.data.length && (
                <Empty title="Waiting for your first signal" />
              )}
            </div>
          )}
        </Panel>
      </div>
      <MonitorDialog open={create} onOpenChange={setCreate} />
    </>
  );
}
