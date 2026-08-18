import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CommandLayout } from "@/components/CommandLayout";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { MetricCard } from "@/components/MetricCard";
import { CONSTELLATIONS, conjunctionTrend, forecast24h } from "@/lib/orbital-data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Orbital AI" },
      {
        name: "description",
        content:
          "Model performance, screening throughput and constellation exposure analytics for the orbital collision risk engine.",
      },
      { property: "og:title", content: "Analytics — Orbital AI" },
      {
        property: "og:description",
        content: "Engine throughput, model accuracy and per-network risk exposure.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const tick = { fill: "var(--muted-foreground)", fontSize: 9 };
const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  fontFamily: "var(--font-mono)",
  fontSize: 11,
};

const modelPerf = Array.from({ length: 14 }, (_, i) => ({
  day: `D-${14 - i}`,
  precision: Number((0.88 + Math.sin(i / 2.4) * 0.04 + i * 0.003).toFixed(3)),
  recall: Number((0.84 + Math.cos(i / 3.1) * 0.05 + i * 0.004).toFixed(3)),
}));

const exposure = CONSTELLATIONS.map((c) => ({
  name: c.name.split(" ")[0],
  exposure: Math.round((c.objects / 130) * (100 - c.operational) * 8 + 20),
}));

const radar = [
  { axis: "PROPAGATION", v: 94 },
  { axis: "COVARIANCE", v: 88 },
  { axis: "SCREENING", v: 97 },
  { axis: "Pc MODEL", v: 92 },
  { axis: "MANEUVER OPT", v: 86 },
  { axis: "LATENCY", v: 90 },
];

function AnalyticsPage() {
  return (
    <CommandLayout title="ANALYTICS" subtitle="ENGINE PERFORMANCE & EXPOSURE">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Screenings / Hour" value={412000} trend="GPU CLUSTER 8×" />
        <MetricCard label="Model Precision" value={94.1} decimals={1} suffix="%" tone="low" trend="14-DAY ROLLING" />
        <MetricCard label="False Alert Rate" value={2.3} decimals={1} suffix="%" tone="moderate" trend="-0.4 pts WoW" />
        <MetricCard label="Median Latency" value={412} suffix="ms" tone="violet" trend="INGEST → ALERT" />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="MODEL PERFORMANCE" meta="PRECISION / RECALL · 14 DAYS" />
          <div className="h-[260px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={modelPerf} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="day" tick={tick} stroke="var(--border)" />
                <YAxis domain={[0.75, 1]} tick={tick} stroke="var(--border)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="precision" stroke="var(--cyan)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="recall" stroke="var(--violet)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="ENGINE CAPABILITY" meta="NORMALIZED SCORE" />
          <div className="h-[260px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="var(--grid)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted-foreground)", fontSize: 8 }} />
                <Radar dataKey="v" stroke="var(--cyan)" fill="var(--cyan)" fillOpacity={0.22} />
                <Tooltip contentStyle={tooltipStyle} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="NETWORK EXPOSURE" meta="RISK-WEIGHTED" />
          <div className="h-[240px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exposure} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="name" tick={tick} stroke="var(--border)" />
                <YAxis tick={tick} stroke="var(--border)" />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--grid)" }} />
                <Bar dataKey="exposure" fill="var(--risk-high)" radius={[1, 1, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader title="CONJUNCTION LOAD" meta="30-DAY HISTORY vs 24H FORECAST" />
          <div className="h-[240px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={conjunctionTrend["30D"].map((d, i) => ({
                  ...d,
                  forecast: forecast24h[i % 24]!.conjunctions * 22,
                }))}
                margin={{ top: 10, right: 12, bottom: 0, left: -18 }}
              >
                <CartesianGrid stroke="var(--grid)" vertical={false} />
                <XAxis dataKey="label" interval={4} tick={tick} stroke="var(--border)" />
                <YAxis tick={tick} stroke="var(--border)" />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey="events" stroke="var(--cyan)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="forecast" stroke="var(--risk-moderate)" strokeWidth={1.4} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </CommandLayout>
  );
}
