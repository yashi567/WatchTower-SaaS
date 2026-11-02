import type { ReactNode } from "react";
import {
  Activity,
  ArrowUpRight,
  TriangleAlert,
  RefreshCw,
  Radio,
  TowerControl,
  Check,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "./ui/button";
import { useProduct } from "@/lib/context";
import { cn } from "@/lib/utils";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="logo">
      <span className="logo-mark">
        <TowerControl size={21} strokeWidth={1.8} />
      </span>
      {!compact && (
        <>
          watchtower<span className="logo-period">.</span>
        </>
      )}
    </span>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={cn("status", `status-${value}`)}>
      <span className="status-dot" />
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="page-actions">{children}</div>
    </div>
  );
}
export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      {title && (
        <div className="panel-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({
  title = "Nothing here yet",
  description = "Your workspace activity will appear here.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Radio size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status" aria-label="Loading workspace">
      <div className="skeleton skeleton-title" />
      <div className="metric-grid">
        {[1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
      <div className="skeleton skeleton-chart" />
    </div>
  );
}
export function Failure({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="empty" role="alert">
      <TriangleAlert size={28} />
      <h3>We couldn’t load this view</h3>
      <p>{error.message}</p>
      <Button variant="outline" onClick={retry}>
        <RefreshCw size={14} /> Try again
      </Button>
    </div>
  );
}
export function DemoNote() {
  const { demo } = useProduct();
  return demo ? (
    <div className="demo-note">
      <Activity size={13} />
      <span>
        Demo snapshot{" "}
        <span className="muted">· Synthetic data · Read-only</span>
      </span>
      <Link to="/login">
        Make it yours <ArrowUpRight size={13} />
      </Link>
    </div>
  ) : null;
}
export function CheckIcon() {
  return (
    <span className="check-icon">
      <Check size={13} />
    </span>
  );
}
export function Pagination({
  page,
  setPage,
  total,
  pageSize = 20,
  hasNext,
}: {
  page: number;
  setPage: (page: number) => void;
  total?: number;
  pageSize?: number;
  hasNext?: boolean;
}) {
  return (
    <div className="pagination">
      <span>
        {total !== undefined
          ? `${total} result${total === 1 ? "" : "s"} · `
          : ""}
        Page {page}
      </span>
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={14} />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={total !== undefined ? page * pageSize >= total : !hasNext}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
