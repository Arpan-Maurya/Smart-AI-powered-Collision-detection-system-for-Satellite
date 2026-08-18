import { useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { maneuver } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";
import { ArrowRight, Rocket, GitCompareArrows } from "lucide-react";

const OPTIONS = [
  { id: "raise", label: "RAISE ALTITUDE +42 m", pc: 0.03, miss: 2800, fuel: "LOW", dv: 0.019, conf: 94.2 },
  { id: "lower", label: "LOWER ALTITUDE −65 m", pc: 0.11, miss: 1950, fuel: "LOW", dv: 0.026, conf: 91.7 },
  { id: "phase", label: "IN-TRACK PHASE SHIFT", pc: 0.42, miss: 940, fuel: "MINIMAL", dv: 0.008, conf: 87.4 },
];

export function ManeuverSimulation({
  simulated,
  onSimulate,
}: {
  simulated: boolean;
  onSimulate: (v: boolean) => void;
}) {
  const [compare, setCompare] = useState(false);
  const [selected, setSelected] = useState("raise");
  const opt = OPTIONS.find((o) => o.id === selected) ?? OPTIONS[0]!;

  return (
    <Panel className="flex flex-col">
      <PanelHeader
        title="RECOMMENDED ACTION"
        meta={`CONFIDENCE ${opt.conf}%`}
        action={<Rocket className="h-3.5 w-3.5 text-primary" />}
      />
      <div className="space-y-4 p-4">
        <p className="text-[13px] text-foreground/90">
          Orbital maneuver recommended.{" "}
          <span className="text-muted-foreground">
            Execute by {maneuver.executeBy} to preserve the screening margin.
          </span>
        </p>

        <div className="border border-primary/35 bg-primary/5 px-3 py-2.5">
          <p className="tech-label">Proposed maneuver</p>
          <p className="mt-1 font-mono text-[13px] text-primary">{opt.label}</p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            Δv {opt.dv} m/s · FUEL IMPACT {opt.fuel}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Delta
            label="COLLISION PROBABILITY"
            before="8.7%"
            after={`${opt.pc}%`}
            good={simulated}
          />
          <Delta
            label="MISS DISTANCE"
            before="184 m"
            after={`${(opt.miss / 1000).toFixed(2)} km`}
            good={simulated}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onSimulate(!simulated)}
            className={cn(
              "border py-2.5 font-mono text-[10px] tracking-[0.2em] transition-colors",
              simulated
                ? "border-risk-low/60 bg-risk-low/15 text-risk-low"
                : "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20",
            )}
          >
            {simulated ? "REVERT TO CURRENT" : "SIMULATE MANEUVER"}
          </button>
          <button
            type="button"
            onClick={() => setCompare((v) => !v)}
            className="flex items-center justify-center gap-1.5 border border-border py-2.5 font-mono text-[10px] tracking-[0.2em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <GitCompareArrows className="h-3 w-3" />
            COMPARE OPTIONS
          </button>
        </div>

        {compare && (
          <div className="animate-rise overflow-x-auto border border-border">
            <table className="w-full min-w-[420px] text-left font-mono text-[10px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">OPTION</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">Pc</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">MISS</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">FUEL</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">CONF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {OPTIONS.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o.id)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-2",
                      o.id === selected && "bg-primary/10 text-primary",
                    )}
                  >
                    <td className="px-2 py-1.5">{o.label}</td>
                    <td className="px-2 py-1.5 text-risk-low">{o.pc}%</td>
                    <td className="px-2 py-1.5">{o.miss} m</td>
                    <td className="px-2 py-1.5">{o.fuel}</td>
                    <td className="px-2 py-1.5">{o.conf}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Delta({
  label,
  before,
  after,
  good,
}: {
  label: string;
  before: string;
  after: string;
  good: boolean;
}) {
  return (
    <div className="border border-border bg-background/30 px-3 py-2">
      <p className="tech-label">{label}</p>
      <div className="mt-1 flex items-center gap-1.5 font-mono text-[12px]">
        <span className={cn(good ? "text-muted-foreground line-through" : "text-risk-critical")}>
          {before}
        </span>
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
        <span className={cn(good ? "text-risk-low" : "text-muted-foreground")}>{after}</span>
      </div>
    </div>
  );
}
