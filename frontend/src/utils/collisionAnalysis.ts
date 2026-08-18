import * as THREE from "three";
import {
  eciToScene,
  stateAt,
  type SatelliteObject,
} from "@/utils/orbitalPropagation";

export type RiskClass = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface ConjunctionResult {
  tca: Date;
  missDistanceKm: number;
  relativeVelocityKms: number;
  riskScore: number; // 0..100 prototype score
  riskClass: RiskClass;
  confidence: number; // percent
  /** scene-space midpoint of closest approach */
  closestPoint: THREE.Vector3;
  windowHours: number;
}

const a = new THREE.Vector3();
const b = new THREE.Vector3();

function separation(
  s1: SatelliteObject,
  s2: SatelliteObject,
  t: Date,
): { d: number; relV: number; mid: THREE.Vector3 } | null {
  const p1 = stateAt(s1, t);
  const p2 = stateAt(s2, t);
  if (!p1 || !p2) return null;
  a.copy(p1.position);
  b.copy(p2.position);
  const d = a.distanceTo(b);
  const relV = p1.velocity.clone().sub(p2.velocity).length();
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return { d, relV, mid };
}

export function classifyRisk(missKm: number): RiskClass {
  if (missKm < 1) return "CRITICAL";
  if (missKm < 5) return "HIGH";
  if (missKm < 25) return "MODERATE";
  return "LOW";
}

/**
 * PROTOTYPE risk model: coarse-to-fine numerical search for the minimum
 * separation between two SGP4-propagated objects over a forward window.
 * Not an operational Pc computation.
 */
export function analyzeConjunction(
  s1: SatelliteObject,
  s2: SatelliteObject,
  from: Date = new Date(),
  windowHours = 24,
): ConjunctionResult | null {
  const start = from.getTime();
  const end = start + windowHours * 3600_000;

  let bestT = start;
  let best = Infinity;
  const coarse = 30_000; // 30 s
  for (let t = start; t <= end; t += coarse) {
    const s = separation(s1, s2, new Date(t));
    if (!s) continue;
    if (s.d < best) {
      best = s.d;
      bestT = t;
    }
  }
  if (!Number.isFinite(best)) return null;

  // refine: 1 s, then 50 ms
  for (const step of [1000, 50]) {
    const lo = bestT - step * 40;
    const hi = bestT + step * 40;
    for (let t = lo; t <= hi; t += step) {
      const s = separation(s1, s2, new Date(t));
      if (s && s.d < best) {
        best = s.d;
        bestT = t;
      }
    }
  }

  const final = separation(s1, s2, new Date(bestT));
  if (!final) return null;

  const missKm = final.d;
  const riskClass = classifyRisk(missKm);
  // Prototype score: closeness weighted by relative velocity.
  const closeness = Math.exp(-Math.pow(missKm / 8, 2));
  const vFactor = Math.min(1, final.relV / 14);
  const riskScore = Number((closeness * (60 + 40 * vFactor)).toFixed(2));

  // Confidence degrades with element-set age and prediction horizon.
  const horizonH = (bestT - start) / 3600_000;
  const confidence = Number(
    Math.max(38, 98 - horizonH * 1.4 - Math.min(20, missKm * 0.05)).toFixed(1),
  );

  return {
    tca: new Date(bestT),
    missDistanceKm: missKm,
    relativeVelocityKms: final.relV,
    riskScore,
    riskClass,
    confidence,
    closestPoint: eciToScene(final.mid.x, final.mid.y, final.mid.z),
    windowHours,
  };
}

export function formatMiss(km: number) {
  return km < 10 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
}

export const riskTextClass: Record<RiskClass, string> = {
  LOW: "text-risk-low",
  MODERATE: "text-risk-moderate",
  HIGH: "text-risk-high",
  CRITICAL: "text-risk-critical",
};

export const riskHex: Record<RiskClass, string> = {
  LOW: "#22d3a6",
  MODERATE: "#f7c948",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};
