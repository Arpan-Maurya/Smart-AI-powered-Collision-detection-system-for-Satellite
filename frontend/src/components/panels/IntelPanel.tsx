import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { telemetry, type SatelliteObject } from "@/utils/orbitalPropagation";
import {
  analyzeConjunction,
  formatMiss,
  riskTextClass,
  type ConjunctionResult,
} from "@/utils/collisionAnalysis";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/50 px-4 py-2">
      <span className="tech-label">{label}</span>
      <span className="font-mono text-[12px] text-foreground">{value}</span>
    </div>
  );
}

function SatelliteReadout({ sat }: { sat: SatelliteObject }) {
  const t = useMemo(() => telemetry(sat, new Date()), [sat]);
  return (
    <div>
      <Row label="NORAD ID" value={sat.norad} />
      <Row label="OBJECT TYPE" value={sat.objectType} />
      <Row label="CONSTELLATION" value={sat.group.toUpperCase()} />
      <Row label="ALTITUDE" value={`${t.altitudeKm.toFixed(1)} km`} />
      <Row label="INCLINATION" value={`${t.inclinationDeg.toFixed(2)}°`} />
      <Row label="ECCENTRICITY" value={t.eccentricity.toFixed(5)} />
      <Row label="ORBITAL PERIOD" value={`${t.periodMin.toFixed(1)} min`} />
      <Row label="VELOCITY" value={`${t.velocityKms.toFixed(2)} km/s`} />
      <Row
        label="SUB-POINT"
        value={`${t.latitude.toFixed(2)}°, ${t.longitude.toFixed(2)}°`}
      />
    </div>
  );
}

export function IntelPanel({
  satA,
  satB,
  awaitingB,
  onRequestSecond,
  onClearB,
  onClose,
  onConjunction,
}: {
  satA: SatelliteObject | null;
  satB: SatelliteObject | null;
  awaitingB: boolean;
  onRequestSecond: () => void;
  onClearB: () => void;
  onClose: () => void;
  onConjunction: (r: ConjunctionResult | null) => void;
}) {
  const [result, setResult] = useState<ConjunctionResult | null>(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    if (!satA || !satB) {
      setResult(null);
      onConjunction(null);
      return;
    }
    setComputing(true);
    let cancelled = false;
    const id = window.setTimeout(() => {
      const r = analyzeConjunction(satA, satB, new Date(), 24);
      if (cancelled) return;
      setResult(r);
      setComputing(false);
      onConjunction(r);
    }, 40);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satA?.id, satB?.id]);

  const open = Boolean(satA);

  return (
    <aside
      className={cn(
        "pointer-events-none fixed right-0 top-0 z-30 flex h-full w-[min(360px,88vw)] flex-col transition-transform duration-500 ease-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!open}
    >
      <div className="pointer-events-auto flex h-full flex-col overflow-y-auto border-l border-border bg-background/80 backdrop-blur-xl">
        <header className="flex items-start justify-between border-b border-border px-4 py-3">
          <div>
            <p className="tech-label">{satB ? "CONJUNCTION ANALYSIS" : "SATELLITE"}</p>
            <h2 className="mt-1 font-mono text-[15px] tracking-[0.06em] text-foreground">
              {satB ? `${satA?.name} × ${satB.name}` : (satA?.name ?? "")}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close panel">
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        </header>

        {satA && !satB && (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-risk-low">
                <span className="h-1.5 w-1.5 rounded-full bg-risk-low" />
                {satA.objectType === "PAYLOAD" ? "ACTIVE" : satA.objectType}
              </span>
              <span className="tech-label">SGP4 PROPAGATED</span>
            </div>
            <SatelliteReadout sat={satA} />
          </>
        )}

        {satA && satB && (
          <div className="flex flex-col">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border px-4 py-3">
              <div>
                <p className="tech-label">SATELLITE A</p>
                <p className="font-mono text-[12px] text-primary">{satA.name}</p>
              </div>
              <span className="font-mono text-muted-foreground">×</span>
              <div className="text-right">
                <p className="tech-label">SATELLITE B</p>
                <p className="font-mono text-[12px] text-risk-moderate">{satB.name}</p>
              </div>
            </div>

            <div className="border-b border-border bg-risk-moderate/5 px-4 py-2">
              <p className="font-mono text-[9px] tracking-[0.22em] text-risk-moderate">
                PROTOTYPE RISK MODEL
              </p>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
                Numerical SGP4 screening over a 24 h window. Not an operational
                collision probability.
              </p>
            </div>

            {computing && (
              <p className="animate-pulse px-4 py-6 text-center font-mono text-[10px] tracking-[0.22em] text-primary">
                SCREENING TRAJECTORIES…
              </p>
            )}

            {!computing && result && (
              <>
                <Row label="TIME OF CLOSEST APPROACH" value={result.tca.toISOString().slice(11, 19) + " UTC"} />
                <Row label="TCA DATE" value={result.tca.toISOString().slice(0, 10)} />
                <Row label="MISS DISTANCE" value={formatMiss(result.missDistanceKm)} />
                <Row
                  label="RELATIVE VELOCITY"
                  value={`${result.relativeVelocityKms.toFixed(2)} km/s`}
                />
                <Row label="RISK SCORE" value={`${result.riskScore.toFixed(2)} / 100`} />
                <Row label="PREDICTION CONFIDENCE" value={`${result.confidence}%`} />
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="tech-label">RISK CLASSIFICATION</span>
                  <span
                    className={cn(
                      "font-mono text-[12px] tracking-[0.2em]",
                      riskTextClass[result.riskClass],
                    )}
                  >
                    {result.riskClass}
                  </span>
                </div>
              </>
            )}

            {!computing && !result && (
              <p className="px-4 py-6 text-center font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
                NO SOLUTION — ELEMENT SETS NOT PROPAGATABLE
              </p>
            )}

            <div className="mt-2 border-t border-border">
              <details className="group">
                <summary className="cursor-pointer px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground hover:text-foreground">
                  OBJECT A TELEMETRY
                </summary>
                <SatelliteReadout sat={satA} />
              </details>
              <details className="group border-t border-border">
                <summary className="cursor-pointer px-4 py-2 font-mono text-[10px] tracking-[0.18em] text-muted-foreground hover:text-foreground">
                  OBJECT B TELEMETRY
                </summary>
                <SatelliteReadout sat={satB} />
              </details>
            </div>
          </div>
        )}

        <div className="mt-auto space-y-2 p-4">
          {awaitingB && !satB && (
            <p className="animate-pulse border border-primary/40 bg-primary/10 py-2 text-center font-mono text-[10px] tracking-[0.2em] text-primary">
              PICK A SECOND OBJECT ON THE GLOBE
            </p>
          )}
          {!satB ? (
            <button
              type="button"
              onClick={onRequestSecond}
              className="w-full border border-primary/50 bg-primary/10 py-2.5 font-mono text-[10px] tracking-[0.24em] text-primary transition-colors hover:bg-primary/20"
            >
              SELECT ANOTHER SATELLITE
            </button>
          ) : (
            <button
              type="button"
              onClick={onClearB}
              className="w-full border border-border bg-background/40 py-2.5 font-mono text-[10px] tracking-[0.24em] text-muted-foreground transition-colors hover:text-foreground"
            >
              CLEAR COMPARISON TARGET
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
