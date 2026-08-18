import { Link } from "@tanstack/react-router";
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { CONJUNCTIONS, riskClasses, SATELLITES, type SatelliteRecord } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function syntheticRecord(id: string, constellation: string): SatelliteRecord {
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = (n: number) => ((seed * 9301 + n * 49297) % 233280) / 233280;
  return {
    id,
    norad: String(20000 + (seed % 70000)),
    constellation: constellation.toUpperCase(),
    orbitType: constellation === "gps" ? "MEO" : "LEO",
    altitude: Number((450 + rnd(3) * 900).toFixed(1)),
    inclination: Number((30 + rnd(5) * 60).toFixed(2)),
    velocity: Number((7.2 + rnd(7) * 0.6).toFixed(2)),
    eccentricity: Number((rnd(11) * 0.001).toFixed(7)),
    status: constellation === "debris" ? "DEBRIS" : "OPERATIONAL",
    lastUpdate: `${4 + (seed % 40)} s ago`,
    risk: rnd(13) > 0.8 ? "HIGH" : rnd(17) > 0.6 ? "MODERATE" : "LOW",
  };
}

export function resolveSatellite(id: string, constellation: string): SatelliteRecord {
  return SATELLITES.find((s) => s.id === id) ?? syntheticRecord(id, constellation);
}

const altitudeSeries = (base: number) =>
  Array.from({ length: 30 }, (_, i) => ({
    t: `T-${(30 - i) * 4}m`,
    altitude: Number((base + Math.sin(i / 3.2) * 1.6 + Math.sin(i / 1.1) * 0.4).toFixed(2)),
  }));

export function SatellitePanel({
  sat,
  onClose,
  className,
}: {
  sat: SatelliteRecord;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const r = riskClasses[sat.risk];
  const related = CONJUNCTIONS.filter(
    (c) => c.primary === sat.id || c.secondary === sat.id,
  );
  const conjunctions = related.length ? related : CONJUNCTIONS.slice(1, 4);

  const rows: [string, string][] = [
    ["NORAD ID", sat.norad],
    ["CONSTELLATION", sat.constellation],
    ["ORBIT TYPE", sat.orbitType],
    ["ALTITUDE", `${sat.altitude} km`],
    ["INCLINATION", `${sat.inclination}°`],
    ["VELOCITY", `${sat.velocity} km/s`],
    ["ECCENTRICITY", sat.eccentricity.toFixed(7)],
    ["LAST POSITION UPDATE", sat.lastUpdate],
  ];

  return (
    <Panel className={cn("flex flex-col", className)}>
      <PanelHeader
        title={sat.id}
        meta={`${sat.constellation}`}
        action={
          onClose ? (
            <button type="button" onClick={onClose} aria-label="Close panel">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          ) : null
        }
      />
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-risk-low">
          <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
          {sat.status}
        </span>
        <span className={cn("font-mono text-[10px] tracking-[0.18em]", r.text)}>
          RISK {sat.risk}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-border/50">
        {rows.map(([k, v]) => (
          <div key={k} className="bg-background/40 px-3 py-2">
            <dt className="tech-label">{k}</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="border-t border-border px-2 pb-1 pt-2">
        <p className="tech-label px-2">Orbital trajectory · altitude profile</p>
        <div className="h-[130px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={altitudeSeries(sat.altitude)} margin={{ top: 8, right: 8, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="altFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--cyan)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--cyan)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid)" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis
                domain={["dataMin - 2", "dataMax + 2"]}
                tick={{ fill: "var(--muted-foreground)", fontSize: 9 }}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                }}
              />
              <Area type="monotone" dataKey="altitude" stroke="var(--cyan)" strokeWidth={1.6} fill="url(#altFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border-t border-border">
        <p className="tech-label px-4 py-2">Upcoming conjunctions</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-left font-mono text-[10px]">
            <thead className="bg-surface-2 text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-normal tracking-[0.14em]">OBJECT</th>
                <th className="px-3 py-1.5 font-normal tracking-[0.14em]">TCA</th>
                <th className="px-3 py-1.5 font-normal tracking-[0.14em]">MISS</th>
                <th className="px-3 py-1.5 font-normal tracking-[0.14em]">RISK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conjunctions.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5 text-foreground">
                    {c.primary === sat.id ? c.secondary : c.primary}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.tca}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.missDistance} m</td>
                  <td className={cn("px-3 py-1.5", riskClasses[c.risk].text)}>{c.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Link
        to="/collision-risk"
        className="m-4 border border-primary/50 bg-primary/10 py-2.5 text-center font-mono text-[10px] tracking-[0.24em] text-primary transition-colors hover:bg-primary/20"
      >
        VIEW FULL ANALYSIS
      </Link>
    </Panel>
  );
}
