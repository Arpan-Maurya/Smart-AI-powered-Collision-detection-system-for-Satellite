import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CommandLayout } from "@/components/CommandLayout";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { ProbabilityChart, RiskScale } from "@/components/RiskChart";
import { AIAnalysis } from "@/components/AIAnalysis";
import { ManeuverSimulation } from "@/components/ManeuverSimulation";
import { OrbitalViewport } from "@/components/orbital/OrbitalViewport";
import { DEFAULT_FILTERS } from "@/components/orbital/OrbitalScene";
import { PRIMARY_EVENT, riskClasses } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/collision-risk")({
  head: () => ({
    meta: [
      { title: "Collision Risk Intelligence — Orbital AI" },
      {
        name: "description",
        content:
          "Probability-versus-time curves, covariance uncertainty, miss distance and AI risk classification for active satellite conjunctions.",
      },
      { property: "og:title", content: "Collision Risk Intelligence — Orbital AI" },
      {
        property: "og:description",
        content: "Collision probability, uncertainty modeling and maneuver mitigation.",
      },
    ],
  }),
  component: CollisionRisk,
});

function KeyValue({ k, v, tone }: { k: string; v: string; tone?: string | undefined }) {
  return (
    <div className="bg-background/40 px-3 py-2.5">
      <p className="tech-label">{k}</p>
      <p className={cn("mt-1 font-mono text-[15px]", tone ?? "text-foreground")}>{v}</p>
    </div>
  );
}

function CollisionRisk() {
  const [simulated, setSimulated] = useState(false);
  const r = riskClasses[PRIMARY_EVENT.risk];

  return (
    <CommandLayout title="COLLISION RISK" subtitle={`PRIMARY EVENT · ${PRIMARY_EVENT.id}`}>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Panel>
            <PanelHeader
              title={`${PRIMARY_EVENT.primary} × ${PRIMARY_EVENT.secondary}`}
              meta={`SCREENING VOLUME 2.0 km`}
              action={
                <span className={cn("flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em]", r.text)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", r.dot, "animate-pulse-ring")} />
                  {PRIMARY_EVENT.risk}
                </span>
              }
            />
            <div className="grid grid-cols-2 gap-px bg-border/50 md:grid-cols-4">
              <KeyValue k="Current Probability" v={`${simulated ? 0.03 : PRIMARY_EVENT.probability}%`} tone={simulated ? "text-risk-low" : "text-risk-critical"} />
              <KeyValue k="Maximum Probability" v="9.14%" tone="text-risk-critical" />
              <KeyValue k="Time of Closest Approach" v={PRIMARY_EVENT.tca} />
              <KeyValue k="Miss Distance" v={simulated ? "2.80 km" : `${PRIMARY_EVENT.missDistance} m`} tone={simulated ? "text-risk-low" : "text-risk-high"} />
              <KeyValue k="Relative Velocity" v={`${PRIMARY_EVENT.relativeVelocity} km/s`} />
              <KeyValue k="Position Uncertainty" v="±74 m (1σ)" />
              <KeyValue k="Prediction Confidence" v={`${PRIMARY_EVENT.confidence}%`} tone="text-primary" />
              <KeyValue k="Objects At Risk" v="2 · LEO 550 km SHELL" />
            </div>
            <ProbabilityChart />
            <div className="border-t border-border">
              <p className="tech-label px-4 pt-3">Risk classification</p>
              <RiskScale current={simulated ? "LOW" : PRIMARY_EVENT.risk} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="CONJUNCTION GEOMETRY"
              meta={simulated ? "PROPOSED TRAJECTORY" : "CURRENT TRAJECTORY"}
            />
            <OrbitalViewport
              className="h-[380px]"
              showControls={false}
              compact
              filters={{
                ...DEFAULT_FILTERS,
                constellations: { starlink: true, oneweb: true, gps: false, custom: false },
                debris: false,
                paths: false,
                maneuver: simulated,
              }}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <AIAnalysis />
          <ManeuverSimulation simulated={simulated} onSimulate={setSimulated} />
        </div>
      </div>
    </CommandLayout>
  );
}
