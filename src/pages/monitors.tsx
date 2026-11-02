import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Radio,
  ArrowUpRight,
  MoreHorizontal,
  Pause,
  Play,
  ArrowLeft,
  Pencil,
  Trash2,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  Timer,
  Activity,
} from "lucide-react";
import { monitorSchema, type MonitorInput } from "../../shared/schemas";
import type { Monitor, Analytics, Check, Incident } from "../../shared/types";
import { useProduct } from "@/lib/context";
import { useApi, useAction } from "@/lib/api";
import { percent, ms, relative, date } from "@/lib/utils";
import {
  PageHead,
  Panel,
  Status,
  Loading,
  Failure,
  Empty,
  Pagination,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
import { TrendChart } from "@/components/charts";
export function MonitorDialog({
  open,
  onOpenChange,
  monitor,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  monitor?: Monitor;
}) {
  const { demo, workspace } = useProduct(),
    action = useAction(demo, workspace?.id);
  const form = useForm<z.input<typeof monitorSchema>, unknown, MonitorInput>({
    resolver: zodResolver(monitorSchema),
    defaultValues: {
      name: "",
      url: "https://",
      method: "GET",
      interval: 300,
      timeout: 8000,
      expectedMin: 200,
      expectedMax: 299,
      failureThreshold: 3,
      recoveryThreshold: 2,
      tags: [],
      alerts: true,
    },
  });
  const capacity = useApi<{
    approvedHosts: string[];
    workspace: number;
    workspaceLimit: number;
    global: number;
    globalLimit: number;
  }>("/capacity", demo, workspace?.id, open);
  useEffect(() => {
    if (open) {
      form.reset(
        monitor
          ? {
              name: monitor.name,
              url: monitor.url,
              method: monitor.method,
              interval: monitor.interval as 300,
              timeout: monitor.timeout,
              expectedMin: monitor.expected_min,
              expectedMax: monitor.expected_max,
              failureThreshold: monitor.failure_threshold,
              recoveryThreshold: monitor.recovery_threshold,
              tags: JSON.parse(monitor.tags),
              alerts: !!monitor.alerts,
            }
          : {
              name: "",
              url: "https://",
              method: "GET",
              interval: 300,
              timeout: 8000,
              expectedMin: 200,
              expectedMax: 299,
              failureThreshold: 3,
              recoveryThreshold: 2,
              tags: [],
              alerts: true,
            },
      );
    }
  }, [open, monitor, form]);
  const submit = form.handleSubmit(async (data) => {
    try {
      await action.mutateAsync({
        path: monitor ? `/monitors/${monitor.id}` : "/monitors",
        method: monitor ? "PUT" : "POST",
        body: data,
      });
      onOpenChange(false);
    } catch {
      /* mutation displays error */
    }
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={monitor ? "Edit monitor" : "Keep an eye on a service"}
      description="HTTP monitoring with bounded checks and automatic incident detection."
    >
      <form className="form" onSubmit={submit}>
        {demo && (
          <div className="info-callout">
            This demo is read-only. <Link to="/login">Sign in</Link> to monitor
            your own services.
          </div>
        )}
        <label>
          Monitor name
          <input placeholder="e.g. Production API" {...form.register("name")} />
          <small className="field-error">
            {form.formState.errors.name?.message}
          </small>
        </label>
        <label>
          Endpoint URL
          <input
            type="url"
            placeholder="https://api.example.com/health"
            {...form.register("url")}
          />
          <small className="field-error">
            {form.formState.errors.url?.message}
          </small>
          <small>
            Operator-approved hosts:{" "}
            {capacity.data?.data.approvedHosts.join(", ") ||
              "None configured yet. See setup guide."}
          </small>
        </label>
        <div className="form-grid">
          <label>
            HTTP method
            <select {...form.register("method")}>
              <option>GET</option>
              <option>HEAD</option>
            </select>
          </label>
          <label>
            Check interval
            <select {...form.register("interval", { valueAsNumber: true })}>
              {[300, 600, 900, 1800, 3600].map((n) => (
                <option key={n} value={n}>
                  {n / 60} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            Timeout (ms)
            <input
              type="number"
              min={1000}
              max={10000}
              {...form.register("timeout", { valueAsNumber: true })}
            />
          </label>
          <label>
            Failure threshold
            <input
              type="number"
              min={1}
              max={5}
              {...form.register("failureThreshold", { valueAsNumber: true })}
            />
          </label>
          <label>
            Expected status, from
            <input
              type="number"
              min={100}
              max={599}
              {...form.register("expectedMin", { valueAsNumber: true })}
            />
          </label>
          <label>
            Expected status, to
            <input
              type="number"
              min={100}
              max={599}
              {...form.register("expectedMax", { valueAsNumber: true })}
            />
          </label>
          <label>
            Recovery threshold
            <input
              type="number"
              min={1}
              max={5}
              {...form.register("recoveryThreshold", { valueAsNumber: true })}
            />
          </label>
          <label>
            Tags <span className="muted">(comma separated)</span>
            <input
              defaultValue={monitor ? JSON.parse(monitor.tags).join(", ") : ""}
              onChange={(e) =>
                form.setValue(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              placeholder="production, api"
            />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" {...form.register("alerts")} /> Notify me when
          this monitor needs attention
        </label>
        {Object.entries(form.formState.errors)
          .filter(([k]) => !["name", "url"].includes(k))
          .map(([k, e]) => (
            <small className="field-error" key={k}>
              {k}: {e?.message?.toString() ?? "Invalid value"}
            </small>
          ))}
        <div className="dialog-footer">
          <span className="muted">
            {capacity.data?.data.workspace ?? 0} /{" "}
            {capacity.data?.data.workspaceLimit ?? 5} active monitors
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={demo || action.isPending}>
            {action.isPending
              ? "Saving…"
              : monitor
                ? "Save changes"
                : "Create monitor"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function Monitors() {
  const { demo, workspace } = useProduct(),
    base = demo ? "/demo" : "/app";
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("name"),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [editing, setEditing] = useState<Monitor>();
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);
  const monitors = useApi<Monitor[]>(
      `/monitors?q=${encodeURIComponent(query)}&status=${status}&sort=${sort}&page=${page}`,
      demo,
      workspace?.id,
    ),
    action = useAction(demo, workspace?.id);
  return (
    <>
      <PageHead
        eyebrow="EVERY ENDPOINT. ONE CLEAR VIEW."
        title="Monitors"
        description="Your services, under a watchful eye."
      >
        <Button onClick={() => setCreate(true)}>
          <Plus size={15} /> Add monitor
        </Button>
      </PageHead>
      <div className="toolbar">
        <div className="search-field">
          <Search size={16} />
          <input
            aria-label="Search monitors"
            placeholder="Search by service name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter monitors by status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {[
            "all",
            "operational",
            "degraded",
            "down",
            "paused",
            "pending",
            "unknown",
          ].map((s) => (
            <option value={s} key={s}>
              {s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort monitors"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="name">Name A–Z</option>
          <option value="latency">Response time</option>
          <option value="uptime">Lowest uptime</option>
          <option value="recent">Recently updated</option>
        </select>
      </div>
      <Panel>
        {monitors.isPending ? (
          <Loading />
        ) : monitors.error ? (
          <Failure
            error={monitors.error}
            retry={() => void monitors.refetch()}
          />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Uptime · 24h</th>
                    <th>Response time</th>
                    <th>Interval</th>
                    <th>Last checked</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {monitors.data?.data.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <Link
                          className="service-name"
                          to={`${base}/monitors/${m.id}`}
                        >
                          <span className={`service-tile ${m.status}`}>
                            <Radio size={17} />
                          </span>
                          <span>
                            {m.name}
                            <small>{m.url}</small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <Status value={m.status} />
                      </td>
                      <td className="mono">{percent(m.uptime)}</td>
                      <td className="mono">{ms(m.latency)}</td>
                      <td className="muted">{m.interval / 60} min</td>
                      <td className="muted">{relative(m.last_checked)}</td>
                      <td>
                        <Dropdown
                          trigger={
                            <button
                              className="icon-button"
                              aria-label={`Actions for ${m.name}`}
                            >
                              <MoreHorizontal size={18} />
                            </button>
                          }
                          items={[
                            {
                              label: "View details",
                              onClick: () =>
                                window.location.assign(
                                  `${base}/monitors/${m.id}`,
                                ),
                            },
                            {
                              label: "Edit monitor",
                              onClick: () => {
                                setEditing(m);
                                setCreate(true);
                              },
                            },
                            {
                              label:
                                m.status === "paused"
                                  ? "Resume monitoring"
                                  : "Pause monitoring",
                              onClick: () =>
                                action.mutate({
                                  path: `/monitors/${m.id}/state`,
                                  method: "PATCH",
                                  body: { paused: m.status !== "paused" },
                                }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!monitors.data?.data.length && (
                <Empty
                  title={
                    query
                      ? "No matching services"
                      : "Your next service starts here"
                  }
                  description={
                    query
                      ? "Try another name or status filter."
                      : "Add an endpoint and let WatchTower take the next shift."
                  }
                  action={
                    <Button variant="outline" onClick={() => setCreate(true)}>
                      Add monitor
                    </Button>
                  }
                />
              )}
            </div>
            <Pagination
              page={page}
              setPage={setPage}
              total={monitors.data?.meta?.total}
            />
          </>
        )}
      </Panel>
      <MonitorDialog
        key={editing?.id ?? "new"}
        open={create}
        onOpenChange={(v) => {
          setCreate(v);
          if (!v) setEditing(undefined);
        }}
        monitor={editing}
      />
    </>
  );
}
export function MonitorDetail() {
  const { id } = useParams(),
    { demo, workspace } = useProduct(),
    base = demo ? "/demo" : "/app",
    navigate = useNavigate();
  const [range, setRange] = useState("24h"),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState(false),
    [remove, setRemove] = useState(false);
  const monitor = useApi<Monitor>(`/monitors/${id}`, demo, workspace?.id),
    stats = useApi<Analytics>(
      `/monitors/${id}/analytics?range=${range}`,
      demo,
      workspace?.id,
    ),
    checks = useApi<Check[]>(
      `/monitors/${id}/checks?page=${page}`,
      demo,
      workspace?.id,
    ),
    incidents = useApi<Incident[]>(
      `/incidents?monitorId=${id}`,
      demo,
      workspace?.id,
    ),
    action = useAction(demo, workspace?.id);
  if (monitor.isPending) return <Loading />;
  if (monitor.error)
    return (
      <Failure error={monitor.error} retry={() => void monitor.refetch()} />
    );
  const m = monitor.data!.data,
    s = stats.data?.data.summary;
  return (
    <>
      <Link className="back-link" to={`${base}/monitors`}>
        <ArrowLeft size={14} /> All monitors
      </Link>
      <PageHead title={m.name} description={m.url}>
        <Button variant="outline" onClick={() => setEdit(true)}>
          <Pencil size={14} /> Edit
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            action.mutate({
              path: `/monitors/${id}/state`,
              method: "PATCH",
              body: { paused: m.status !== "paused" },
            })
          }
        >
          {m.status === "paused" ? <Play size={14} /> : <Pause size={14} />}{" "}
          {m.status === "paused" ? "Resume" : "Pause"}
        </Button>
        <Button
          variant="outline"
          onClick={() => action.mutate({ path: `/monitors/${id}/check` })}
        >
          <RefreshCw size={14} /> Check now
        </Button>
        <button
          className="icon-button danger"
          aria-label="Delete monitor"
          onClick={() => setRemove(true)}
        >
          <Trash2 size={17} />
        </button>
      </PageHead>
      <div className="detail-status">
        <Status value={m.status} />
        <span>Last checked {relative(m.last_checked)}</span>
        <a href={m.url} rel="noreferrer" target="_blank">
          Visit endpoint
          <ExternalLink size={13} />
        </a>
      </div>
      {m.last_error && (
        <div className="error-callout">
          <strong>Latest check failed</strong>
          <p>{m.last_error}</p>
        </div>
      )}
      <div className="metric-grid three">
        <div className="metric-card">
          <div className="metric-label">
            Uptime <ShieldCheck size={15} />
          </div>
          <div className="metric-value">{percent(s?.uptime)}</div>
          <div className="metric-foot muted">
            Measured checks in selected range
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            Current response <Timer size={15} />
          </div>
          <div className="metric-value">{ms(m.latency)}</div>
          <div className="metric-foot muted">{relative(m.last_checked)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">
            Checks collected <Activity size={15} />
          </div>
          <div className="metric-value">{s?.total.toLocaleString() ?? "—"}</div>
          <div className="metric-foot muted">
            {s?.successful ?? 0} successful
          </div>
        </div>
      </div>
      <Panel
        title="Response time"
        subtitle="Actual measurements, grouped into hourly buckets"
        action={
          <select
            aria-label="Monitor time range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        }
      >
        <div className="chart-pad">
          {stats.error ? (
            <Failure error={stats.error} retry={() => void stats.refetch()} />
          ) : (
            <TrendChart data={stats.data?.data.series ?? []} />
          )}
        </div>
      </Panel>
      <div className="bottom-grid">
        <Panel
          title="Check history"
          subtitle="Raw measurements retained for 7 days"
        >
          {checks.error ? (
            <Failure error={checks.error} retry={() => void checks.refetch()} />
          ) : (
            <>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Result</th>
                      <th>HTTP</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {checks.data?.data.map((check) => (
                      <tr key={check.id}>
                        <td className="muted">{date(check.checked_at)}</td>
                        <td>
                          <Status
                            value={check.success ? "operational" : "down"}
                          />
                          {check.error && (
                            <small className="check-error">{check.error}</small>
                          )}
                        </td>
                        <td className="mono">{check.status_code ?? "—"}</td>
                        <td className="mono">{ms(check.latency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!checks.data?.data.length && (
                  <Empty
                    title="First check is on its way"
                    description="The Cron scheduler collects real measurements automatically."
                  />
                )}
              </div>
              <Pagination
                page={page}
                setPage={setPage}
                pageSize={25}
                hasNext={checks.data?.data.length === 25}
              />
            </>
          )}
        </Panel>
        <div className="stack">
          <Panel title="Configuration">
            <dl className="config-list">
              {[
                ["Method", m.method],
                ["Interval", `${m.interval / 60} minutes`],
                ["Timeout", ms(m.timeout)],
                ["Expected status", `${m.expected_min}–${m.expected_max}`],
                [
                  "Failure threshold",
                  `${m.failure_threshold} consecutive checks`,
                ],
                [
                  "Recovery threshold",
                  `${m.recovery_threshold} consecutive checks`,
                ],
                ["Alerts", m.alerts ? "Enabled" : "Disabled"],
                ["Created", date(m.created_at)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="tags">
              {JSON.parse(m.tags).map((t: string) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </Panel>
          <Panel title="Incident history">
            {incidents.error ? (
              <Failure
                error={incidents.error}
                retry={() => void incidents.refetch()}
              />
            ) : incidents.data?.data.length ? (
              incidents.data.data.map((i) => (
                <Link
                  className="incident-row compact"
                  to={`${base}/incidents/${i.id}`}
                  key={i.id}
                >
                  <div>
                    <strong>{i.title}</strong>
                    <span>{date(i.started_at)}</span>
                  </div>
                  <ArrowUpRight size={14} />
                </Link>
              ))
            ) : (
              <Empty title="No incidents recorded" />
            )}
          </Panel>
        </div>
      </div>
      <MonitorDialog open={edit} onOpenChange={setEdit} monitor={m} />
      <Dialog
        open={remove}
        onOpenChange={setRemove}
        title={`Delete ${m.name}?`}
        description="Check history and aggregates will be permanently removed. Related incidents are closed and retained."
      >
        <div className="form">
          <p>This action cannot be undone.</p>
          <div className="dialog-footer">
            <Button variant="outline" onClick={() => setRemove(false)}>
              Keep monitor
            </Button>
            <Button
              variant="destructive"
              disabled={demo || action.isPending}
              onClick={async () => {
                try {
                  await action.mutateAsync({
                    path: `/monitors/${id}`,
                    method: "DELETE",
                  });
                  navigate(`${base}/monitors`);
                } catch {
                  /* handled */
                }
              }}
            >
              Delete monitor
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
