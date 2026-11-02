import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  ExternalLink,
  PanelsTopLeft,
  ArrowUp,
  ArrowDown,
  Globe,
  ShieldCheck,
  TriangleAlert,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import type { StatusPage, Monitor, Incident } from "../../shared/types";
import { useProduct } from "@/lib/context";
import { useApi, useAction, request } from "@/lib/api";
import { percent, relative, date } from "@/lib/utils";
import {
  PageHead,
  Panel,
  Status,
  Loading,
  Failure,
  Empty,
  Logo,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Dropdown } from "@/components/ui/dropdown";
export function StatusPages() {
  const { demo, workspace } = useProduct(),
    pages = useApi<StatusPage[]>("/status-pages", demo, workspace?.id),
    monitors = useApi<Monitor[]>("/monitors", demo, workspace?.id),
    action = useAction(demo, workspace?.id);
  const [open, setOpen] = useState(false),
    [editing, setEditing] = useState<StatusPage>(),
    [title, setTitle] = useState(""),
    [slug, setSlug] = useState(""),
    [description, setDescription] = useState(""),
    [published, setPublished] = useState(false),
    [accent, setAccent] = useState("indigo"),
    [selected, setSelected] = useState<string[]>([]);
  function start(p?: StatusPage) {
    setEditing(p);
    setTitle(p?.title ?? "");
    setSlug(p?.slug ?? "");
    setDescription(p?.description ?? "");
    setPublished(!!p?.published);
    setAccent(p?.accent ?? "indigo");
    setSelected(p?.monitorIds ?? []);
    setOpen(true);
  }
  function move(index: number, offset: number) {
    const next = [...selected];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    setSelected(next);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await action.mutateAsync({
        path: editing ? `/status-pages/${editing.id}` : "/status-pages",
        method: editing ? "PUT" : "POST",
        body: {
          title,
          slug,
          description,
          published,
          accent,
          monitorIds: selected,
        },
      });
      setOpen(false);
    } catch {
      /* handled */
    }
  }
  return (
    <>
      <PageHead
        eyebrow="TRANSPARENCY BUILDS TRUST"
        title="Status pages"
        description="Give your customers one calm place to find answers."
      >
        <Button onClick={() => start()}>
          <Plus size={15} /> Create status page
        </Button>
      </PageHead>
      {pages.isPending ? (
        <Loading />
      ) : pages.error ? (
        <Failure error={pages.error} retry={() => void pages.refetch()} />
      ) : pages.data?.data.length ? (
        <div className="page-card-grid">
          {pages.data.data.map((p) => (
            <Panel key={p.id}>
              <div className={`status-page-preview accent-${p.accent}`}>
                <div>
                  <Globe size={15} />
                  <span>{p.slug}.status</span>
                  <span className="preview-dot" />
                </div>
                <div>
                  <ShieldCheck size={26} />
                  <strong>{p.title}</strong>
                  <small>
                    {p.monitorIds.length} services in one clear view
                  </small>
                </div>
                <div className="preview-lines">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="page-card-body">
                <div>
                  <h2>{p.title}</h2>
                  <span className={`tag ${p.published ? "green" : ""}`}>
                    {p.published ? "Published" : "Draft"}
                  </span>
                </div>
                <p>{p.description}</p>
                <div>
                  <span className="muted">/status/{p.slug}</span>
                  <button
                    className="icon-button"
                    aria-label="Copy status page URL"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${window.location.origin}/status/${p.slug}`,
                      );
                      toast.success("Status URL copied");
                    }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <div className="page-card-actions">
                  <Button variant="outline" onClick={() => start(p)}>
                    Customize page
                  </Button>
                  {!!p.published && (
                    <Button asChild variant="ghost">
                      <Link to={`/status/${p.slug}`}>
                        View page
                        <ExternalLink size={14} />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Panel>
          <Empty
            title="Your reliability, out in the open"
            description="Publish selected services and incident summaries. Internal URLs and error details stay private."
            action={<Button onClick={() => start()}>Create status page</Button>}
          />
        </Panel>
      )}
      <div className="info-callout">
        <PanelsTopLeft size={17} />
        <span>
          Public pages include service names, measured availability, and
          incident titles. Endpoint URLs, internal descriptions, and error
          messages are never shared.
        </span>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Customize status page" : "Create a status page"}
        description="Choose what customers see, and in what order."
      >
        <form className="form" onSubmit={save}>
          <label>
            Page title
            <input
              required
              minLength={3}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Acme system status"
            />
          </label>
          <label>
            Public slug
            <input
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              minLength={3}
              maxLength={60}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-workspace"
            />
            <small>Your page: /status/{slug || "my-workspace"}</small>
          </label>
          <label>
            Description
            <textarea
              maxLength={500}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            Accent color
            <select value={accent} onChange={(e) => setAccent(e.target.value)}>
              <option value="indigo">Indigo</option>
              <option value="emerald">Emerald</option>
              <option value="blue">Blue</option>
            </select>
          </label>
          <fieldset>
            <legend>Include services</legend>
            {monitors.data?.data.map((m) => (
              <label className="checkbox-label" key={m.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(m.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, m.id]
                        : selected.filter((id) => id !== m.id),
                    )
                  }
                />
                {m.name}
              </label>
            ))}
          </fieldset>
          {!!selected.length && (
            <div className="reorder-list">
              {selected.map((mid, index) => (
                <div key={mid}>
                  <span>
                    {monitors.data?.data.find((m) => m.id === mid)?.name}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Move service up"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Move service down"
                    disabled={index === selected.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />{" "}
            Publish publicly
          </label>
          <div className="dialog-footer">
            {editing && (
              <Button
                type="button"
                variant="destructive"
                disabled={demo}
                onClick={async () => {
                  if (!window.confirm("Delete this status page?")) return;
                  try {
                    await action.mutateAsync({
                      path: `/status-pages/${editing.id}`,
                      method: "DELETE",
                    });
                    setOpen(false);
                  } catch {
                    /* handled */
                  }
                }}
              >
                Delete page
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={demo || action.isPending}>Save page</Button>
          </div>
          {demo && (
            <small className="muted">
              Customization is disabled in the read-only demo.
            </small>
          )}
        </form>
      </Dialog>
    </>
  );
}
interface PublicStatus {
  page: {
    title: string;
    description: string;
    accent: string;
    synthetic: number;
  };
  monitors: Pick<
    Monitor,
    "id" | "name" | "status" | "last_checked" | "uptime"
  >[];
  incidents: Incident[];
  history: { monitor_id: string; bucket: number; uptime: number }[];
  updatedAt: number;
}
export function PublicStatus() {
  const { slug } = useParams(),
    [days, setDays] = useState(30);
  const query = useQuery({
    queryKey: ["public-status", slug],
    queryFn: () => request<PublicStatus>(`/api/public/status/${slug}`),
    refetchInterval: 60000,
    retry: false,
  });
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <div className="public-status">
        <Link to="/">
          <Logo />
        </Link>
        <Failure error={query.error} retry={() => void query.refetch()} />
      </div>
    );
  const { page, monitors, incidents, history, updatedAt } = query.data.data,
    affected = monitors.some((m) => ["down", "degraded"].includes(m.status)),
    unknown = monitors.some((m) =>
      ["pending", "unknown", "paused"].includes(m.status),
    );
  return (
    <div className={`public-status accent-${page.accent}`}>
      <nav>
        <Link to="/">
          <Logo />
        </Link>
        <Dropdown
          trigger={
            <Button variant="outline" size="sm">
              Last {days} days
            </Button>
          }
          items={[7, 30].map((n) => ({
            label: `Last ${n} days`,
            onClick: () => setDays(n),
          }))}
        />
      </nav>
      {!!page.synthetic && (
        <div className="public-demo-label">
          SYNTHETIC DEMONSTRATION · No live service measurements
        </div>
      )}
      <header>
        <div className={`public-health-icon ${affected ? "amber" : "green"}`}>
          {affected ? <TriangleAlert size={28} /> : <ShieldCheck size={28} />}
        </div>
        <h1>{page.title}</h1>
        <p>{page.description}</p>
        <div className="public-summary">
          <span className={`tiny-live ${affected ? "amber-bg" : ""}`} />
          {affected
            ? "Some services are experiencing issues"
            : unknown || !monitors.length
              ? "Awaiting service measurements"
              : "All systems operational"}
        </div>
        <small>
          {page.synthetic
            ? `Snapshot captured ${date(updatedAt)}`
            : `Last measurement or incident ${relative(updatedAt)} · Refreshes every minute`}
        </small>
      </header>
      <Panel
        title="Service availability"
        subtitle={`Measured uptime over the last ${days} days`}
      >
        <div className="public-services">
          {monitors.map((m) => {
            const buckets = history.filter(
              (h) =>
                h.monitor_id === m.id &&
                h.bucket >=
                  (page.synthetic ? updatedAt : Date.now() / 1000) -
                    days * 86400,
            );
            return (
              <div className="public-service" key={m.id}>
                <div>
                  <strong>{m.name}</strong>
                  <Status value={m.status} />
                </div>
                <div className="uptime-history">
                  {buckets.length ? (
                    buckets.map((h) => (
                      <span
                        key={h.bucket}
                        className={
                          h.uptime >= 100
                            ? "healthy"
                            : h.uptime >= 95
                              ? "degraded"
                              : "failed"
                        }
                        title={`${date(h.bucket)} · ${percent(h.uptime)} measured uptime`}
                      />
                    ))
                  ) : (
                    <span className="no-measurements">
                      No measurements available
                    </span>
                  )}
                </div>
                <div className="history-caption">
                  <span>{days} days ago</span>
                  <span>
                    {percent(
                      buckets.length
                        ? buckets.reduce((n, b) => n + b.uptime, 0) /
                            buckets.length
                        : null,
                    )}{" "}
                    daily mean uptime
                  </span>
                  <span>Today</span>
                </div>
              </div>
            );
          })}
          {!monitors.length && <Empty title="No published services yet" />}
        </div>
      </Panel>
      <section className="public-incidents">
        <h2>Incident history</h2>
        {incidents.length ? (
          incidents.map((i) => (
            <article key={i.id}>
              <div className="row">
                <span
                  className={`event-icon ${i.status === "resolved" ? "green" : "amber"}`}
                >
                  {i.status === "resolved" ? (
                    <Check size={16} />
                  ) : (
                    <TriangleAlert size={16} />
                  )}
                </span>
                <h3>{i.title}</h3>
                <Status value={i.status} />
              </div>
              <p>
                {i.status === "resolved"
                  ? `Resolved ${date(i.resolved_at!)}`
                  : `Investigating since ${date(i.started_at)}`}
                <span className={`severity severity-${i.severity}`}>
                  {i.severity}
                </span>
              </p>
            </article>
          ))
        ) : (
          <Empty
            title="No incidents reported"
            description="Service incident updates will be published here."
          />
        )}
      </section>
      <footer>
        <Link to="/">
          Powered by <Logo />
        </Link>
        <p>
          Availability reflects completed checks. Unmeasured periods are
          excluded.
        </p>
      </footer>
    </div>
  );
}
