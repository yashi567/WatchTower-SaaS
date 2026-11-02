import {
  StrictMode,
  Component,
  lazy,
  Suspense,
  useEffect,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ThemeProvider } from "./lib/context";
import { AppLayout } from "./layout";
import { Landing, Login, Guide, AcceptInvite, NotFound } from "./pages/public";
import { Loading } from "./components/common";
const Overview = lazy(() =>
  import("./pages/overview").then((m) => ({ default: m.Overview })),
);
const Monitors = lazy(() =>
  import("./pages/monitors").then((m) => ({ default: m.Monitors })),
);
const MonitorDetail = lazy(() =>
  import("./pages/monitors").then((m) => ({ default: m.MonitorDetail })),
);
const Incidents = lazy(() =>
  import("./pages/incidents").then((m) => ({ default: m.Incidents })),
);
const IncidentDetail = lazy(() =>
  import("./pages/incidents").then((m) => ({ default: m.IncidentDetail })),
);
const Analytics = lazy(() =>
  import("./pages/analytics").then((m) => ({ default: m.Analytics })),
);
const StatusPages = lazy(() =>
  import("./pages/status-pages").then((m) => ({ default: m.StatusPages })),
);
const PublicStatus = lazy(() =>
  import("./pages/status-pages").then((m) => ({ default: m.PublicStatus })),
);
const Notifications = lazy(() =>
  import("./pages/workspace").then((m) => ({ default: m.Notifications })),
);
const Team = lazy(() =>
  import("./pages/workspace").then((m) => ({ default: m.Team })),
);
const Settings = lazy(() =>
  import("./pages/workspace").then((m) => ({ default: m.Settings })),
);
import "./styles.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30000, refetchOnWindowFocus: false },
  },
});
function RouteTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith("/app") || pathname.startsWith("/demo")) return;
    document.title =
      pathname === "/"
        ? "WatchTower · Know before your customers do"
        : `${pathname === "/login" ? "Sign in" : pathname === "/guide" ? "Getting started" : pathname.startsWith("/status/") ? "Service status" : pathname.startsWith("/invite/") ? "Workspace invitation" : "Page not found"} · WatchTower`;
  }, [pathname]);
  return null;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty">
        <h1>Something interrupted this view.</h1>
        <p>Reload the page to reconnect to your workspace.</p>
        <button
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          Reload WatchTower
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const productRoutes = (
  <>
    <Route index element={<Navigate to="overview" replace />} />
    <Route path="overview" element={<Overview />} />
    <Route path="monitors" element={<Monitors />} />
    <Route path="monitors/:id" element={<MonitorDetail />} />
    <Route path="incidents" element={<Incidents />} />
    <Route path="incidents/:id" element={<IncidentDetail />} />
    <Route path="analytics" element={<Analytics />} />
    <Route path="status-pages" element={<StatusPages />} />
    <Route path="notifications" element={<Notifications />} />
    <Route path="team" element={<Team />} />
    <Route path="settings" element={<Settings />} />
  </>
);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <BrowserRouter>
            <RouteTitle />
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<Login />} />
                <Route path="/guide" element={<Guide />} />
                <Route path="/invite/:token" element={<AcceptInvite />} />
                <Route path="/status/:slug" element={<PublicStatus />} />
                <Route path="/demo" element={<AppLayout demo />}>
                  {productRoutes}
                </Route>
                <Route path="/app" element={<AppLayout />}>
                  {productRoutes}
                </Route>
                <Route
                  path="/unauthorized"
                  element={
                    <div className="empty">
                      <h1>Access is restricted</h1>
                      <p>Your workspace role does not allow this action.</p>
                      <Link to="/app">Return to workspace</Link>
                    </div>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <Toaster richColors position="bottom-right" />
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
