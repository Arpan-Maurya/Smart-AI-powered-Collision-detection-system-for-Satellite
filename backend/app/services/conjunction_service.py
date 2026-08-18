"""
Conjunction detection service.

Screens a satellite catalog for potential close approaches:

  1. Parse every TLE and compute orbital elements.
  2. Broad-phase altitude-envelope filtering (O(N log N), no propagation).
  3. Fine SGP4 closest-approach search for surviving pairs.
  4. Keep pairs whose miss distance is below the reporting threshold.

For a single pair, ``detect_pair`` runs the same fine engine directly.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from app.core.conjunction import find_closest_approach
from app.core.exceptions import OrbitalCalculationError, TLEValidationError
from app.core.feature_engine import FEATURE_NAMES, compute_features
from app.core.orbital_calc import (
    compute_orbital_elements,
    filter_potential_conjunction_pairs,
)
from app.core.tle_parser import ParsedTLE, parse_tle
from app.schemas.conjunction import ConjunctionEvent

logger = logging.getLogger(__name__)


def _event_id() -> str:
    return "CJ-" + uuid.uuid4().hex[:12].upper()


def _make_event(
    parsed_a: ParsedTLE,
    parsed_b: ParsedTLE,
    tca: datetime,
    miss_m: float,
    rel_v_kms: float,
    horizon_hours: float,
) -> ConjunctionEvent:
    """Build a ConjunctionEvent with model features + non-model diagnostics."""
    elements_a = compute_orbital_elements(parsed_a)
    elements_b = compute_orbital_elements(parsed_b)
    features = compute_features(elements_a, elements_b)

    mean_alt_km = (elements_a.semi_major_axis_km + elements_b.semi_major_axis_km) / 2.0 - 6378.137
    diagnostics: Dict[str, float] = {
        "mean_altitude_km": round(mean_alt_km, 3),
        "altitude_delta_km": round(abs(elements_a.apogee_alt_km - elements_b.apogee_alt_km), 3),
        "inclination_delta_deg": round(abs(elements_a.inclination_deg - elements_b.inclination_deg), 4),
        "tca_horizon_hours": round(max(0.0, (tca - datetime.now(timezone.utc)).total_seconds() / 3600.0), 4),
        "relative_velocity_kms": round(rel_v_kms, 6),
        "period_delta_min": round(abs(elements_a.mean_motion_revday - elements_b.mean_motion_revday) * 1440.0, 6),
        "eccentricity_max": round(max(elements_a.eccentricity, elements_b.eccentricity), 7),
    }

    return ConjunctionEvent(
        event_id=_event_id(),
        sat1_norad_id=parsed_a.norad_id,
        sat2_norad_id=parsed_b.norad_id,
        sat1_name=parsed_a.name,
        sat2_name=parsed_b.name,
        tca=tca.isoformat(),
        miss_distance_m=round(miss_m, 2),
        relative_velocity_kms=round(rel_v_kms, 6),
        horizon_hours=horizon_hours,
        features=[float(x) for x in features],
        feature_names=list(FEATURE_NAMES),
        diagnostics=diagnostics,
    )


def detect_pair(
    line1_a: str,
    line2_a: str,
    line1_b: str,
    line2_b: str,
    name_a: Optional[str] = None,
    name_b: Optional[str] = None,
    horizon_hours: float = 24.0,
) -> Optional[ConjunctionEvent]:
    """
    Detect a conjunction for a single satellite pair.

    Returns None if the pair never gets closer than the reporting threshold.
    """
    parsed_a = parse_tle(line1_a, line2_a, name=name_a)
    parsed_b = parse_tle(line1_b, line2_b, name=name_b)

    try:
        ca = find_closest_approach(
            line1_a, line2_a, line1_b, line2_b,
            horizon_hours=horizon_hours,
        )
    except OrbitalCalculationError as e:
        logger.warning("Closest-approach failed for %s vs %s: %s",
                       parsed_a.norad_id, parsed_b.norad_id, e)
        return None

    if ca.miss_distance_m > 50_000.0:
        return None

    return _make_event(parsed_a, parsed_b, ca.tca, ca.miss_distance_m, ca.relative_velocity_kms, horizon_hours)


def screen_catalog(
    tles: List[dict],
    horizon_hours: float = 24.0,
    miss_distance_threshold_m: float = 50_000.0,
    max_pairs: int = 200,
) -> Tuple[List[ConjunctionEvent], int, int]:
    """
    Screen a catalog of TLEs for conjunctions.

    Args:
        tles: List of {"name"?, "line1", "line2"} dicts.
        horizon_hours: Forward search window per pair.
        miss_distance_threshold_m: Reporting threshold.
        max_pairs: Hard cap on fine propagations (scalability guard).

    Returns:
        (events, screened_pairs, total_pairs)
    """
    parsed: List[Tuple[ParsedTLE, dict]] = []
    for tle in tles:
        try:
            parsed.append((parse_tle(tle["line1"], tle["line2"], name=tle.get("name")), tle))
        except TLEValidationError as e:
            logger.warning("Skipping invalid TLE in catalog: %s", e)

    n = len(parsed)
    total_pairs = n * (n - 1) // 2
    if n < 2:
        return [], 0, total_pairs

    elements = [compute_orbital_elements(p) for p, _ in parsed]
    candidate_pairs = filter_potential_conjunction_pairs(elements, altitude_threshold_km=25.0)
    screened = len(candidate_pairs)

    events: List[ConjunctionEvent] = []
    for (ea, eb) in candidate_pairs:
        if len(events) >= max_pairs:
            logger.warning("Reached max_pairs=%d — screening truncated", max_pairs)
            break
        pa = next(p for p, _ in parsed if p.norad_id == ea.norad_id)
        pb = next(p for p, _ in parsed if p.norad_id == eb.norad_id)
        try:
            ca = find_closest_approach(pa.line1, pa.line2, pb.line1, pb.line2, horizon_hours=horizon_hours)
        except OrbitalCalculationError:
            continue
        if ca.miss_distance_m <= miss_distance_threshold_m:
            events.append(
                _make_event(pa, pb, ca.tca, ca.miss_distance_m, ca.relative_velocity_kms, horizon_hours)
            )

    events.sort(key=lambda e: e.miss_distance_m)
    return events, screened, total_pairs
