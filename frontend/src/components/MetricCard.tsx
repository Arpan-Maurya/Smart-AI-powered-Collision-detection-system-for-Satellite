import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function useCountUp(target: number, decimals = 0, duration = 1100) {
  const [value, setValue] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface MetricProps {
  label: string;
  value: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
  trend?: string;
  tone?: "primary" | "critical" | "moderate" | "violet" | "low";
  sparkline?: number[];
}

const toneMap = {
  primary: "text-primary",
  critical: "text-risk-critical",
  moderate: "text-risk-moderate",
  violet: "text-accent",
  low: "text-risk-low",
} as const;

const strokeMap = {
  primary: "var(--cyan)",
  critical: "var(--risk-critical)",
  moderate: "var(--risk-moderate)",
  violet: "var(--violet)",
  low: "var(--risk-low)",
} as const;

export function MetricCard({
  label,
  value,
  decimals = 0,
  suffix,
  prefix,
  trend,
  tone = "primary",
  sparkline,
}: MetricProps) {
  const display = useCountUp(value, decimals);
  const pts = sparkline ?? [];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const path = pts
    .map((v, i) => {
      const x = (i / Math.max(1, pts.length - 1)) * 100;
      const y = 26 - ((v - min) / Math.max(0.0001, max - min)) * 22;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <div className="panel group relative px-3.5 py-3">
      <div className="absolute inset-x-0 top-0 h-px overflow-hidden">
        <span className="scanline animate-sweep block h-px w-1/3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="tech-label">{label}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p
          className={cn(
            "font-mono text-2xl leading-none tracking-tight",
            toneMap[tone],
          )}
        >
          {prefix}
          {display}
          {suffix ? (
            <span className="ml-0.5 text-sm text-muted-foreground">{suffix}</span>
          ) : null}
        </p>
        {pts.length > 1 && (
          <svg viewBox="0 0 100 28" className="h-7 w-20 opacity-70" preserveAspectRatio="none">
            <path d={path} fill="none" stroke={strokeMap[tone]} strokeWidth="1.5" />
          </svg>
        )}
      </div>
      {trend ? (
        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{trend}</p>
      ) : null}
    </div>
  );
}
