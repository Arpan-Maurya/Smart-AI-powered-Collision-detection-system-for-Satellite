import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Radar,
  Satellite,
  ShieldAlert,
  LineChart,
  Bell,
  Activity,
  Menu,
  X,
  CircleUser,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/mission-control", label: "Mission Control", icon: Radar },
  { to: "/constellations", label: "Constellations", icon: Satellite },
  { to: "/collision-risk", label: "Collision Risk", icon: ShieldAlert },
  { to: "/predictions", label: "Predictions", icon: LineChart },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/analytics", label: "Analytics", icon: Activity },
] as const;

function useUtcClock() {
  const [now, setNow] = useState<string>("--:--:--");
  useEffect(() => {
    const tick = () =>
      setNow(new Date().toISOString().slice(11, 19) + " UTC");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function SystemStatus() {
  return (
    <div className="space-y-1.5 border-t border-sidebar-border px-4 py-4">
      <p className="tech-label">System Status</p>
      {[
        ["AI ENGINE ONLINE", "bg-risk-low"],
        ["TRACKING ONLINE", "bg-risk-low"],
        ["DATA STREAM ACTIVE", "bg-primary"],
      ].map(([label, dot]) => (
        <div key={label} className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
          <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CommandLayout({
  children,
  title,
  subtitle,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string | undefined;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const clock = useUtcClock();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen bg-background text-foreground">
      <div className="grid-overlay pointer-events-none fixed inset-0 opacity-60" />
      <div className="pointer-events-none fixed inset-0 [background:radial-gradient(120%_80%_at_70%_-10%,color-mix(in_oklab,var(--violet)_12%,transparent),transparent_60%)]" />

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed z-40 flex h-screen w-60 flex-col border-r border-sidebar-border bg-sidebar/90 backdrop-blur-xl transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Link to="/" className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
          <span className="relative flex h-7 w-7 items-center justify-center border border-primary/50">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="absolute inset-0 animate-radar rounded-none border-t border-primary/60" />
          </span>
          <span>
            <span className="block font-mono text-sm tracking-[0.24em] text-foreground">
              ORBITAL AI
            </span>
            <span className="tech-label">SSA PLATFORM v2.4</span>
          </span>
        </Link>

        <nav className="flex-1 space-y-0.5 px-2 py-3">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={cn(
                  "group flex items-center gap-2.5 border-l-2 px-3 py-2 font-mono text-[11px] tracking-[0.14em] transition-colors",
                  active
                    ? "border-l-primary bg-primary/10 text-primary"
                    : "border-l-transparent text-muted-foreground hover:border-l-primary/40 hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                {label.toUpperCase()}
              </Link>
            );
          })}
        </nav>

        <SystemStatus />
      </aside>

      {/* Main */}
      <div className="relative flex min-h-screen flex-1 flex-col lg:ml-60">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="border border-border p-1.5 text-muted-foreground lg:hidden"
              aria-label="Toggle navigation"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div>
              <h1 className="font-mono text-[13px] tracking-[0.24em] text-foreground">
                {title}
              </h1>
              {subtitle ? <p className="tech-label mt-0.5">{subtitle}</p> : null}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 md:flex">
              <StatusChip label="SYSTEM" value="NOMINAL" tone="low" />
              <StatusChip label="AI ENGINE" value="ACTIVE" tone="primary" />
              <StatusChip label="DATA SYNC" value="12s" tone="violet" />
            </div>
            <span className="font-mono text-[11px] tracking-[0.14em] text-primary">
              {clock}
            </span>
            <CircleUser className="h-5 w-5 text-muted-foreground" strokeWidth={1.4} />
          </div>
        </header>

        <main className="relative flex-1 p-4">{children}</main>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "low" | "primary" | "violet";
}) {
  const dot =
    tone === "low" ? "bg-risk-low" : tone === "primary" ? "bg-primary" : "bg-accent";
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="tech-label">{label}</span>
      <span className="font-mono text-[10px] text-foreground/80">{value}</span>
    </span>
  );
}
