export type RiskLevel = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface Constellation {
  id: string;
  name: string;
  objects: number;
  operational: number;
  altitude: number; // km
  inclination: number; // deg
  regime: string;
  color: "cyan" | "violet" | "moderate" | "low";
}

export const CONSTELLATIONS: Constellation[] = [
  {
    id: "starlink",
    name: "STARLINK",
    objects: 12481,
    operational: 98.4,
    altitude: 550,
    inclination: 53,
    regime: "LEO SHELL",
    color: "cyan",
  },
  {
    id: "oneweb",
    name: "ONEWEB",
    objects: 634,
    operational: 97.8,
    altitude: 1200,
    inclination: 87.9,
    regime: "POLAR LEO",
    color: "violet",
  },
  {
    id: "gps",
    name: "GPS",
    objects: 31,
    operational: 100,
    altitude: 20180,
    inclination: 55,
    regime: "MEO",
    color: "low",
  },
  {
    id: "custom",
    name: "CUSTOM CONSTELLATION",
    objects: 2410,
    operational: 99.1,
    altitude: 780,
    inclination: 42,
    regime: "LEO",
    color: "moderate",
  },
];

export interface SatelliteRecord {
  id: string;
  norad: string;
  constellation: string;
  orbitType: string;
  altitude: number;
  inclination: number;
  velocity: number;
  eccentricity: number;
  status: "OPERATIONAL" | "DEGRADED" | "DEBRIS";
  lastUpdate: string;
  risk: RiskLevel;
}

export interface Conjunction {
  id: string;
  primary: string;
  secondary: string;
  tca: string;
  tcaSeconds: number;
  probability: number; // percent
  missDistance: number; // meters
  relativeVelocity: number; // km/s
  confidence: number; // percent
  risk: RiskLevel;
  status: "ACTIVE" | "MONITORING" | "RESOLVED";
}

export const CONJUNCTIONS: Conjunction[] = [
  {
    id: "CJ-0001",
    primary: "SAT-4821",
    secondary: "SAT-9032",
    tca: "14:32 UTC",
    tcaSeconds: 872,
    probability: 8.7,
    missDistance: 184,
    relativeVelocity: 7.42,
    confidence: 96.8,
    risk: "CRITICAL",
    status: "ACTIVE",
  },
  {
    id: "CJ-0002",
    primary: "SAT-2314",
    secondary: "DEB-9182",
    tca: "15:09 UTC",
    tcaSeconds: 2220,
    probability: 2.4,
    missDistance: 640,
    relativeVelocity: 11.08,
    confidence: 93.1,
    risk: "HIGH",
    status: "ACTIVE",
  },
  {
    id: "CJ-0003",
    primary: "SAT-7741",
    secondary: "SAT-8821",
    tca: "16:46 UTC",
    tcaSeconds: 8040,
    probability: 0.8,
    missDistance: 1420,
    relativeVelocity: 5.94,
    confidence: 91.4,
    risk: "MODERATE",
    status: "MONITORING",
  },
  {
    id: "CJ-0004",
    primary: "SAT-1180",
    secondary: "DEB-2277",
    tca: "18:02 UTC",
    tcaSeconds: 12600,
    probability: 0.31,
    missDistance: 3180,
    relativeVelocity: 9.77,
    confidence: 89.6,
    risk: "MODERATE",
    status: "MONITORING",
  },
  {
    id: "CJ-0005",
    primary: "SAT-6602",
    secondary: "SAT-3391",
    tca: "20:41 UTC",
    tcaSeconds: 21000,
    probability: 0.06,
    missDistance: 8400,
    relativeVelocity: 4.12,
    confidence: 95.2,
    risk: "LOW",
    status: "MONITORING",
  },
  {
    id: "CJ-0006",
    primary: "SAT-2044",
    secondary: "DEB-5510",
    tca: "09:14 UTC",
    tcaSeconds: -3600,
    probability: 0.02,
    missDistance: 14200,
    relativeVelocity: 6.31,
    confidence: 97.4,
    risk: "LOW",
    status: "RESOLVED",
  },
];

export const PRIMARY_EVENT = CONJUNCTIONS[0]!;

export const SATELLITES: SatelliteRecord[] = [
  {
    id: "SAT-4821",
    norad: "48211",
    constellation: "STARLINK",
    orbitType: "LEO — SUN SYNCHRONOUS",
    altitude: 547.2,
    inclination: 53.05,
    velocity: 7.59,
    eccentricity: 0.0001342,
    status: "OPERATIONAL",
    lastUpdate: "12 s ago",
    risk: "CRITICAL",
  },
  {
    id: "SAT-9032",
    norad: "90321",
    constellation: "ONEWEB",
    orbitType: "POLAR LEO",
    altitude: 549.8,
    inclination: 87.42,
    velocity: 7.58,
    eccentricity: 0.0002018,
    status: "OPERATIONAL",
    lastUpdate: "9 s ago",
    risk: "CRITICAL",
  },
  {
    id: "SAT-2314",
    norad: "23141",
    constellation: "STARLINK",
    orbitType: "LEO",
    altitude: 561.4,
    inclination: 53.21,
    velocity: 7.57,
    eccentricity: 0.0001103,
    status: "OPERATIONAL",
    lastUpdate: "18 s ago",
    risk: "HIGH",
  },
  {
    id: "SAT-7741",
    norad: "77412",
    constellation: "CUSTOM CONSTELLATION",
    orbitType: "LEO",
    altitude: 782.6,
    inclination: 42.11,
    velocity: 7.45,
    eccentricity: 0.0004411,
    status: "OPERATIONAL",
    lastUpdate: "24 s ago",
    risk: "MODERATE",
  },
];

export const riskClasses: Record<
  RiskLevel,
  { text: string; bg: string; border: string; dot: string; range: string }
> = {
  LOW: {
    text: "text-risk-low",
    bg: "bg-risk-low/10",
    border: "border-risk-low/40",
    dot: "bg-risk-low",
    range: "< 0.1%",
  },
  MODERATE: {
    text: "text-risk-moderate",
    bg: "bg-risk-moderate/10",
    border: "border-risk-moderate/40",
    dot: "bg-risk-moderate",
    range: "0.1% – 1%",
  },
  HIGH: {
    text: "text-risk-high",
    bg: "bg-risk-high/10",
    border: "border-risk-high/40",
    dot: "bg-risk-high",
    range: "1% – 5%",
  },
  CRITICAL: {
    text: "text-risk-critical",
    bg: "bg-risk-critical/10",
    border: "border-risk-critical/40",
    dot: "bg-risk-critical",
    range: "> 5%",
  },
};

export function classifyRisk(p: number): RiskLevel {
  if (p >= 5) return "CRITICAL";
  if (p >= 1) return "HIGH";
  if (p >= 0.1) return "MODERATE";
  return "LOW";
}

/** Probability vs time-to-TCA curve (minutes before closest approach). */
export const probabilityCurve = Array.from({ length: 25 }, (_, i) => {
  const t = i * 5; // minutes elapsed of a 120-min window
  const peak = 100;
  const p = 8.7 * Math.exp(-Math.pow((t - peak) / 34, 2));
  const upper = p * 1.34 + 0.05;
  const lower = Math.max(0, p * 0.68 - 0.02);
  return {
    t: `T-${(120 - t).toString().padStart(3, "0")}m`,
    probability: Number(p.toFixed(3)),
    upper: Number(upper.toFixed(3)),
    lower: Number(lower.toFixed(3)),
  };
});

export const forecast24h = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, "0")}:00`,
  conjunctions: Math.round(
    18 + 12 * Math.sin(i / 3.1) + 6 * Math.sin(i / 1.3) + (i === 14 ? 14 : 0),
  ),
  highRisk: Math.max(
    0,
    Math.round(2 + 2.4 * Math.sin(i / 2.6 + 1) + (i === 14 ? 5 : 0)),
  ),
}));

export const riskDistribution = [
  { name: "LOW", value: 84, key: "LOW" as RiskLevel },
  { name: "MODERATE", value: 27, key: "MODERATE" as RiskLevel },
  { name: "HIGH", value: 12, key: "HIGH" as RiskLevel },
  { name: "CRITICAL", value: 4, key: "CRITICAL" as RiskLevel },
];

export const conjunctionTrend = {
  "24H": Array.from({ length: 24 }, (_, i) => ({
    label: `${i}h`,
    events: Math.round(90 + 30 * Math.sin(i / 2.2) + (i % 5) * 4),
  })),
  "7D": Array.from({ length: 7 }, (_, i) => ({
    label: `D-${7 - i}`,
    events: Math.round(1900 + 260 * Math.sin(i / 1.4) + i * 42),
  })),
  "30D": Array.from({ length: 30 }, (_, i) => ({
    label: `D-${30 - i}`,
    events: Math.round(1750 + 320 * Math.sin(i / 3.5) + i * 12),
  })),
};

/** Orbital density heatmap: altitude shells x inclination bands. */
export const ALT_SHELLS = ["400", "500", "550", "700", "800", "1200", "1400"];
export const INC_BANDS = ["0°", "20°", "40°", "53°", "70°", "87°", "98°"];
export const densityGrid = ALT_SHELLS.map((alt, r) =>
  INC_BANDS.map((inc, c) => {
    const v =
      Math.abs(Math.sin(r * 1.7 + c * 0.9)) * 0.55 +
      (r === 2 && c === 3 ? 0.45 : 0) +
      (r === 4 && c === 6 ? 0.32 : 0) +
      (c === 5 ? 0.12 : 0);
    return { alt, inc, value: Math.min(1, Number(v.toFixed(2))) };
  }),
);

export const maneuver = {
  deltaAltitude: 42,
  before: { probability: 8.7, missDistance: 184 },
  after: { probability: 0.03, missDistance: 2800 },
  fuelImpact: "LOW",
  deltaV: 0.019,
  confidence: 94.2,
  executeBy: "13:58 UTC",
};

export const ANALYSIS_STAGES = [
  "TRACKING",
  "TRAJECTORY PROPAGATION",
  "UNCERTAINTY MODELING",
  "COLLISION PROBABILITY",
  "RISK CLASSIFICATION",
];
