import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CommandLayout } from "@/components/CommandLayout";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { OrbitalViewport } from "@/components/orbital/OrbitalViewport";
import { DEFAULT_FILTERS, type SceneFilters } from "@/components/orbital/OrbitalScene";
import { SatellitePanel, resolveSatellite } from "@/components/SatellitePanel";
import { CONSTELLATIONS, type SatelliteRecord } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/constellations")({
  head: () => ({
    meta: [
      { title: "Constellations — Orbital AI" },
      {
        name: "description",
        content:
          "Fleet-level view of Starlink, OneWeb, GPS and custom constellations with shell altitude, inclination and operational health.",
      },
      { property: "og:title", content: "Constellations — Orbital AI" },
      {
        property: "og:description",
        content: "Filter the live orbital picture by satellite network.",
      },
    ],
  }),
  component: ConstellationsPage,
});

const accent: Record<string, string> = {
  cyan: "text-primary",
  violet: "text-accent",
  moderate: "text-risk-moderate",
  low: "text-risk-low",
};

function ConstellationsPage() {
  const [filters, setFilters] = useState<SceneFilters>(DEFAULT_FILTERS);
  const [sat, setSat] = useState<SatelliteRecord | null>(null);

  const isolate = (id: string) =>
    setFilters({
      ...filters,
      constellations: Object.fromEntries(
        CONSTELLATIONS.map((c) => [c.id, c.id === id]),
      ),
      debris: false,
    });

  const showAll = () =>
    setFilters({
      ...filters,
      constellations: Object.fromEntries(CONSTELLATIONS.map((c) => [c.id, true])),
      debris: true,
    });

  const selected = CONSTELLATIONS.filter((c) => filters.constellations[c.id]);

  return (
    <CommandLayout title="CONSTELLATIONS" subtitle="NETWORK FLEET MANAGEMENT">
      <div className="grid gap-3 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Panel>
            <PanelHeader
              title="SATELLITE NETWORKS"
              meta={`${selected.length}/${CONSTELLATIONS.length} VISIBLE`}
              action={
                <button
                  type="button"
                  onClick={showAll}
                  className="font-mono text-[10px] tracking-[0.16em] text-primary hover:underline"
                >
                  SHOW ALL
                </button>
              }
            />
            <div className="divide-y divide-border">
              {CONSTELLATIONS.map((c) => {
                const on = filters.constellations[c.id] !== false;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => isolate(c.id)}
                    className={cn(
                      "w-full px-4 py-3 text-left transition-colors hover:bg-surface-2",
                      on ? "opacity-100" : "opacity-45",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("font-mono text-[12px] tracking-[0.18em]", accent[c.color])}>
                        {c.name}
                      </span>
                      <span className="tech-label">{c.regime}</span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      {c.objects.toLocaleString()} objects · {c.operational}% operational
                    </p>
                    <div className="mt-2 h-1 w-full bg-border/60">
                      <div
                        className={cn(
                          "h-1 transition-all duration-700",
                          c.color === "violet" ? "bg-accent" : c.color === "moderate" ? "bg-risk-moderate" : c.color === "low" ? "bg-risk-low" : "bg-primary",
                        )}
                        style={{ width: `${c.operational}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      ALT {c.altitude.toLocaleString()} km · INC {c.inclination}°
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          {sat && <SatellitePanel sat={sat} onClose={() => setSat(null)} />}
        </div>

        <OrbitalViewport
          className="h-[560px] border border-border xl:h-[760px]"
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={(o) => setSat(resolveSatellite(o.label, o.constellation))}
        />
      </div>
    </CommandLayout>
  );
}
