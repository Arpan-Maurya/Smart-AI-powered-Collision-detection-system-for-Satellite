import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandLayout } from "@/components/CommandLayout";
import { Panel, PanelHeader } from "@/components/ui/panel";
import {
  ALT_SHELLS,
  INC_BANDS,
  conjunctionTrend,
  densityGrid,
  forecast24h,
  riskDistribution,
  riskClasses,
} from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/predictions")({
  head: () => ({
    meta: [
      { title: "Predictive Intelligence — Orbital AI" },
      {
        name: "description",
        content:
          "24-hour conjunction forecast, risk distribution, orbital density heatmap and historical close-approach trends.",
      },
      { property: "og:title", content: "Predictive Intelligence — Orbital AI" },
      {
        property: "og:description",
        content: "Forecast orbital congestion and conjunction load before it happens.",
      },
    ],
  }),
  component: PredictionsPage,
});

const tick = { fill: "var(--muted-foreground)", fontSize: 9 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

const DIST_COLORS: Record<string, string> = {
  LOW: "var(--risk-low)",
  MODERATE: "var(--risk-moderate)",
  HIGH: "var(--risk-high)",
  CRITICAL: "var(--risk-critical)",
};

function PredictionsPage() {
  const [range, setRange] = useState<keyof typeof conjunctionTrend>("24H");

  return (
    <CommandLayout title="PREDICTIVE INTELLIGENCE" subtitle="FORECAST · DENSITY · TRENDS">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="24-HOUR RISK FORECAST" meta="PROPAGATED FROM LIVE EPHEMERIDES" />
          <div className="h-[280px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecast24h} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                <defs>
                  <linearGradient id="cjFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--risk-critical)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--risk-critical)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="hour" interval={3} tick={tick} stroke="var(--border)" />
                <YAxis tick={tick} stroke="var(--border)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="conjunctions" stroke="var(--cyan)" strokeWidth={1.8} fill="url(#cjFill)" />
                <Area type="monotone" dataKey="highRisk" stroke="var(--risk-critical)" strokeWidth={1.8} fill="url(#hrFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="RISK DISTRIBUTION" meta="ACTIVE SCREENING WINDOW" />
          <div className="h-[280px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={riskDistribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="var(--background)"
                >
                  {riskDistribution.map((d) => (
                    <Cell key={d.name} fill={DIST_COLORS[d.name]} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  formatter={(v) => (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{v}</span>
                  )}
                />
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="ORBITAL DENSITY" meta="OBJECTS PER SHELL × INCLINATION" />
          <div className="overflow-x-auto p-4">
            <div className="min-w-[420px]">
              <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                <span />
                {INC_BANDS.map((i) => (
                  <span key={i} className="tech-label text-center">{i}</span>
                ))}
                {densityGrid.map((row, ri) => (
                  <Fragment key={`row-${ri}`}>
                    <span className="tech-label self-center">{ALT_SHELLS[ri]}km</span>
                    {row.map((cell, ci) => (
                      <div
                        key={`${ri}-${ci}`}
                        title={`${cell.alt} km · ${cell.inc} · density ${(cell.value * 100).toFixed(0)}%`}
                        className="h-8 border border-border/60 transition-transform hover:scale-105"
                        style={{
                          background: `color-mix(in oklab, ${cell.value > 0.72 ? "var(--risk-critical)" : cell.value > 0.5 ? "var(--risk-moderate)" : "var(--cyan)"} ${Math.round(cell.value * 90)}%, transparent)`,
                        }}
                      />
                    ))}
                  </Fragment>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="tech-label">LOW</span>
                <span className="h-1.5 flex-1 [background:linear-gradient(90deg,color-mix(in_oklab,var(--cyan)_25%,transparent),var(--risk-moderate),var(--risk-critical))]" />
                <span className="tech-label">CONGESTED</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="CONJUNCTION TREND"
            action={
              <div className="flex gap-px">
                {(["24H", "7D", "30D"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn(
                      "border px-2 py-1 font-mono text-[9px] tracking-[0.16em] transition-colors",
                      range === r
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
            }
          />
          <div className="h-[240px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conjunctionTrend[range]} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" interval="preserveStartEnd" tick={tick} stroke="var(--border)" />
                <YAxis tick={tick} stroke="var(--border)" />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--grid)" }} />
                <Bar dataKey="events" fill="var(--violet)" radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {riskDistribution.map((d) => {
          const r = riskClasses[d.key];
          return (
            <div key={d.name} className={cn("panel border-l-2 px-4 py-3", r.border.replace("border-", "border-l-"))}>
              <p className="tech-label">{d.name} EVENTS · NEXT 24H</p>
              <p className={cn("mt-1 font-mono text-2xl", r.text)}>{d.value}</p>
            </div>
          );
        })}
      </div>
    </CommandLayout>
  );
}
