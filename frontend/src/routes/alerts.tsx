import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CommandLayout } from "@/components/CommandLayout";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { CONJUNCTIONS, riskClasses, type RiskLevel } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/alerts")({
  head: () => ({
    meta: [
      { title: "Alert Center — Orbital AI" },
      {
        name: "description",
        content:
          "Triage conjunction alerts by severity with time of closest approach, collision probability, miss distance and confidence.",
      },
      { property: "og:title", content: "Alert Center — Orbital AI" },
      {
        property: "og:description",
        content: "Critical, high, medium, low and resolved conjunction alerts.",
      },
    ],
  }),
  component: AlertsPage,
});

const TABS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "RESOLVED"] as const;
type Tab = (typeof TABS)[number];

function match(tab: Tab, risk: RiskLevel, status: string) {
  if (tab === "RESOLVED") return status === "RESOLVED";
  if (status === "RESOLVED") return false;
  if (tab === "MEDIUM") return risk === "MODERATE";
  return risk === tab;
}

function AlertsPage() {
  const [tab, setTab] = useState<Tab>("CRITICAL");
  const items = CONJUNCTIONS.filter((c) => match(tab, c.risk, c.status));

  return (
    <CommandLayout title="ALERT CENTER" subtitle="CONJUNCTION TRIAGE QUEUE">
      <Panel>
        <PanelHeader title="ALERT QUEUE" meta={`${CONJUNCTIONS.length} EVENTS IN WINDOW`} />
        <div className="flex flex-wrap gap-px border-b border-border bg-border/40">
          {TABS.map((t) => {
            const count = CONJUNCTIONS.filter((c) => match(t, c.risk, c.status)).length;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 bg-background/60 px-4 py-2.5 font-mono text-[10px] tracking-[0.2em] transition-colors",
                  tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t} <span className="text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-3 p-3 md:grid-cols-2">
          {items.length === 0 && (
            <p className="tech-label p-4">NO EVENTS IN THIS CATEGORY</p>
          )}
          {items.map((c) => {
            const r = riskClasses[c.risk];
            return (
              <article
                key={c.id}
                className={cn("animate-rise border border-l-2 bg-background/40 p-4", r.border.replace("border-", "border-l-"))}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("flex items-center gap-2 font-mono text-[10px] tracking-[0.2em]", r.text)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", r.dot, c.risk === "CRITICAL" && c.status !== "RESOLVED" && "animate-pulse-ring")} />
                    {c.risk} CONJUNCTION
                  </span>
                  <span className="tech-label">{c.status}</span>
                </div>

                <h3 className="mt-2 font-mono text-[15px] text-foreground">
                  {c.primary} <span className="text-muted-foreground">×</span> {c.secondary}
                </h3>

                <dl className="mt-3 grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
                  {[
                    ["TCA", c.tca],
                    ["PROBABILITY", `${c.probability}%`],
                    ["MISS DISTANCE", `${c.missDistance.toLocaleString()} m`],
                    ["CONFIDENCE", `${c.confidence}%`],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-background/70 px-2.5 py-2">
                      <dt className="tech-label">{k}</dt>
                      <dd className="mt-0.5 font-mono text-[12px]">{v}</dd>
                    </div>
                  ))}
                </dl>

                <Link
                  to="/collision-risk"
                  className="mt-3 inline-block border border-primary/50 bg-primary/10 px-4 py-2 font-mono text-[10px] tracking-[0.2em] text-primary transition-colors hover:bg-primary/20"
                >
                  VIEW ANALYSIS
                </Link>
              </article>
            );
          })}
        </div>
      </Panel>
    </CommandLayout>
  );
}
