"""
Conjunction detection core.

Finds the Time of Closest Approach (TCA) between two SGP4-propagated objects
using a coarse-to-fine numerical search. Produces miss distance, relative
velocity at TCA and the TCA timestamp. All physics here is deterministic —
no ML and no LLM involvement.
"""

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Tuple

import numpy as np
from sgp4.api import Satrec, WGS72

from app.core.exceptions import OrbitalCalculationError
from app.core.orbital_calc import _datetime_to_jd

logger = logging.getLogger(__name__)

EARTH_RADIUS_KM = 6378.137


@dataclass(frozen=True)
class ClosestApproach:
    """Result of a fine closest-approach search between two objects."""

    tca: datetime
    miss_distance_km: float
    miss_distance_m: float
    relative_velocity_kms: float
    position_a_km: Tuple[float, float, float]
    position_b_km: Tuple[float, float, float]


def build_satrec(line1: str, line2: str) -> Satrec:
    """Build an SGP4 Satrec from TLE lines, raising a typed error on failure."""
    try:
        return Satrec.twoline2rv(line1.strip(), line2.strip(), WGS72)
    except Exception as e:  # sgp4 raises ValueError / RuntimeError
        raise OrbitalCalculationError(f"Failed to build SGP4 object: {e}")


def _separation(
    sat_a: Satrec,
    sat_b: Satrec,
    jd: float,
    fr: float,
) -> Optional[Tuple[float, float, np.ndarray, np.ndarray]]:
    """Distance (km), relative speed (km/s) and positions at a given epoch."""
    err_a, pos_a, vel_a = sat_a.sgp4(jd, fr)
    err_b, pos_b, vel_b = sat_b.sgp4(jd, fr)
    if err_a != 0 or err_b != 0:
        return None
    pa = np.asarray(pos_a, dtype=np.float64)
    pb = np.asarray(pos_b, dtype=np.float64)
    if np.any(np.isnan(pa)) or np.any(np.isnan(pb)):
        return None
    dist = float(np.linalg.norm(pa - pb))
    rel_v = float(np.linalg.norm(np.asarray(vel_a) - np.asarray(vel_b)))
    return dist, rel_v, pa, pb


def find_closest_approach(
    line1_a: str,
    line2_a: str,
    line1_b: str,
    line2_b: str,
    start: Optional[datetime] = None,
    horizon_hours: float = 24.0,
) -> ClosestApproach:
    """
    Find the time of closest approach between two objects.

    Uses a coarse search (30 s steps) followed by two refinement passes
    (1 s, then 50 ms) around the coarse minimum.

    Args:
        line1_a, line2_a: TLE lines for object A.
        line1_b, line2_b: TLE lines for object B.
        start: Start epoch (defaults to now UTC).
        horizon_hours: Forward search window.

    Returns:
        ClosestApproach with TCA, miss distance and relative velocity.

    Raises:
        OrbitalCalculationError: If propagation fails everywhere or TLEs are invalid.
    """
    sat_a = build_satrec(line1_a, line2_a)
    sat_b = build_satrec(line1_b, line2_b)

    if start is None:
        start = datetime.now(timezone.utc)
    start_ms = start.timestamp() * 1000.0
    end_ms = start_ms + horizon_hours * 3600_000.0

    jd, fr_base = _datetime_to_jd(start)

    best_t_ms = start_ms
    best_dist = float("inf")

    # Coarse pass
    for t_ms in range(int(start_ms), int(end_ms) + 1, 30_000):
        fr = fr_base + (t_ms - start_ms) / 86_400_000.0
        s = _separation(sat_a, sat_b, jd, fr)
        if s is None:
            continue
        if s[0] < best_dist:
            best_dist = s[0]
            best_t_ms = t_ms

    if not math.isfinite(best_dist):
        raise OrbitalCalculationError("No valid propagation samples in window")

    # Refinement passes
    for step_ms in (1000, 50):
        lo = best_t_ms - 40 * step_ms
        hi = best_t_ms + 40 * step_ms
        for t_ms in range(int(lo), int(hi) + 1, step_ms):
            fr = fr_base + (t_ms - start_ms) / 86_400_000.0
            s = _separation(sat_a, sat_b, jd, fr)
            if s is None:
                continue
            if s[0] < best_dist:
                best_dist = s[0]
                best_t_ms = t_ms

    fr_final = fr_base + (best_t_ms - start_ms) / 86_400_000.0
    final = _separation(sat_a, sat_b, jd, fr_final)
    if final is None:
        raise OrbitalCalculationError("Closest approach found but final state invalid")

    tca = datetime.fromtimestamp(best_t_ms / 1000.0, tz=timezone.utc)
    return ClosestApproach(
        tca=tca,
        miss_distance_km=round(final[0], 6),
        miss_distance_m=round(final[0] * 1000.0, 2),
        relative_velocity_kms=round(final[1], 6),
        position_a_km=tuple(float(x) for x in final[2]),
        position_b_km=tuple(float(x) for x in final[3]),
    )
