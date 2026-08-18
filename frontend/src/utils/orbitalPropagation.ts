import * as THREE from "three";
import type { SatRec } from "satellite.js";

/** Earth mean radius in km — scene uses 1 unit = 1 Earth radius. */
export const EARTH_RADIUS_KM = 6371;
export const MU = 398600.4418; // km^3/s^2

/** Lazily-loaded SGP4 module (kept out of the SSR import graph). */
type Sgp4Module = typeof import("satellite.js");
let sgp4: Sgp4Module | null = null;

export async function loadSgp4(): Promise<Sgp4Module> {
  if (!sgp4) sgp4 = await import("satellite.js");
  return sgp4;
}

export function sgp4Sync(): Sgp4Module | null {
  return sgp4;
}

export type SatGroup = "starlink" | "oneweb" | "gps" | "other";

export interface SatelliteObject {
  id: string;
  name: string;
  norad: string;
  group: SatGroup;
  objectType: string;
  satrec: SatRec;
  /** cached derived values (computed once at load) */
  inclinationDeg: number;
  eccentricity: number;
  periodMin: number;
  meanAltitudeKm: number;
}

export interface StateVector {
  /** km, ECI */
  position: THREE.Vector3;
  /** km/s, ECI */
  velocity: THREE.Vector3;
}

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

/** ECI (z-up, km) → scene coordinates (y-up, Earth radii). */
export function eciToScene(x: number, y: number, z: number, out = new THREE.Vector3()) {
  return out.set(x / EARTH_RADIUS_KM, z / EARTH_RADIUS_KM, -y / EARTH_RADIUS_KM);
}

export function stateAt(o: SatelliteObject, date: Date): StateVector | null {
  const m = sgp4;
  if (!m) return null;
  try {
    const r = m.propagate(o.satrec, date);
    if (!r || !r.position || !r.velocity) return null;
    const p = r.position as { x: number; y: number; z: number };
    const v = r.velocity as { x: number; y: number; z: number };
    if (!Number.isFinite(p.x) || !Number.isFinite(v.x)) return null;
    return {
      position: _p.clone().set(p.x, p.y, p.z),
      velocity: _v.clone().set(v.x, v.y, v.z),
    };
  } catch {
    return null;
  }
}

export function scenePositionAt(
  o: SatelliteObject,
  date: Date,
  out = new THREE.Vector3(),
): THREE.Vector3 | null {
  const s = stateAt(o, date);
  if (!s) return null;
  return eciToScene(s.position.x, s.position.y, s.position.z, out);
}

/** Sampled orbit track (one full revolution starting at `date`). */
export function orbitTrack(o: SatelliteObject, date: Date, segments = 180): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const periodMs = o.periodMin * 60_000;
  for (let i = 0; i <= segments; i++) {
    const t = new Date(date.getTime() + (i / segments) * periodMs);
    const p = scenePositionAt(o, t);
    if (p) pts.push(p);
  }
  return pts;
}

export interface DerivedTelemetry {
  altitudeKm: number;
  velocityKms: number;
  inclinationDeg: number;
  eccentricity: number;
  periodMin: number;
  latitude: number;
  longitude: number;
}

export function telemetry(o: SatelliteObject, date: Date): DerivedTelemetry {
  const s = stateAt(o, date);
  const r = s ? s.position.length() : o.meanAltitudeKm + EARTH_RADIUS_KM;
  let latitude = 0;
  let longitude = 0;
  const m = sgp4;
  if (s && m) {
    try {
      const gmst = m.gstime(date);
      const geo = m.eciToGeodetic({ x: s.position.x, y: s.position.y, z: s.position.z }, gmst);
      latitude = (geo.latitude * 180) / Math.PI;
      longitude = (geo.longitude * 180) / Math.PI;
    } catch {
      /* ignore */
    }
  }
  return {
    altitudeKm: r - EARTH_RADIUS_KM,
    velocityKms: s ? s.velocity.length() : Math.sqrt(MU / r),
    inclinationDeg: o.inclinationDeg,
    eccentricity: o.eccentricity,
    periodMin: o.periodMin,
    latitude,
    longitude,
  };
}

export const GROUP_COLOR: Record<SatGroup, string> = {
  starlink: "#38d9f5",
  oneweb: "#8b5cf6",
  gps: "#22d3a6",
  other: "#7b90a8",
};

/** Greenwich Mean Sidereal Time (radians) for a given instant. */
export function gmstAngle(date: Date): number {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  let g =
    280.46061837 +
    360.98564736629 * (jd - 2451545.0) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  g = ((g % 360) + 360) % 360;
  return (g * Math.PI) / 180;
}

/** Unit vector toward the Sun in scene coordinates (low-precision solar model). */
export function sunDirectionScene(date: Date, out = new THREE.Vector3()): THREE.Vector3 {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = ((280.46 + 0.9856474 * n) * Math.PI) / 180; // mean longitude
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180; // mean anomaly
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * (Math.PI / 180);
  const eps = ((23.439 - 0.0000004 * n) * Math.PI) / 180;
  // ECI (equatorial) unit vector
  const x = Math.cos(lambda);
  const y = Math.cos(eps) * Math.sin(lambda);
  const z = Math.sin(eps) * Math.sin(lambda);
  return eciToScene(x, y, z, out).multiplyScalar(EARTH_RADIUS_KM).normalize();
}
