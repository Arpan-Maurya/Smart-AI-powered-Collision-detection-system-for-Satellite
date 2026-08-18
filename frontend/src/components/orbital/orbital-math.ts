import * as THREE from "three";

// Time scale: 0.04 means ~1 full orbit every ~13 minutes (instead of ~31 sec).
// Real LEO period ≈ 90 min; this is a comfortable visualization speed.
export const TIME_SCALE = 0.04;

export interface OrbitElement {
  id: string;
  label: string;
  constellation: string;
  radius: number;
  inclination: number; // radians
  raan: number; // radians
  phase: number; // radians
  speed: number;
  kind: "satellite" | "debris";
  risk: number; // 0..1
}

const EARTH_R = 1;

export function orbitPosition(
  o: OrbitElement,
  t: number,
  out = new THREE.Vector3(),
) {
  const theta = o.phase + t * TIME_SCALE * o.speed;
  const x = Math.cos(theta) * o.radius;
  const z = Math.sin(theta) * o.radius;
  // inclination about X, then RAAN about Y
  const ci = Math.cos(o.inclination);
  const si = Math.sin(o.inclination);
  const y1 = -z * si;
  const z1 = z * ci;
  const cr = Math.cos(o.raan);
  const sr = Math.sin(o.raan);
  return out.set(x * cr + z1 * sr, y1, -x * sr + z1 * cr);
}

export function orbitPathPoints(o: OrbitElement, segments = 96) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const clone = { ...o, phase: (i / segments) * Math.PI * 2, speed: 0 };
    pts.push(orbitPosition(clone, 0));
  }
  return pts;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHELLS: Record<string, { r: number; inc: number; count: number }> = {
  starlink: { r: EARTH_R + 0.34, inc: 53, count: 420 },
  oneweb: { r: EARTH_R + 0.52, inc: 87.9, count: 180 },
  gps: { r: EARTH_R + 0.95, inc: 55, count: 44 },
  custom: { r: EARTH_R + 0.43, inc: 42, count: 180 },
};

export function buildFleet(): OrbitElement[] {
  const rnd = mulberry(20260813);
  const out: OrbitElement[] = [];

  for (const [key, shell] of Object.entries(SHELLS)) {
    const planes = key === "gps" ? 6 : 22;
    for (let i = 0; i < shell.count; i++) {
      const plane = i % planes;
      const radius = shell.r + (rnd() - 0.5) * 0.045;
      out.push({
        id: `${key}-${i}`,
        label: `SAT-${(1000 + Math.floor(rnd() * 8999)).toString()}`,
        constellation: key,
        radius,
        inclination: THREE.MathUtils.degToRad(shell.inc + (rnd() - 0.5) * 2.2),
        raan: (plane / planes) * Math.PI * 2 + (rnd() - 0.5) * 0.08,
        phase: rnd() * Math.PI * 2,
        speed: (0.32 / Math.pow(radius, 1.5)) * (key === "oneweb" ? -1 : 1),
        kind: "satellite",
        risk: rnd() < 0.04 ? 0.45 + rnd() * 0.4 : rnd() * 0.18,
      });
    }
  }

  for (let i = 0; i < 460; i++) {
    const radius = EARTH_R + 0.2 + rnd() * 0.85;
    out.push({
      id: `debris-${i}`,
      label: `DEB-${(1000 + Math.floor(rnd() * 8999)).toString()}`,
      constellation: "debris",
      radius,
      inclination: THREE.MathUtils.degToRad(rnd() * 180),
      raan: rnd() * Math.PI * 2,
      phase: rnd() * Math.PI * 2,
      speed: (0.3 / Math.pow(radius, 1.5)) * (rnd() > 0.5 ? 1 : -1),
      kind: "debris",
      risk: rnd() < 0.08 ? 0.5 + rnd() * 0.45 : rnd() * 0.25,
    });
  }

  return out;
}

/** Two hero objects engineered to make a visible close approach. */
export function heroPair(): [OrbitElement, OrbitElement] {
  return [
    {
      id: "SAT-4821",
      label: "SAT-4821",
      constellation: "starlink",
      radius: 1.36,
      inclination: THREE.MathUtils.degToRad(53),
      raan: 0.6,
      phase: 0,
      speed: 0.2,
      kind: "satellite",
      risk: 1,
    },
    {
      id: "SAT-9032",
      label: "SAT-9032",
      constellation: "oneweb",
      radius: 1.372,
      inclination: THREE.MathUtils.degToRad(84),
      raan: 2.05,
      phase: 1.1,
      speed: 0.176,
      kind: "satellite",
      risk: 1,
    },
  ];
}

export const RISK_COLORS = {
  nominal: new THREE.Color("#38d9f5"),
  watch: new THREE.Color("#8b5cf6"),
  moderate: new THREE.Color("#f7c948"),
  high: new THREE.Color("#f97316"),
  critical: new THREE.Color("#ef4444"),
  debris: new THREE.Color("#6b7f96"),
};

export function riskColor(risk: number, kind: OrbitElement["kind"]) {
  if (risk > 0.75) return RISK_COLORS.critical;
  if (risk > 0.55) return RISK_COLORS.high;
  if (risk > 0.38) return RISK_COLORS.moderate;
  if (kind === "debris") return RISK_COLORS.debris;
  return RISK_COLORS.nominal;
}
