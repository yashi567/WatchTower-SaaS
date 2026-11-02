import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Plus,
  ArrowLeft,
  ArrowUpRight,
  TriangleAlert,
  CheckCheck,
  Clock,
  Radio,
  UserRound,
} from "lucide-react";
import { useProduct } from "@/lib/context";
import { useApi, useAction } from "@/lib/api";
import { relative, date, duration } from "@/lib/utils";
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
import type { Incident, IncidentEvent, Monitor } from "../../shared/types";
import { incidentTransitions } from "../../worker/monitoring/state";
export function Incidents() {
  const { demo, workspace } = useProduct(),
    base = demo ? "/demo" : "/app";
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [severity, setSeverity] = useState("major"),
    [monitorId, setMonitorId] = useState("");
  const data = useApi<Incident[]>(
      `/incidents?status=${filter}&page=${page}`,
      demo,
      workspace?.id,
    ),
    monitors = useApi<Monitor[]>("/monitors", demo, workspace?.id),
    action = useAction(demo, workspace?.id);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await action.mutateAsync({
        path: "/incidents",
        body: { title, description, severity, monitorId: monitorId || null },
      });
      setCreate(false);
      setTitle("");
      setDescription("");
    } catch {
      /* handled */
    }
  }
  return (
    <>
      <PageHead
        eyebrow="FROM FIRST SIGNAL TO FULL RECOVERY"
        title="Incidents"
        description="Keep the response coordinated. Keep everyone informed."
      >
        <Button onClick={() => setCreate(true)}>
          <Plus size={15} /> Declare incident
        </Button>
      </PageHead>
      <div className="tab-bar" role="tablist" aria-label="Incident status">
        {[
          ["all", "All incidents"],
          ["active", "Active"],
          ["resolved", "Resolved"],
        ].map(([value, label]) => (
          <button
            role="tab"
            aria-selected={filter === value}
            className={filter === value ? "selected" : ""}
            key={value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <Panel>
        {data.isPending ? (
          <Loading />
        ) : data.error ? (
          <Failure error={data.error} retry={() => void data.refetch()} />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data?.data.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link
                          className="service-name incident-name"
                          to={`${base}/incidents/${i.id}`}
                        >
                          <span
                            className={`event-icon ${i.status === "resolved" ? "green" : "amber"}`}
                          >
                            {i.status === "resolved" ? (
                              <CheckCheck size={18} />
                            ) : (
                              <TriangleAlert size={18} />
                            )}
                          </span>
                          <span>
                            {i.title}
                            <small>
                              {i.monitor_name ?? "Workspace incident"} ·{" "}
                              {i.source === "system"
                                ? "Automated detection"
                                : "Manually declared"}
                            </small>
                          </span>
                        </Link>
                      </td>
                      <td>
                        <span className={`severity severity-${i.severity}`}>
                          {i.severity}
                        </span>
                      </td>
                      <td>
                        <Status value={i.status} />
                      </td>
                      <td className="muted">{relative(i.started_at)}</td>
                      <td className="mono">
                        {duration(
                          (i.resolved_at ?? Date.now() / 1000) - i.started_at,
                        )}
                        {!i.resolved_at && (
                          <small className="muted"> ongoing</small>
                        )}
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          to={`${base}/incidents/${i.id}`}
                          aria-label={`Open ${i.title}`}
                        >
                          <ArrowUpRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.data?.data.length && (
                <Empty
                  title={
                    filter === "active"
                      ? "Nothing needs your attention"
                      : "No incidents in this view"
                  }
                  description="Automated incidents open when a monitor reaches its failure threshold."
                />
              )}
            </div>
            <Pagination
              page={page}
              setPage={setPage}
              total={data.data?.meta?.total}
            />
          </>
        )}
      </Panel>
      <div className="info-callout">
        <Radio size={17} />
        <span>
          Incidents open after consecutive failures, then resolve after
          consecutive successful checks. You can also declare an incident
          manually.
        </span>
      </div>
      <Dialog
        open={create}
        onOpenChange={setCreate}
        title="Declare an incident"
        description="Give your team a shared starting point for the response."
      >
        <form className="form" onSubmit={submit}>
          {demo && (
            <div className="info-callout">Synthetic demo · Read-only</div>
          )}
          <label>
            Incident title
            <input
              required
              minLength={3}
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Elevated errors on production API"
            />
          </label>
          <label>
            What’s happening?
            <textarea
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Summarize the impact and what you know so far."
            />
          </label>
          <div className="form-grid">
            <label>
              Severity
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </label>
            <label>
              Related service
              <select
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
              >
                <option value="">Workspace-wide</option>
                {monitors.data?.data.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="dialog-footer">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreate(false)}
            >
              Cancel
            </Button>
            <Button disabled={demo || action.isPending}>
              Declare incident
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
export function IncidentDetail() {
  const { id } = useParams(),
    { demo, workspace } = useProduct(),
    base = demo ? "/demo" : "/app";
  const data = useApi<
      Incident & {
        events: (IncidentEvent & { actor_name?: string })[];
        last_error: string | null;
      }
    >(`/incidents/${id}`, demo, workspace?.id),
    action = useAction(demo, workspace?.id);
  const [status, setStatus] = useState(""),
    [message, setMessage] = useState("");
  if (data.isPending) return <Loading />;
  if (data.error)
    return <Failure error={data.error} retry={() => void data.refetch()} />;
  const incident = data.data!.data;
  async function update(e: React.FormEvent) {
    e.preventDefault();
    try {
      await action.mutateAsync({
        path: `/incidents/${id}`,
        method: "PATCH",
        body: { status: status || incident.status, message },
      });
      setMessage("");
      setStatus("");
    } catch {
      /* handled */
    }
  }
  return (
    <>
      <Link className="back-link" to={`${base}/incidents`}>
        <ArrowLeft size={14} /> All incidents
      </Link>
      <PageHead
        eyebrow={
          incident.source === "system"
            ? "AUTOMATICALLY DETECTED"
            : "MANUALLY DECLARED"
        }
        title={incident.title}
        description={`Started ${date(incident.started_at)}`}
      >
        <Status value={incident.status} />
        <span className={`severity severity-${incident.severity}`}>
          {incident.severity}
        </span>
      </PageHead>
      <div className="incident-detail-grid">
        <div className="stack">
          <Panel
            title="Incident timeline"
            subtitle="One shared record, from detection to recovery"
          >
            <div className="timeline">
              {incident.events.map((event, i) => (
                <div className="timeline-item" key={event.id}>
                  <span
                    className={`timeline-icon ${event.status === "resolved" ? "green" : ""}`}
                  >
                    {event.status === "resolved" ? (
                      <CheckCheck size={16} />
                    ) : (
                      <Clock size={15} />
                    )}
                  </span>
                  <div>
                    <div className="timeline-top">
                      <strong>
                        {event.status[0].toUpperCase() + event.status.slice(1)}
                      </strong>
                      <time>{date(event.created_at)}</time>
                    </div>
                    <p>{event.message || "Incident declared."}</p>
                    <small>
                      <UserRound size={11} />
                      {event.actor_name ??
                        (incident.source === "system"
                          ? "WatchTower automation"
                          : "Workspace team")}
                      {i === 0 && <span className="tag">Initial report</span>}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          {incident.status !== "resolved" && (
            <Panel
              title="Post an update"
              subtitle="Keep a useful record of what changed."
            >
              <form className="form" onSubmit={update}>
                <label>
                  Incident status
                  <select
                    value={status || incident.status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value={incident.status}>{incident.status}</option>
                    {incidentTransitions[incident.status].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Update
                  <textarea
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What have you learned? What is the next step?"
                  />
                </label>
                <Button disabled={demo || action.isPending}>Post update</Button>
                {demo && (
                  <small className="muted">
                    Updates are disabled in the read-only demo.
                  </small>
                )}
              </form>
            </Panel>
          )}
        </div>
        <div className="stack">
          <Panel title="Incident overview">
            <dl className="config-list">
              <div>
                <dt>Status</dt>
                <dd>
                  <Status value={incident.status} />
                </dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd className="capitalize">{incident.severity}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {duration(
                    (incident.resolved_at ?? Date.now() / 1000) -
                      incident.started_at,
                  )}
                </dd>
              </div>
              <div>
                <dt>Detection</dt>
                <dd>{incident.source === "system" ? "Automated" : "Manual"}</dd>
              </div>
              {incident.resolved_at && (
                <div>
                  <dt>Resolved</dt>
                  <dd>{date(incident.resolved_at)}</dd>
                </div>
              )}
            </dl>
            {incident.monitor_id && (
              <Link
                className="related-monitor"
                to={`${base}/monitors/${incident.monitor_id}`}
              >
                <Radio size={17} />
                {incident.monitor_name}
                <ArrowUpRight size={14} />
              </Link>
            )}
          </Panel>
          <Panel title="Context">
            <div className="panel-copy">
              <p>
                {incident.description ||
                  "No additional context has been provided."}
              </p>
              {incident.last_error && (
                <div className="error-callout">
                  <small>Latest monitor error</small>
                  <p>{incident.last_error}</p>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
