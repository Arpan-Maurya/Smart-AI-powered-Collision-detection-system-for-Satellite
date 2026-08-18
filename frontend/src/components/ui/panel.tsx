import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Panel({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <section
      className={cn(
        "panel relative overflow-hidden",
        glow && "panel-glow",
        className,
      )}
    >
      <span className="pointer-events-none absolute left-0 top-0 h-2 w-2 border-l border-t border-primary/50" />
      <span className="pointer-events-none absolute right-0 top-0 h-2 w-2 border-r border-t border-primary/50" />
      <span className="pointer-events-none absolute bottom-0 left-0 h-2 w-2 border-b border-l border-primary/50" />
      <span className="pointer-events-none absolute bottom-0 right-0 h-2 w-2 border-b border-r border-primary/50" />
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  meta,
  action,
  className,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-3 border-b border-border px-4 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className="h-3 w-px bg-primary" />
        <h2 className="font-mono text-[11px] tracking-[0.22em] text-foreground/90">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-3">
        {meta ? <span className="tech-label">{meta}</span> : null}
        {action}
      </div>
    </header>
  );
}

export function StatDot({ tone = "primary" }: { tone?: string }) {
  return (
    <span
      className={cn("inline-block h-1.5 w-1.5 rounded-full", tone)}
      aria-hidden
    />
  );
}
