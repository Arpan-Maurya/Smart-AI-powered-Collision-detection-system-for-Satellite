import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Circle,
  AlertTriangle,
  Search,
  RefreshCw,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SatelliteObject, SatGroup } from "@/utils/orbitalPropagation";
import type { GlobeFilters } from "@/components/orbital/LiveOrbitalScene";

type PopoverKey = "filter" | "search" | "info" | null;

function DockButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "flex h-9 w-9 items-center justify-center border transition-colors",
          active
            ? "border-primary/60 bg-primary/15 text-primary"
            : "border-border/70 bg-background/50 text-muted-foreground hover:text-foreground",
        )}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap border border-border bg-background/90 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.16em] text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}

const GROUPS: { key: SatGroup | "all"; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "starlink", label: "STARLINK" },
  { key: "oneweb", label: "ONEWEB" },
  { key: "gps", label: "GPS" },
  { key: "other", label: "OTHER" },
];

export function ControlDock({
  satellites,
  filters,
  onFiltersChange,
  onRefresh,
  refreshing,
  onSelectSatellite,
}: {
  satellites: SatelliteObject[];
  filters: GlobeFilters;
  onFiltersChange: (f: GlobeFilters) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onSelectSatellite: (s: SatelliteObject) => void;
}) {
  const [open, setOpen] = useState<PopoverKey>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open === "search") inputRef.current?.focus();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return satellites
      .filter((s) => s.name.toUpperCase().includes(q) || s.norad.includes(q))
      .slice(0, 12);
  }, [query, satellites]);

  const toggleGroup = (key: SatGroup | "all") => {
    if (key === "all") {
      const allOn = GROUPS.every((g) => filters.groups[g.key] !== false);
      const next = !allOn;
      onFiltersChange({
        ...filters,
        groups: { all: next, starlink: next, oneweb: next, gps: next, other: next },
      });
      return;
    }
    onFiltersChange({
      ...filters,
      groups: { ...filters.groups, [key]: filters.groups[key] === false },
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center pb-4">
      {open === "filter" && (
        <div className="pointer-events-auto mb-2 border border-border bg-background/85 backdrop-blur-xl">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => toggleGroup(g.key)}
              className={cn(
                "flex w-40 items-center gap-2 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] transition-colors",
                filters.groups[g.key] === false
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-primary",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  filters.groups[g.key] === false ? "bg-muted-foreground/50" : "bg-primary",
                )}
              />
              {g.label}
            </button>
          ))}
        </div>
      )}

      {open === "search" && (
        <div className="pointer-events-auto mb-2 w-[min(340px,90vw)] border border-border bg-background/85 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="NAME OR NORAD ID"
              className="w-full bg-transparent font-mono text-[11px] tracking-[0.12em] text-foreground outline-none placeholder:text-muted-foreground/60"
            />
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelectSatellite(s);
                  setOpen(null);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[10px] tracking-[0.12em] text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <span>{s.name}</span>
                <span className="text-[9px]">{s.norad}</span>
              </button>
            ))}
            {query && !results.length && (
              <p className="px-3 py-3 font-mono text-[10px] tracking-[0.14em] text-muted-foreground">
                NO MATCH IN LOADED CATALOGUE
              </p>
            )}
          </div>
        </div>
      )}

      {open === "info" && (
        <div className="pointer-events-auto mb-2 w-[min(360px,90vw)] border border-border bg-background/85 p-3 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-muted-foreground backdrop-blur-xl">
          <p className="mb-1 tracking-[0.22em] text-primary">ORBITAL AI · PROTOTYPE</p>
          Real orbital element sets from CelesTrak GP, propagated in-browser with SGP4.
          Click any object for intelligence, then select a second object for a prototype
          conjunction screening. Risk values are illustrative, not operational Pc.
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-1.5 border border-border/70 bg-background/60 p-1.5 backdrop-blur-xl">
        <DockButton
          label="SATELLITES / CONSTELLATIONS"
          active={open === "filter"}
          onClick={() => setOpen(open === "filter" ? null : "filter")}
        >
          <CircleDot className="h-4 w-4" />
        </DockButton>
        <DockButton
          label="ORBIT PATHS"
          active={filters.orbits}
          onClick={() => onFiltersChange({ ...filters, orbits: !filters.orbits })}
        >
          <Circle className="h-4 w-4" />
        </DockButton>
        <DockButton
          label="RISK MODE"
          active={filters.riskMode}
          onClick={() => onFiltersChange({ ...filters, riskMode: !filters.riskMode })}
        >
          <AlertTriangle className="h-4 w-4" />
        </DockButton>
        <DockButton
          label="SEARCH"
          active={open === "search"}
          onClick={() => setOpen(open === "search" ? null : "search")}
        >
          <Search className="h-4 w-4" />
        </DockButton>
        <DockButton label="REFRESH ORBITAL DATA" active={refreshing} onClick={onRefresh}>
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </DockButton>
        <DockButton
          label="INFORMATION"
          active={open === "info"}
          onClick={() => setOpen(open === "info" ? null : "info")}
        >
          <Info className="h-4 w-4" />
        </DockButton>
      </div>
    </div>
  );
}
