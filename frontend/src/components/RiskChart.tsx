import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { probabilityCurve, riskClasses, type RiskLevel } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

const axis = {
  stroke: "var(--border)",
  tick: { fill: "var(--muted-foreground)", fontSize: 9, fontFamily: "var(--font-mono)" },
};

export function ProbabilityChart() {
  return (
    <div className="h-[260px] w-full px-2 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={probabilityCurve} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="pcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--risk-critical)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--risk-critical)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="ucFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="t" interval={3} {...axis} />
          <YAxis unit="%" {...axis} />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 2,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <ReferenceLine
            y={5}
            stroke="var(--risk-critical)"
            strokeDasharray="4 4"
            label={{
              value: "CRITICAL 5%",
              fill: "var(--risk-critical)",
              fontSize: 9,
              position: "insideTopRight",
            }}
          />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="var(--cyan)"
            strokeWidth={1}
            strokeDasharray="3 3"
            fill="url(#ucFill)"
            isAnimationActive
            animationDuration={900}
          />
          <Area
            type="monotone"
            dataKey="probability"
            stroke="var(--risk-critical)"
            strokeWidth={2}
            fill="url(#pcFill)"
            isAnimationActive
            animationDuration={1200}
          />
          <Line type="monotone" dataKey="lower" stroke="var(--muted-foreground)" strokeWidth={1} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskScale({ current }: { current: RiskLevel }) {
  const levels: RiskLevel[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];
  return (
    <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
      {levels.map((l) => {
        const r = riskClasses[l];
        const active = l === current;
        return (
          <div
            key={l}
            className={cn(
              "border px-3 py-2 transition-all",
              active ? cn(r.border, r.bg) : "border-border bg-background/30 opacity-55",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", r.dot, active && "animate-pulse-ring")} />
              <span className={cn("font-mono text-[10px] tracking-[0.18em]", active ? r.text : "text-muted-foreground")}>
                {l}
              </span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">{r.range}</p>
          </div>
        );
      })}
    </div>
  );
}
