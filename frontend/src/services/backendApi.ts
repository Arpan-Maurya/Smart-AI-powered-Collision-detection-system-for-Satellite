/**
 * Typed client for the backend FastAPI service (port 8000 by default).
 *
 * Override the URL with VITE_BACKEND_URL. Every call is fail-safe: the UI
 * must keep working (with clearly-labelled offline state) when the backend
 * is not running.
 */

export interface ManeuverView {
  candidate_id: string;
  kind: string;
  status: string;
  delta_v_m_s: number;
  sma_delta_km: number;
  risk_before: number;
  risk_after: number;
  miss_before_m: number;
  miss_after_m: number;
  tca_change_min: number;
  secondary_conflicts: number;
  constraint_violations: string[];
  rank_score: number;
  note: string;
}

export interface TimelineEntry {
  t: string;
  event: string;
  [key: string]: unknown;
}

export interface Recommendation {
  recommended_candidate: string | null;
  recommended_kind: string | null;
  risk_before: number | null;
  risk_after: number | null;
  delta_v_m_s: number;
  why: string | null;
  physics_validation_status: string | null;
  human_approval_required: boolean;
  approval_status: string;
}

export interface SatelliteRef {
  norad: string;
  name: string;
}

export interface ModelMetadata {
  model_version: string;
  is_mock: boolean;
  model_source: string;
  feature_count: number;
  status: string;
}

export interface MlPrediction {
  msd_predicted_m: number;
  collision_probability: number;
  risk_score: number;
  risk_tier: string;
  confidence: number;
  model_version: string;
  is_mock: boolean;
}

export interface AnalyzeResponse {
  workflow_id: string;
  event_id: string;
  status: string;
  satellite_a: SatelliteRef;
  satellite_b: SatelliteRef;
  tca: string | null;
  miss_distance_m: number | null;
  relative_velocity_kms: number | null;
  risk_score: number | null;
  risk_tier: string | null;
  confidence: number | null;
  reasons: string[];
  ml_prediction: MlPrediction;
  candidates: ManeuverView[];
  validated: ManeuverView[];
  rejected: ManeuverView[];
  secondary_conflicts: string[];
  recommendation: Recommendation;
  explanation: string;
  agent_log: Record<string, unknown>[];
  timeline: TimelineEntry[];
  human_approval_required: boolean;
  approval_status: string;
  approval_note: string | null;
  model_metadata: ModelMetadata;
  fallback_used: boolean;
}

export interface ModelsStatus {
  model_version: string;
  is_mock: boolean;
  model_source: string;
  feature_count: number;
  loaded: boolean;
  status: string;
}

export interface PairTles {
  line1_a: string;
  line2_a: string;
  line1_b: string;
  line2_b: string;
  name_a: string;
  name_b: string;
}

export function getBackendBase(): string {
  const configured = import.meta.env["VITE_BACKEND_URL"] as string | undefined;
  return (configured ?? "https://orbital-ai-xpcy.onrender.com/").replace(/\/$/, "");
}

function tleChecksum(line: string): string {
  const body = line.slice(0, 68);
  let total = 0;
  for (const ch of body) {
    if (ch >= "0" && ch <= "9") total += Number(ch);
    else if (ch === "-") total += 1;
  }
  return body + String(total % 10);
}

/**
 * Deterministic demo scenario: DEMO-A on a near-circular LEO orbit, DEMO-B on
 * the same track with a +0.05 deg phase offset — a guaranteed ~5.9 km close
 * approach that exercises the entire workflow with a CRITICAL outcome.
 */
export const DEMO_PAIR: PairTles = {
  line1_a: "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9021",
  line2_a: tleChecksum("2 25544  51.6400 208.9163 0000001 358.1484  30.8603 15.50216498484890"),
  line1_b: "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9021",
  line2_b: tleChecksum("2 25544  51.6400 208.9163 0000001 358.1484  30.9103 15.50216498484890"),
  name_a: "DEMO-A",
  name_b: "DEMO-B",
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBackendBase()}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`Backend ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

export async function analyzePair(pair: PairTles, horizonHours = 6): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/orchestration/analyze", {
    method: "POST",
    body: JSON.stringify({
      line1_a: pair.line1_a,
      line2_a: pair.line2_a,
      line1_b: pair.line1_b,
      line2_b: pair.line2_b,
      name_a: pair.name_a,
      name_b: pair.name_b,
      horizon_hours: horizonHours,
    }),
  });
}

export async function approveDecision(
  workflowId: string,
  approve: boolean,
  note?: string,
): Promise<AnalyzeResponse> {
  const action = approve ? "approve" : "reject";
  return request<AnalyzeResponse>(`/orchestration/${workflowId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ approve, note: note ?? null }),
  });
}

export async function getModelsStatus(): Promise<ModelsStatus> {
  return request<ModelsStatus>("/models/status");
}

export async function isBackendAvailable(): Promise<boolean> {
  try {
    await getModelsStatus();
    return true;
  } catch {
    return false;
  }
}
