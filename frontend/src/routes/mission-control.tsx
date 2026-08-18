import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CommandLayout } from "@/components/CommandLayout";
import { MetricCard } from "@/components/MetricCard";
import { AlertPanel } from "@/components/AlertPanel";
import { AIAnalysis } from "@/components/AIAnalysis";
import { OrbitalViewport } from "@/components/orbital/OrbitalViewport";
import { SatellitePanel, resolveSatellite } from "@/components/SatellitePanel";
import { DEFAULT_FILTERS, type SceneFilters } from "@/components/orbital/OrbitalScene";
import type { SatelliteRecord } from "@/lib/orbital-data";

export const Route = createFileRoute("/mission-control")({
  head: () => ({
    meta: [
      { title: "Mission Control — Orbital AI" },
      {
        name: "description",
        content:
          "Live orbital command center: catalogue health, active conjunction alerts and AI collision analysis in one view.",
      },
      { property: "og:title", content: "Mission Control — Orbital AI" },
      {
        property: "og:description",
        content: "Live orbital command center for mega-constellation collision risk.",
      },
    ],
  }),
  component: MissionControl,
});

const spark = (n: number, amp: number) =>
  Array.from({ length: 14 }, (_, i) => n + Math.sin(i / 1.7) * amp + i * (amp / 8));

function MissionControl() {
  const [filters, setFilters] = useState<SceneFilters>(DEFAULT_FILTERS);
  const [sat, setSat] = useState<SatelliteRecord | null>(null);

  return (
    <CommandLayout title="MISSION CONTROL" subtitle="OVERVIEW · REAL-TIME ORBITAL PICTURE">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Active Objects" value={24681} trend="+128 / 24H" sparkline={spark(24000, 90)} />
        <MetricCard label="Tracked Satellites" value={18420} trend="CATALOGUE SYNCED" tone="violet" sparkline={spark(18200, 60)} />
        <MetricCard label="Close Approaches" value={127} trend="SCREENING WINDOW 7D" tone="moderate" sparkline={spark(110, 12)} />
        <MetricCard label="High-Risk Events" value={8} decimals={0} prefix="0" trend="ESCALATION REQUIRED" tone="critical" sparkline={spark(6, 2)} />
        <MetricCard label="AI Confidence" value={96.8} decimals={1} suffix="%" trend="MODEL v4.2" tone="low" sparkline={spark(95, 1)} />
        <MetricCard label="Last Update" value={12} suffix="s" trend="STREAM LATENCY 0.4 s" sparkline={spark(11, 3)} />
      </div>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <OrbitalViewport
          className="h-[420px] border border-border lg:h-[620px]"
          filters={filters}
          onFiltersChange={setFilters}
          onSelect={(o) => setSat(resolveSatellite(o.label, o.constellation))}
        />

        <div className="flex flex-col gap-3">
          {sat ? (
            <SatellitePanel sat={sat} onClose={() => setSat(null)} />
          ) : (
            <AlertPanel limit={4} className="max-h-[420px]" />
          )}
          <AIAnalysis />
        </div>
      </div>
    </CommandLayout>
  );
}
