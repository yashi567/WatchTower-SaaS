import { useState, useEffect } from "react";
import {
  NavLink,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Radio,
  TriangleAlert,
  ChartNoAxesCombined,
  PanelsTopLeft,
  Bell,
  Users,
  Settings,
  ChevronDown,
  Search,
  Command,
  Sun,
  Moon,
  Menu,
  ArrowUpRight,
  Plus,
  BookOpen,
} from "lucide-react";
import { createAuthClient } from "better-auth/react";
import { Logo, Loading, Failure, DemoNote, Empty } from "./components/common";
import { Button } from "./components/ui/button";
import { Dropdown } from "./components/ui/dropdown";
import { Dialog } from "./components/ui/dialog";
import { Tooltip } from "./components/ui/tooltip";
import { AppContext, useTheme } from "./lib/context";
import { request } from "./lib/api";
import type { Workspace, Notification } from "../shared/types";
import { toast } from "sonner";
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["monitors", "Monitors", Radio],
  ["incidents", "Incidents", TriangleAlert],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["status-pages", "Status pages", PanelsTopLeft],
  ["notifications", "Notifications", Bell],
  ["team", "Team", Users],
  ["settings", "Settings", Settings],
] as const;
export function AppLayout({ demo = false }: { demo?: boolean }) {
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [term, setTerm] = useState(""),
    [newWorkspace, setNewWorkspace] = useState(false),
    [workspaceName, setWorkspaceName] = useState(""),
    [creating, setCreating] = useState(false),
    [workspaceId, setWorkspaceId] = useState(
      () => localStorage.getItem("watchtower-workspace") ?? "",
    );
  const [smallScreen, setSmallScreen] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setSmallScreen(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const items = () =>
      Array.from(
        sidebar?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled)",
        ) ?? [],
      );
    items()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
      if (e.key === "Tab") {
        const list = items(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [mobile]);
  const { theme, toggle } = useTheme(),
    location = useLocation(),
    navigate = useNavigate(),
    base = demo ? "/demo" : "/app";
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const r = await fetch("/api/auth/get-session");
      if (!r.ok) return null;
      return r.json() as Promise<{
        user: { id: string; name: string; email: string; image: string | null };
      } | null>;
    },
    enabled: !demo,
    retry: false,
  });
  const spaces = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => request<Workspace[]>("/api/workspaces"),
    enabled: !demo && !!session.data,
    retry: false,
  });
  const workspaces = demo
      ? [
          {
            id: "demo",
            name: "Acme Engineering",
            role: "viewer" as const,
            synthetic: 1,
          },
        ]
      : (spaces.data?.data ?? []),
    workspace = workspaces.find((w) => w.id === workspaceId) ?? workspaces[0];
  const notices = useQuery({
    queryKey: ["notice-count", demo, workspace?.id],
    queryFn: () =>
      request<Notification[]>(
        `/api${demo ? "/demo" : ""}/notifications`,
        {},
        workspace?.id,
      ),
    enabled: !!workspace,
    refetchInterval: 60000,
  });
  useEffect(() => {
    setMobile(false);
    setSearch(false);
    document.title = `${nav.find((n) => location.pathname.includes(n[0]))?.[1] ?? "Workspace"} · WatchTower`;
  }, [location.pathname]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
  if (!demo && session.isPending) return <Loading />;
  if (!demo && !session.data)
    return (
      <div className="auth-required">
        <Logo />
        <Empty
          title="Your workspace is one sign-in away"
          description="Sign in with GitHub to start monitoring your services."
          action={
            <div className="row">
              <Button asChild>
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/demo">Explore demo</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  if (!demo && spaces.isPending) return <Loading />;
  if (spaces.error)
    return <Failure error={spaces.error} retry={() => void spaces.refetch()} />;
  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await request<Workspace>("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName }),
      });
      setWorkspaceId(r.data.id);
      localStorage.setItem("watchtower-workspace", r.data.id);
      await spaces.refetch();
      setNewWorkspace(false);
      toast.success("Workspace created");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  const workspaceDialog = (
    <Dialog
      open={newWorkspace}
      onOpenChange={setNewWorkspace}
      title="Create a workspace"
      description="Bring your services and teammates together."
    >
      <form onSubmit={createWorkspace} className="form">
        <label>
          Workspace name
          <input
            autoFocus
            required
            minLength={2}
            maxLength={60}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="e.g. Platform Engineering"
          />
        </label>
        <Button disabled={creating} type="submit">
          {creating ? "Creating…" : "Create workspace"}
        </Button>
      </form>
    </Dialog>
  );
  if (!workspace)
    return (
      <>
        <div className="onboarding">
          <Logo />
          <Empty
            title={`Welcome, ${session.data?.user.name.split(" ")[0]}`}
            description="Create your first workspace, then add an approved endpoint. Your first real measurements will appear after the next scheduled check."
            action={
              <Button onClick={() => setNewWorkspace(true)}>
                <Plus size={16} /> Create workspace
              </Button>
            }
          />
        </div>
        {workspaceDialog}
      </>
    );
  return (
    <AppContext.Provider
      value={{
        demo,
        workspace,
        workspaces,
        setWorkspace: (id) => {
          setWorkspaceId(id);
          localStorage.setItem("watchtower-workspace", id);
        },
        refreshWorkspaces: () => void spaces.refetch(),
        user: session.data?.user,
      }}
    >
      <div className="app-shell">
        {mobile && (
          <div className="sidebar-backdrop" onClick={() => setMobile(false)} />
        )}
        <aside
          className={`sidebar ${mobile ? "is-open" : ""}`}
          inert={smallScreen && !mobile}
          role={smallScreen && mobile ? "dialog" : undefined}
          aria-modal={smallScreen && mobile ? true : undefined}
          aria-label={
            smallScreen && mobile ? "Workspace navigation" : undefined
          }
        >
          <Link to="/" className="brand-link" aria-label="WatchTower home">
            <Logo />
          </Link>
          <Dropdown
            trigger={
              <button className="workspace-switch">
                <span className="workspace-avatar">
                  {workspace.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{workspace.name}</strong>
                  <small>{demo ? "Demo workspace" : "Free workspace"}</small>
                </span>
                <ChevronDown size={14} />
              </button>
            }
            items={[
              ...workspaces.map((w) => ({
                label: `${w.id === workspace.id ? "✓ " : ""}${w.name}`,
                onClick: () => {
                  setWorkspaceId(w.id);
                  localStorage.setItem("watchtower-workspace", w.id);
                },
              })),
              ...(demo
                ? []
                : [
                    {
                      label: "Create workspace",
                      onClick: () => setNewWorkspace(true),
                    },
                  ]),
            ]}
          />
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Main navigation">
            {nav.map(([path, label, Icon]) => (
              <NavLink
                key={path}
                aria-label={label}
                to={`${base}/${path}`}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
              >
                <Icon size={17} strokeWidth={1.7} />
                <span>{label}</span>
                {path === "notifications" && !!notices.data?.meta?.unread && (
                  <span className="nav-count">{notices.data.meta.unread}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="plan-card">
              <div>
                <span className="tiny-live" /> Built for peace of mind
              </div>
              <p>
                {demo
                  ? "Get a clear view of what’s up, what’s down, and what needs you."
                  : "Five active services. Zero always-on servers."}
              </p>
              <Link to={demo ? "/login" : `${base}/settings`}>
                {demo ? "Start your workspace" : "Workspace settings"}
                <ArrowUpRight size={13} />
              </Link>
            </div>
            <Link className="help-link" to="/guide">
              <BookOpen size={15} /> Quick-start guide
              <ArrowUpRight size={13} />
            </Link>
            <Dropdown
              trigger={
                <button className="profile-menu">
                  <span className="user-avatar">
                    {demo
                      ? "JD"
                      : session.data?.user.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>
                      {demo ? "Jamie Davis" : session.data?.user.name}
                    </strong>
                    <small>
                      {demo ? "Exploring WatchTower" : workspace.role}
                    </small>
                  </span>
                  <ChevronDown size={14} />
                </button>
              }
              items={
                demo
                  ? [
                      {
                        label: "Sign in with GitHub",
                        onClick: () => navigate("/login"),
                      },
                    ]
                  : [
                      {
                        label: "Account settings",
                        onClick: () => navigate(`${base}/settings`),
                      },
                      {
                        label: "Sign out",
                        onClick: async () => {
                          await createAuthClient().signOut();
                          navigate("/login");
                          void session.refetch();
                        },
                      },
                    ]
              }
            />
          </div>
        </aside>
        <div className="main-shell" inert={smallScreen && mobile}>
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <strong>
                  {nav.find((n) => location.pathname.includes(n[0]))?.[1] ??
                    "Details"}
                </strong>
              </span>
            </div>
            <div className="topbar-actions">
              <button
                className="search-trigger"
                aria-label="Search workspace"
                onClick={() => setSearch(true)}
              >
                <Search size={15} />
                <span>Search anything…</span>
                <kbd>
                  <Command size={10} /> K
                </kbd>
              </button>
              <span className="topbar-divider" />
              <Tooltip
                label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              >
                <button
                  className="icon-button"
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                  onClick={toggle}
                >
                  {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
                </button>
              </Tooltip>
              <Link
                to={`${base}/notifications`}
                className="icon-button notification-bell"
                aria-label="View notifications"
              >
                <Bell size={17} />
                {!!notices.data?.meta?.unread && <i />}
              </Link>
            </div>
          </header>
          <main id="main-content" className="main-content">
            <DemoNote />
            <Outlet />
          </main>
          <footer className="app-footer">
            <span>
              <span className="tiny-live" /> WatchTower monitoring
            </span>
            <span>
              {demo
                ? "Synthetic demo · No live checks"
                : "Checks every 5 minutes or more"}
              <span className="footer-dot">·</span>
              <Link to="/guide">Documentation</Link>
            </span>
          </footer>
        </div>
      </div>
      {workspaceDialog}
      <Dialog
        open={search}
        onOpenChange={setSearch}
        title="Jump to a page"
        description="Search your workspace navigation."
      >
        <div className="form">
          <div className="search-field">
            <Search size={16} />
            <input
              autoFocus
              placeholder="Monitors, incidents, analytics…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="command-results">
            {nav
              .filter((n) => n[1].toLowerCase().includes(term.toLowerCase()))
              .map(([path, label, Icon]) => (
                <Link key={path} to={`${base}/${path}`}>
                  <Icon size={17} />
                  {label}
                  <ArrowUpRight size={14} />
                </Link>
              ))}
          </div>
        </div>
      </Dialog>
    </AppContext.Provider>
  );
}
