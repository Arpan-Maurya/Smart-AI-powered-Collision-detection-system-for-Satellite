import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelHeader } from "@/components/ui/panel";
import {
  analyzePair,
  approveDecision,
  DEMO_PAIR,
  getBackendBase,
  isBackendAvailable,
  type AnalyzeResponse,
} from "@/services/backendApi";
import { riskClasses } from "@/lib/orbital-data";
import { cn } from "@/lib/utils";
import { Cpu, ShieldCheck, ShieldX } from "lucide-react";

type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

function tierToLevel(tier: string | null): RiskLevel {
  if (tier === "MEDIUM") return "MODERATE";
  if (tier === "LOW" || tier === "HIGH" || tier === "CRITICAL") return tier as RiskLevel;
  return "LOW";
}

const EVENT_LABELS: Record<string, string> = {
  WORKFLOW_STARTED: "WORKFLOW INITIALIZED",
  CONJUNCTION_DETECTED: "CONJUNCTION DETECTED",
  RISK_ASSESSMENT_STARTED: "PHYSICS + ML RISK ASSESSMENT",
  RISK_ASSESSMENT_COMPLETED: "RISK CLASSIFICATION COMPLETE",
  AGENT_STARTED: "AGENT ANALYSIS",
  AGENT_COMPLETED: "AGENT ANALYSIS COMPLETE",
  MANEUVER_GENERATED: "MANEUVER CANDIDATES GENERATED",
  MANEUVER_VALIDATED: "PHYSICS VALIDATION PASSED",
  MANEUVER_REJECTED: "MANEUVER REJECTED BY PHYSICS",
  RECOMMENDATION_READY: "RECOMMENDATION READY",
  HUMAN_APPROVAL_REQUIRED: "HUMAN APPROVAL REQUIRED",
  WORKFLOW_COMPLETED: "WORKFLOW COMPLETED",
  WORKFLOW_REQUIRES_HUMAN: "AWAITING OPERATOR",
  WORKFLOW_FAILED: "WORKFLOW FAILED — MANUAL REVIEW",
};

const CINEMATIC = [
  "SCANNING TLE CATALOGUE",
  "PROPAGATING TRAJECTORY",
  "DETECTING CONJUNCTION",
  "COMPUTING COLLISION PROBABILITY",
  "RISK CLASSIFICATION COMPLETE",
];

function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function mOrKm(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(2)} km`;
  return `${Math.round(n)} m`;
}

function formatTca(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
  if (mins < 90) return `T-${mins} MIN`;
  return `${d.toUTCString().slice(17, 22)} UTC`;
}

export function AIAnalysis({ className }: { className?: string | undefined }) {
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const run = useCallback(async () => {
    clearTimers();
    setBusy(true);
    setError(null);
    setReveal(0);
    try {
      const res = await analyzePair(DEMO_PAIR, 6);
      setResult(res);
      setOffline(false);
      // Progressive reveal of the agent timeline
      res.timeline.forEach((_, i) => {
        timers.current.push(setTimeout(() => setReveal(i + 1), 350 + i * 260));
      });
    } catch {
      setOffline(true);
      setResult(null);
      setError("Backend unreachable — connect the FastAPI service to run the live workflow.");
    } finally {
      timers.current.push(setTimeout(() => setBusy(false), 900));
    }
  }, []);

  useEffect(() => {
    void isBackendAvailable().then((ok) => {
      if (ok) void run();
      else setOffline(true);
    });
    return clearTimers;
  }, [run]);

  const decide = async (approve: boolean) => {
    if (!result || deciding) return;
    setDeciding(true);
    try {
      const updated = await approveDecision(result.workflow_id, approve, "operator decision");
      setResult(updated);
    } catch {
      setError(approve ? "Approval failed — backend unreachable." : "Rejection failed — backend unreachable.");
    } finally {
      setDeciding(false);
    }
  };

  const tier = tierToLevel(result?.risk_tier ?? null);
  const r = riskClasses[tier];
  const mock = result?.model_metadata.is_mock ?? false;
  const modelVersion = result?.model_metadata.model_version ?? "—";
  const events = result?.timeline ?? [];
  const visibleEvents = events.slice(0, reveal);

  return (
    <Panel className={cn("flex flex-col", className)}>
      <PanelHeader
        title="AI ORBITAL ANALYSIS"
        meta={
          busy
            ? "PROCESSING"
            : result
              ? `MODEL ${modelVersion} · ${mock ? "MOCK" : "REAL"}`
              : "MODEL READY"
        }
        action={<Cpu className={cn("h-3.5 w-3.5 text-primary", busy && "animate-pulse")} />}
      />

      <div className="space-y-4 p-4">
        {offline && (
          <div className="border border-risk-critical/40 bg-risk-critical/10 px-3 py-2">
            <p className="font-mono text-[10px] tracking-[0.18em] text-risk-critical">
              BACKEND OFFLINE — {getBackendBase()}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Start the FastAPI service (uvicorn app.main:app --port 8000) to run the
              live physics + ML workflow.
            </p>
          </div>
        )}

        {result && (
          <div className={cn("border-l-2 px-3 py-2", r.border.replace("border-", "border-l-"), r.bg)}>
            <p className="text-[13px] leading-relaxed text-foreground/90">
              Conjunction <span className="font-mono">{result.event_id}</span> between{" "}
              <span className={cn("font-mono", r.text)}>{result.satellite_a?.name ?? "A"}</span> and{" "}
              <span className={cn("font-mono", r.text)}>{result.satellite_b?.name ?? "B"}</span>.
            </p>
            <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
              {result.status} · {result.workflow_id}
            </p>
          </div>
        )}

        {result && (
          <dl className="divide-y divide-border border border-border">
            <Metric k="Risk Tier" v={result.risk_tier ?? "—"} tone={r.text} />
            <Metric k="Collision Probability" v={pct(result.ml_prediction?.collision_probability)} tone="text-risk-critical" />
            <Metric k="Predicted Miss Distance" v={mOrKm(result.ml_prediction?.msd_predicted_m)} tone="text-risk-high" />
            <Metric k="Physics Miss Distance" v={mOrKm(result.miss_distance_m)} tone="text-foreground" />
            <Metric k="Time of Closest Approach" v={formatTca(result.tca)} tone="text-foreground" />
            <Metric k="Relative Velocity" v={result.relative_velocity_kms != null ? `${result.relative_velocity_kms.toFixed(2)} km/s` : "—"} tone="text-foreground" />
            <Metric k="Prediction Confidence" v={pct(result.confidence)} tone="text-primary" />
          </dl>
        )}

        {result && result.reasons.length > 0 && (
          <div>
            <p className="tech-label">Why this risk</p>
            <ul className="mt-1.5 space-y-1">
              {result.reasons.map((reason) => (
                <li key={reason} className="flex items-start gap-2 text-[11px] leading-relaxed text-foreground/80">
                  <span className={cn("mt-1 h-1 w-1 shrink-0 rounded-full", r.dot)} />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result && result.validated.length > 0 && (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[380px] text-left font-mono text-[10px]">
              <thead className="bg-surface-2 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">CAND</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">MANEUVER</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">RISK →</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">ΔV</th>
                  <th className="px-2 py-1.5 font-normal tracking-[0.14em]">RANK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...result.validated]
                  .sort((a, b) => b.rank_score - a.rank_score)
                  .map((c) => {
                    const recommended =
                      c.candidate_id === result.recommendation.recommended_candidate;
                    return (
                      <tr
                        key={c.candidate_id}
                        className={cn(recommended && "bg-primary/10 text-primary")}
                      >
                        <td className="px-2 py-1.5">{c.candidate_id}</td>
                        <td className="px-2 py-1.5">{c.kind}</td>
                        <td className="px-2 py-1.5">
                          <span className="text-risk-critical">{c.risk_before.toFixed(3)}</span>
                          {" → "}
                          <span className="text-risk-low">{c.risk_after.toFixed(3)}</span>
                        </td>
                        <td className="px-2 py-1.5">{c.delta_v_m_s.toFixed(3)} m/s</td>
                        <td className="px-2 py-1.5">{c.rank_score.toFixed(4)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {result && result.recommendation.recommended_candidate && (
          <div className="border border-primary/35 bg-primary/5 px-3 py-2.5">
            <p className="tech-label">Recommended action</p>
            <p className="mt-1 font-mono text-[13px] text-primary">
              {result.recommendation.recommended_candidate} ·{" "}
              {String(result.recommendation.recommended_kind)}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {String(result.recommendation.why ?? "")} — physics validation{" "}
              {String(result.recommendation.physics_validation_status ?? "")}.
            </p>
          </div>
        )}

        {result && result.human_approval_required && (
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] tracking-[0.18em] text-risk-critical">
              HUMAN APPROVAL REQUIRED — NOTHING AUTO-EXECUTES
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void decide(true)}
                disabled={deciding || result.approval_status !== "NONE"}
                className="flex items-center justify-center gap-1.5 border border-risk-low/50 bg-risk-low/10 py-2.5 font-mono text-[10px] tracking-[0.2em] text-risk-low transition-colors hover:bg-risk-low/20 disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                APPROVE
              </button>
              <button
                type="button"
                onClick={() => void decide(false)}
                disabled={deciding || result.approval_status !== "NONE"}
                className="flex items-center justify-center gap-1.5 border border-risk-critical/50 bg-risk-critical/10 py-2.5 font-mono text-[10px] tracking-[0.2em] text-risk-critical transition-colors hover:bg-risk-critical/20 disabled:opacity-50"
              >
                <ShieldX className="h-3.5 w-3.5" />
                REJECT
              </button>
            </div>
            {result.approval_status !== "NONE" && (
              <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground">
                DECISION RECORDED: {result.approval_status}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-[11px] text-risk-critical">{error}</p>}

        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="relative w-full overflow-hidden border border-primary/50 bg-primary/10 py-2.5 font-mono text-[11px] tracking-[0.24em] text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
        >
          {busy ? "ANALYSIS IN PROGRESS…" : "RUN DEEP ANALYSIS"}
          {busy && <span className="scanline animate-sweep absolute inset-y-0 left-0 w-1/3 opacity-70" />}
        </button>

        {(busy || visibleEvents.length > 0) && (
          <ol className="space-y-1.5">
            {(busy && visibleEvents.length === 0 ? CINEMATIC : visibleEvents.map((e) => EVENT_LABELS[e.event] ?? e.event)).map(
              (label, i) => {
                const last = i === visibleEvents.length - 1 && !busy;
                const active = i === reveal - 1 && busy;
                return (
                  <li key={`${i}-${label}`} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center border font-mono text-[8px]",
                        last
                          ? "border-risk-low/60 bg-risk-low/15 text-risk-low"
                          : active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      {last ? "✓" : i + 1}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[10px] tracking-[0.16em]",
                        active ? "text-primary" : last ? "text-foreground/80" : "text-muted-foreground/60",
                      )}
                    >
                      {label}
                    </span>
                    {active && (
                      <span className="h-px flex-1 overflow-hidden bg-border">
                        <span className="scanline animate-sweep block h-px w-1/2" />
                      </span>
                    )}
                  </li>
                );
              },
            )}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function Metric({ k, v, tone }: { k: string; v: string; tone: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className={cn("font-mono text-[13px]", tone)}>{v}</dd>
    </div>
  );
}
