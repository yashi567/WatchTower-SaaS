import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import {
  ArrowRight,
  ArrowUpRight,
  Activity,
  ShieldCheck,
  Radio,
  GitBranch,
  Github,
  Check,
  Timer,
  TriangleAlert,
  ArrowLeft,
  Sun,
  Moon,
  Globe,
  Terminal,
  LockKeyhole,
  Zap,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/context";
import { request } from "@/lib/api";
export function Landing() {
  const { theme, toggle } = useTheme();
  return (
    <div className="marketing">
      <nav className="marketing-nav">
        <Link to="/" aria-label="WatchTower home">
          <Logo />
        </Link>
        <div className="marketing-links">
          <a href="#product">Product</a>
          <a href="#workflow">How it works</a>
          <Link to="/status/acme">Status page</Link>
        </div>
        <div>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={toggle}
          >
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <Link className="marketing-signin" to="/login">
            Sign in
          </Link>
          <Button size="sm" asChild>
            <Link to="/demo">
              Explore demo
              <ArrowUpRight size={13} />
            </Link>
          </Button>
        </div>
      </nav>
      <main>
        <section className="hero">
          <div className="hero-eyebrow">
            <span className="tiny-live" /> A quieter kind of on-call{" "}
            <span>Built on Cloudflare</span>
          </div>
          <h1>
            Know what’s down.
            <br />
            <span>Before it slows you down.</span>
          </h1>
          <p>
            Uptime monitoring, incident response, and status pages.
            <br className="desktop-br" /> One clear view of your services. One
            less thing on your mind.
          </p>
          <div className="hero-actions">
            <Button asChild>
              <Link to="/login">
                Start watching your services
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/demo">
                Take a look inside
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
          <div className="hero-notes">
            <span>
              <Check size={13} /> No credit card
            </span>
            <span>
              <Check size={13} /> Free infrastructure
            </span>
            <span>
              <Check size={13} /> Real HTTP checks
            </span>
          </div>
          <DashboardPreview />
        </section>
        <section className="product-intro" id="product">
          <span className="eyebrow">LESS NOISE. MORE CERTAINTY.</span>
          <div>
            <h2>
              Keep your services close.
              <br />
              Keep your peace of mind.
            </h2>
            <p>
              You shouldn’t need six tabs and a sixth sense to know if your
              product is working. WatchTower connects the dots, from the first
              failed request to the final recovery.
            </p>
          </div>
        </section>
        <section className="feature-grid">
          <Feature
            icon={<Radio size={22} />}
            number="01"
            title="A watchful eye, always"
            copy="Real HTTP checks on a schedule. Configurable thresholds separate a passing blip from a problem worth your attention."
          />
          <Feature
            icon={<TriangleAlert size={22} />}
            number="02"
            title="An incident. A clear next step."
            copy="Automatic detection, a shared response timeline, and recovery tracking. Your team stays on the same page when it matters."
          />
          <Feature
            icon={<Activity size={22} />}
            number="03"
            title="See the pattern, not just the spike"
            copy="Explore response times, availability, and recovery trends. Understand the real measurements behind your reliability."
          />
          <Feature
            icon={<Globe size={22} />}
            number="04"
            title="Build trust in the open"
            copy="Publish a clean status page for selected services. Keep customers informed while internal details stay within your team."
          />
        </section>
        <section id="workflow" className="workflow">
          <div>
            <span className="eyebrow">SIMPLE BY DESIGN</span>
            <h2>
              From endpoint to insight.
              <br />
              Without the overhead.
            </h2>
            <p>
              No always-on server. No complicated agent setup. Just a public
              endpoint, a scheduled check, and a clear picture.
            </p>
            <Button asChild variant="outline">
              <Link to="/guide">
                Read the setup guide
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
          <ol>
            {[
              [
                "Connect your services",
                "Add an approved public endpoint and choose your check interval.",
              ],
              [
                "Let WatchTower take the shift",
                "Scheduled Workers collect real measurements and detect consecutive failures.",
              ],
              [
                "Respond with context",
                "Get notified, follow the incident timeline, and watch recovery happen.",
              ],
            ].map(([title, copy], i) => (
              <li key={title}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="architecture-strip">
          <div>
            <Layers size={18} />
            <strong>Serverless by nature.</strong>
            <span>
              Designed to run on Cloudflare’s free tier, with sensible capacity
              limits.
            </span>
          </div>
          <div>
            <span>React + TypeScript</span>
            <span>Workers</span>
            <span>D1 + Drizzle</span>
          </div>
        </section>
        <section className="final-cta">
          <span className="eyebrow">YOUR NEXT QUIET SHIFT STARTS HERE</span>
          <h2>
            Stay informed.
            <br />
            Get back to building.
          </h2>
          <p>
            Take a tour of a fully populated, read-only workspace.
            <br />
            No account. No setup. Just a clearer view.
          </p>
          <Button asChild>
            <Link to="/demo">
              Explore WatchTower
              <ArrowRight size={16} />
            </Link>
          </Button>
        </section>
      </main>
      <footer className="marketing-footer">
        <div>
          <Logo />
          <p>A little visibility. A lot more peace of mind.</p>
        </div>
        <div>
          <Link to="/guide">Documentation</Link>
          <Link to="/status/acme">Demo status</Link>
          <Link to="/login">Sign in</Link>
          <span>© {new Date().getFullYear()} WatchTower</span>
        </div>
      </footer>
    </div>
  );
}
function Feature({
  icon,
  number,
  title,
  copy,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  copy: string;
}) {
  return (
    <article>
      <div className="feature-icon">
        {icon}
        <span>{number}</span>
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </article>
  );
}
function DashboardPreview() {
  return (
    <Link
      className="dashboard-preview"
      to="/demo"
      aria-label="Open interactive demo dashboard"
    >
      <div className="preview-browser">
        <div>
          <i />
          <i />
          <i />
        </div>
        <span>
          <LockKeyhole size={10} /> watchtower.app / overview
        </span>
        <span>
          Interactive demo <ArrowUpRight size={11} />
        </span>
      </div>
      <div className="preview-app">
        <aside>
          <Logo compact />
          {[Radio, Activity, TriangleAlert, Globe].map((Icon, i) => (
            <span key={i} className={i === 0 ? "active" : ""}>
              <Icon size={16} />
            </span>
          ))}
        </aside>
        <div>
          <div className="preview-title">
            <span>
              Overview<small>Synthetic demo workspace</small>
            </span>
            <span className="tag green">
              <span className="tiny-live" /> Monitoring active
            </span>
          </div>
          <div className="preview-metrics">
            {[
              ["Overall uptime", "99.72%"],
              ["Active monitors", "05"],
              ["Avg. response", "186 ms"],
              ["Active incidents", "01"],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>Illustrative data</small>
              </div>
            ))}
          </div>
          <div className="preview-chart-title">
            <strong>Response time</strong>
            <span>Last 24 hours</span>
          </div>
          <svg
            viewBox="0 0 1000 140"
            preserveAspectRatio="none"
            className="preview-chart"
            aria-label="Illustrative response time chart"
          >
            <defs>
              <linearGradient id="preview-fill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#818cf8" stopOpacity=".25" />
                <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[30, 70, 110].map((y) => (
              <line
                key={y}
                x1="0"
                y1={y}
                x2="1000"
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 5"
              />
            ))}
            <path
              d="M0 95 25 92 50 100 75 85 100 90 125 78 150 87 175 70 200 75 225 68 250 80 275 66 300 75 325 63 350 73 375 70 400 77 425 45 450 35 475 52 500 70 525 74 550 69 575 78 600 63 625 72 650 80 675 67 700 71 725 65 750 68 775 56 800 61 825 47 850 58 875 61 900 65 925 55 950 66 975 61 1000 62 1000 140 0 140Z"
              fill="url(#preview-fill)"
            />
            <path
              d="M0 95 25 92 50 100 75 85 100 90 125 78 150 87 175 70 200 75 225 68 250 80 275 66 300 75 325 63 350 73 375 70 400 77 425 45 450 35 475 52 500 70 525 74 550 69 575 78 600 63 625 72 650 80 675 67 700 71 725 65 750 68 775 56 800 61 825 47 850 58 875 61 900 65 925 55 950 66 975 61 1000 62"
              fill="none"
              stroke="#818cf8"
              strokeWidth="2.5"
            />
          </svg>
          <div className="preview-services">
            {[
              ["Production API", "Operational", "142 ms"],
              ["Web application", "Operational", "87 ms"],
              ["Payment gateway", "Down", "1,284 ms"],
            ].map(([name, status, latency]) => (
              <div key={name}>
                <Radio size={13} />
                <strong>{name}</strong>
                <span className={status === "Down" ? "red" : "green"}>
                  <span className="tiny-live" />
                  {status}
                </span>
                <span>{latency}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}
export function Login() {
  const health = useQuery({
      queryKey: ["health"],
      queryFn: () => request<{ authConfigured: boolean }>("/api/health"),
      retry: false,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function signin() {
    setBusy(true);
    setError("");
    try {
      const result = await createAuthClient().signIn.social({
        provider: "github",
        callbackURL: "/app",
      });
      if (result.error) throw new Error(result.error.message);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <Link className="login-home" to="/">
        <Logo />
      </Link>
      <div className="login-card">
        <span className="login-icon">
          <ShieldCheck size={28} />
        </span>
        <span className="eyebrow">WELCOME TO YOUR NEXT QUIET SHIFT</span>
        <h1>A clearer view starts here.</h1>
        <p>
          Sign in to your WatchTower workspace.
          <br />
          Your services will thank you.
        </p>
        <Button
          onClick={() => void signin()}
          disabled={!health.data?.data.authConfigured || busy}
        >
          <Github size={18} />
          {busy ? "Connecting to GitHub…" : "Continue with GitHub"}
        </Button>
        {(error ||
          new URLSearchParams(window.location.search).get("error")) && (
          <div className="error-callout" role="alert">
            {error || "Sign-in failed. Please try again."}
          </div>
        )}
        {health.error && (
          <div className="error-callout">{health.error.message}</div>
        )}
        {health.data && !health.data.data.authConfigured && (
          <div className="info-callout">
            GitHub OAuth hasn’t been configured on this installation. The public
            demo is ready to explore.
          </div>
        )}
        <div className="login-divider">or take a look around</div>
        <Button variant="outline" asChild>
          <Link to="/demo">
            Explore the read-only demo
            <ArrowUpRight size={15} />
          </Link>
        </Button>
        <small>
          No account or credentials needed for the demo.
          <br />
          Demo data is synthetic and clearly labeled.
        </small>
      </div>
      <footer>
        <LockKeyhole size={13} /> Secure, cookie-based sessions. No passwords to
        remember.
      </footer>
    </div>
  );
}
export function Guide() {
  return (
    <div className="guide">
      <nav>
        <Link to="/">
          <Logo />
        </Link>
        <Button asChild variant="outline">
          <Link to="/demo">
            Open demo
            <ArrowUpRight size={14} />
          </Link>
        </Button>
      </nav>
      <Link className="back-link" to="/">
        <ArrowLeft size={14} /> Back to WatchTower
      </Link>
      <span className="eyebrow">THE SHORT VERSION</span>
      <h1>Your first quiet shift.</h1>
      <p className="guide-intro">
        A practical guide to getting a WatchTower workspace up and running.
      </p>
      <article>
        {[
          {
            Icon: Terminal,
            title: "Start locally",
            copy: "Install Node.js 22.12 or newer. From the project directory, run the commands below. Migrations create the local D1 database; the seed loads the synthetic demo.",
            code: "npm install\nnpm run db:migrate:local\nnpm run db:seed\nnpm run dev",
          },
          {
            Icon: GitBranch,
            title: "Connect GitHub sign-in",
            copy: "Copy .dev.vars.example to .dev.vars. Set a random BETTER_AUTH_SECRET and your GitHub OAuth app credentials. Use http://localhost:5173 as the homepage and http://localhost:5173/api/auth/callback/github as the callback. Restart development after changing variables.",
          },
          {
            Icon: ShieldCheck,
            title: "Approve the destinations you own",
            copy: "Set APPROVED_MONITOR_HOSTS to exact, trusted public hostnames separated by commas. No wildcards, IP literals, private networks, or unchecked redirects. This is an operator approval step, not domain ownership verification. Only approve domains with trusted DNS administration.",
          },
          {
            Icon: Radio,
            title: "Create a workspace and add a monitor",
            copy: "Sign in, create a workspace, and add an approved public HTTP/HTTPS endpoint. Five minutes is the default interval. A new monitor stays pending until its first completed check.",
          },
          {
            Icon: Timer,
            title: "Trigger local monitoring",
            copy: "Cloudflare Cron events run automatically after deployment. Locally, keep the dev server running and invoke the script below. You can also call /cdn-cgi/handler/scheduled on the local development server.",
            code: "npm run check:scheduled",
          },
          {
            Icon: BellIcon,
            title: "Choose where alerts go",
            copy: "In-app notifications work immediately. To add Discord, set CHANNEL_ENCRYPTION_KEY to 32 random bytes encoded as base64, then add a webhook in Settings. Resend email is optional and requires a verified sender domain.",
          },
          {
            Icon: Globe,
            title: "Share a public status page",
            copy: "Select services, choose their order, and publish a status page. Customers can open /status/your-slug without signing in. Monitor URLs and internal errors remain private.",
          },
          {
            Icon: Zap,
            title: "Deploy on your own free Cloudflare account",
            copy: "Follow DEPLOYMENT.md in the repository for D1 creation, migrations, OAuth callback URLs, secrets, and Workers deployment. A workers.dev subdomain is sufficient. Monitor CPU time and D1 usage before increasing the conservative deployment limits.",
          },
        ].map(({ Icon, title, copy, code }, i) => (
          <section key={title}>
            <span className="guide-step">{i + 1}</span>
            <div>
              <h2>
                <Icon size={19} />
                {title}
              </h2>
              <p>{copy}</p>
              {code && <pre>{code}</pre>}
            </div>
          </section>
        ))}
      </article>
    </div>
  );
}
function BellIcon() {
  return <Radio size={19} />;
}
export function AcceptInvite() {
  const { token } = useParams(),
    navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="login-page">
      <Link to="/">
        <Logo />
      </Link>
      <div className="login-card">
        <h1>A shared view awaits.</h1>
        <p>
          Sign in with the GitHub email named on your invitation, then accept
          below.
        </p>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await request<{ workspaceId: string }>(
                "/api/workspaces/accept-invitation",
                { method: "POST", body: JSON.stringify({ token }) },
              );
              localStorage.setItem(
                "watchtower-workspace",
                result.data.workspaceId,
              );
              toast.success("You joined the workspace");
              navigate("/app");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Accept workspace invitation
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const result = await createAuthClient().signIn.social({
              provider: "github",
              callbackURL: window.location.pathname,
            });
            if (result.error)
              setError(result.error.message ?? "Sign-in failed");
          }}
        >
          <Github size={16} /> Sign in with GitHub
        </Button>
        {error && <div className="error-callout">{error}</div>}
      </div>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="not-found">
      <Logo />
      <span>404</span>
      <h1>This signal leads nowhere.</h1>
      <p>The page may have moved, or the link may be incorrect.</p>
      <Button asChild>
        <Link to="/">
          Back to WatchTower
          <ArrowRight size={15} />
        </Link>
      </Button>
    </div>
  );
}
