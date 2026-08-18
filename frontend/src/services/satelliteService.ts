import {
  loadSgp4,
  type SatGroup,
  type SatelliteObject,
} from "@/utils/orbitalPropagation";
import { FALLBACK_TLE } from "@/data/fallbackSatellites";

/**
 * Data provider boundary. Cesium/Three components never call CelesTrak directly —
 * they consume the normalized `SatelliteObject[]` produced here, so the provider
 * can be swapped later without touching the visualization layer.
 */

const BASE = "https://celestrak.org/NORAD/elements/gp.php";

interface GroupSpec {
  group: SatGroup;
  celestrak: string;
  limit: number;
}

const GROUPS: GroupSpec[] = [
  { group: "starlink", celestrak: "starlink", limit: 900 },
  { group: "oneweb", celestrak: "oneweb", limit: 350 },
  { group: "gps", celestrak: "gps-ops", limit: 40 },
  { group: "other", celestrak: "active", limit: 900 },
];

export type FeedStatus = "idle" | "loading" | "live" | "fallback";

export interface SatelliteFeed {
  satellites: SatelliteObject[];
  status: FeedStatus;
  source: string;
  fetchedAt: number;
  message: string;
}

/** Minimum interval between live fetches — respect CelesTrak usage limits. */
export const MIN_REFRESH_MS = 60 * 60 * 1000;
let lastFetchAt = 0;
let cache: SatelliteFeed | null = null;

function classify(name: string, fallback: SatGroup): SatGroup {
  const n = name.toUpperCase();
  if (n.startsWith("STARLINK")) return "starlink";
  if (n.startsWith("ONEWEB")) return "oneweb";
  if (n.startsWith("GPS") || n.startsWith("NAVSTAR")) return "gps";
  return fallback;
}

function objectType(name: string) {
  const n = name.toUpperCase();
  if (n.includes("DEB")) return "DEBRIS";
  if (n.includes("R/B")) return "ROCKET BODY";
  return "PAYLOAD";
}

async function parseTle(
  text: string,
  fallbackGroup: SatGroup,
  limit: number,
  seen: Set<string>,
): Promise<SatelliteObject[]> {
  const sgp4 = await loadSgp4();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const out: SatelliteObject[] = [];
  for (let i = 0; i + 2 < lines.length + 1 && out.length < limit; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!name || !l1 || !l2 || !l1.startsWith("1 ") || !l2.startsWith("2 ")) continue;
    const norad = l1.slice(2, 7).trim();
    if (seen.has(norad)) continue;
    try {
      const satrec = sgp4.twoline2satrec(l1, l2);
      const no = (satrec as unknown as { no?: number; no_kozai?: number });
      const meanMotion = no.no ?? no.no_kozai ?? 0; // rad/min
      if (!meanMotion || !Number.isFinite(meanMotion)) continue;
      const periodMin = (2 * Math.PI) / meanMotion;
      const a = Math.cbrt(398600.4418 * Math.pow((periodMin * 60) / (2 * Math.PI), 2));
      const meanAltitudeKm = a - 6371;
      if (!Number.isFinite(meanAltitudeKm) || meanAltitudeKm < 120 || meanAltitudeKm > 40000)
        continue;
      seen.add(norad);
      out.push({
        id: norad,
        name: name.trim(),
        norad,
        group: classify(name, fallbackGroup),
        objectType: objectType(name),
        satrec,
        inclinationDeg: (satrec.inclo * 180) / Math.PI,
        eccentricity: satrec.ecco,
        periodMin,
        meanAltitudeKm,
      });
    } catch {
      /* skip malformed element set */
    }
  }
  return out;
}

export async function loadFallback(): Promise<SatelliteObject[]> {
  return parseTle(FALLBACK_TLE, "other", 999, new Set());
}

/** Persist raw element sets so CelesTrak is never queried more than needed. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function cacheKey(group: string) {
  return `orbital-ai:gp:${group}`;
}

function readCache(group: string): { text: string; at: number } | null {
  try {
    const raw = localStorage.getItem(cacheKey(group));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text: string; at: number };
    return parsed.text ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(group: string, text: string) {
  try {
    localStorage.setItem(cacheKey(group), JSON.stringify({ text, at: Date.now() }));
  } catch {
    /* storage unavailable / quota */
  }
}

async function fetchGroup(spec: GroupSpec, seen: Set<string>, force: boolean) {
  const cached = readCache(spec.celestrak);
  if (cached && !force && Date.now() - cached.at < CACHE_TTL_MS)
    return parseTle(cached.text, spec.group, spec.limit, seen);

  const url = `${BASE}?GROUP=${spec.celestrak}&FORMAT=tle`;
  try {
    const res = await fetch(url, { headers: { Accept: "text/plain" } });
    const text = res.ok ? await res.text() : "";
    if (!res.ok || text.includes("Invalid query") || text.trim().length < 100)
      throw new Error(`CelesTrak ${spec.celestrak}: ${res.status}`);
    writeCache(spec.celestrak, text);
    return parseTle(text, spec.group, spec.limit, seen);
  } catch (err) {
    // CelesTrak throttles repeated identical queries — reuse the last good copy.
    if (cached) return parseTle(cached.text, spec.group, spec.limit, seen);
    throw err;
  }
}


export async function fetchSatellites(force = false): Promise<SatelliteFeed> {
  const now = Date.now();
  if (!force && cache && now - lastFetchAt < MIN_REFRESH_MS) return cache;

  const seen = new Set<string>();
  try {
    const results = await Promise.allSettled(GROUPS.map((g) => fetchGroup(g, seen, force)));
    const satellites = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (!satellites.length) throw new Error("no live element sets");
    lastFetchAt = now;
    cache = {
      satellites,
      status: "live",
      source: "CELESTRAK GP",
      fetchedAt: now,
      message: "ORBITAL DATA UPDATED",
    };
    return cache;
  } catch (err) {
    const satellites = await loadFallback();
    cache = {
      satellites,
      status: "fallback",
      source: "LOCAL ARCHIVE",
      fetchedAt: now,
      message:
        err instanceof Error && /fetch|CORS|Failed/i.test(err.message)
          ? "LIVE DATA UNAVAILABLE · FALLBACK ORBITAL DATA ACTIVE"
          : "LIVE DATA UNAVAILABLE · FALLBACK ORBITAL DATA ACTIVE",
    };
    return cache;
  }
}
