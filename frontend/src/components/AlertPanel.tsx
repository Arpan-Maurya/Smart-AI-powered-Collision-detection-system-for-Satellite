import { Link } from "@tanstack/react-router";
import { CONJUNCTIONS, riskClasses, type Conjunction } from "@/lib/orbital-data";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

export function AlertRow({
  a,
  onSelect,
  active,
}: {
  a: Conjunction;
  onSelect?: ((a: Conjunction) => void) | undefined;
  active?: boolean | undefined;
}) {
  const r = riskClasses[a.risk];
  return (
    <button
      type="button"
      onClick={() => onSelect?.(a)}
      className={cn(
        "w-full border-l-2 px-4 py-3 text-left transition-colors hover:bg-surface-2",
        r.border.replace("border-", "border-l-"),
        active && "bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("flex items-center gap-2 font-mono text-[10px] tracking-[0.2em]", r.text)}>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              r.dot,
              a.risk === "CRITICAL" && "animate-pulse-ring",
            )}
          />
          {a.risk}
        </span>
        <span className="tech-label">TCA {a.tca}</span>
      </div>
      <p className="mt-1.5 font-mono text-[13px] text-foreground">
        {a.primary} <span className="text-muted-foreground">×</span> {a.secondary}
      </p>
      <div className="mt-1.5 flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
        <span>
          Pc <span className={r.text}>{a.probability}%</span>
        </span>
        <span>MISS {a.missDistance.toLocaleString()} m</span>
        <span>CONF {a.confidence}%</span>
      </div>
    </button>
  );
}

export function AlertPanel({
  limit = 4,
  onSelect,
  activeId,
  className,
}: {
  limit?: number | undefined;
  onSelect?: ((a: Conjunction) => void) | undefined;
  activeId?: string | undefined;
  className?: string | undefined;
}) {
  const items = CONJUNCTIONS.filter((c) => c.status !== "RESOLVED").slice(0, limit);
  return (
    <Panel className={cn("flex h-full flex-col", className)}>
      <PanelHeader
        title="ACTIVE ALERTS"
        meta={`${items.length} OPEN`}
        action={
          <Link
            to="/alerts"
            className="font-mono text-[10px] tracking-[0.16em] text-primary hover:underline"
          >
            ALL →
          </Link>
        }
      />
      <div className="flex-1 divide-y divide-border overflow-y-auto">
        {items.map((a) => (
          <AlertRow key={a.id} a={a} onSelect={onSelect} active={activeId === a.id} />
        ))}
      </div>
    </Panel>
  );
}
