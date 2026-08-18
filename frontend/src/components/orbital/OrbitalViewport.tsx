import { useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { OrbitalScene, DEFAULT_FILTERS, type SceneFilters } from "./OrbitalScene";
import type { OrbitElement } from "./orbital-math";
import { CONSTELLATIONS } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] tracking-[0.16em] transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          active ? "bg-primary" : "bg-muted-foreground/50",
        )}
      />
      {children}
    </button>
  );
}

export function OrbitalViewport({
  className,
  onSelect,
  filters: controlled,
  onFiltersChange,
  showControls = true,
  compact = false,
}: {
  className?: string | undefined;
  onSelect?: ((o: OrbitElement) => void) | undefined;
  filters?: SceneFilters | undefined;
  onFiltersChange?: ((f: SceneFilters) => void) | undefined;
  showControls?: boolean | undefined;
  compact?: boolean | undefined;
}) {
  const [local, setLocal] = useState<SceneFilters>(DEFAULT_FILTERS);
  const filters = controlled ?? local;
  const setFilters = (f: SceneFilters) => {
    setLocal(f);
    onFiltersChange?.(f);
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <ClientOnly
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-background">
            <p className="tech-label animate-pulse">INITIALIZING ORBITAL ENGINE…</p>
          </div>
        }
      >
        <OrbitalScene
          className="h-full w-full"
          filters={filters}
          onSelect={onSelect}
        />
      </ClientOnly>

      {/* HUD frame */}
      <div className="pointer-events-none absolute inset-0">
        <div className="grid-overlay absolute inset-0 opacity-40" />
        <span className="absolute left-3 top-3 h-4 w-4 border-l border-t border-primary/40" />
        <span className="absolute right-3 top-3 h-4 w-4 border-r border-t border-primary/40" />
        <span className="absolute bottom-3 left-3 h-4 w-4 border-b border-l border-primary/40" />
        <span className="absolute bottom-3 right-3 h-4 w-4 border-b border-r border-primary/40" />
        {!compact && (
          <div className="absolute bottom-4 right-4 h-16 w-16 rounded-full border border-primary/25">
            <div className="animate-radar absolute inset-0 rounded-full [background:conic-gradient(from_0deg,transparent_0deg,color-mix(in_oklab,var(--cyan)_35%,transparent)_40deg,transparent_60deg)]" />
            <div className="absolute inset-[30%] rounded-full border border-primary/20" />
          </div>
        )}
        <p className="tech-label absolute left-5 top-5">
          LIVE ORBITAL FEED · J2000 FRAME
        </p>
      </div>

      {showControls && (
        <div className="absolute left-4 top-12 flex max-w-[calc(100%-2rem)] flex-wrap gap-1.5">
          {CONSTELLATIONS.map((c) => (
            <Toggle
              key={c.id}
              active={filters.constellations[c.id] !== false}
              onClick={() =>
                setFilters({
                  ...filters,
                  constellations: {
                    ...filters.constellations,
                    [c.id]: filters.constellations[c.id] === false,
                  },
                })
              }
            >
              {c.name}
            </Toggle>
          ))}
          <Toggle
            active={filters.debris}
            onClick={() => setFilters({ ...filters, debris: !filters.debris })}
          >
            DEBRIS
          </Toggle>
          <Toggle
            active={filters.risk}
            onClick={() => setFilters({ ...filters, risk: !filters.risk })}
          >
            RISK LAYER
          </Toggle>
          <Toggle
            active={filters.paths}
            onClick={() => setFilters({ ...filters, paths: !filters.paths })}
          >
            ORBIT PATHS
          </Toggle>
        </div>
      )}
    </div>
  );
}
