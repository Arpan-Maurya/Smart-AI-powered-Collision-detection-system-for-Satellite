"""
Safe maneuver simulation (MVP).

Generates candidate avoidance adjustments, simulates them by modifying the
TLE of the primary object and re-running the deterministic closest-approach
engine, then validates and ranks candidates.

Everything here is SIMULATION. No code path commands a real spacecraft.
The delta-v values are analytic estimates for small semi-major-axis changes:
    delta_v ≈ n * delta_a / 2      (n = mean motion rad/s, delta_a in km)
"""

import logging
import math
from datetime import datetime, timezone
from typing import List, Optional

import numpy as np

from app.core.conjunction import find_closest_approach
from app.core.exceptions import OrbitalCalculationError
from app.core.feature_engine import compute_features
from app.core.orbital_calc import compute_orbital_elements
from app.core.risk_engine import RiskTier, compute_full_risk
from app.core.tle_parser import parse_tle
from app.ml.model_manager import model_manager
from app.agents.state import ManeuverCandidate

logger = logging.getLogger(__name__)

MU_KM3_S2 = 398600.4418
EARTH_RADIUS_KM = 6378.137
MIN_SAFE_PERIGEE_KM = 200.0
MAX_DELTA_V_M_S = 30.0
MAX_SMA_DELTA_KM = 3.0

# Candidate adjustments (simulated)
CANDIDATE_SPECS = [
    {"kind": "NO_ACTION", "sma_delta_km": 0.0, "note": "Baseline — no maneuver"},
    {"kind": "ALTITUDE_UP", "sma_delta_km": 0.5, "note": "Raise semi-major axis by 0.5 km"},
    {"kind": "ALTITUDE_DOWN", "sma_delta_km": -0.5, "note": "Lower semi-major axis by 0.5 km"},
    {"kind": "PHASE_SHIFT", "sma_delta_km": 0.25, "note": "Small phase-adjusting SMA change"},
]


def _compute_checksum(line: str) -> int:
    """TLE mod-10 checksum (digits count as value, '-' as 1)."""
    total = 0
    for ch in line[:-1]:
        if ch.isdigit():
            total += int(ch)
        elif ch == "-":
            total += 1
    return total % 10


def _fmt_field(value: float, width: int, decimals: int, force_decimal: bool = False) -> str:
    """Format a TLE line-2 field with fixed width."""
    if force_decimal:
        # eccentricity: implied leading decimal point, no dot printed
        s = f"{value:.7f}".lstrip("0")
        if s.startswith("."):
            s = s[1:]
        return s[:width].rjust(width)
    s = f"{value:.{decimals}f}"
    if len(s) > width:
        s = s[:width]
    return s.rjust(width)


def apply_sma_change(line1: str, line2: str, delta_a_km: float) -> Optional[tuple]:
    """
    Return a new TLE pair for the same object after a small SMA change.

    Rebuilds line 2 mean-motion from Kepler's third law and recomputes the
    checksum so the modified TLE remains valid for SGP4 and the parser.

    Returns (new_line1, new_line2) or None if the change is out of bounds.
    """
    try:
        sat = parse_tle(line1, line2)
    except Exception:
        return None

    n_revday = sat.mean_motion
    n_rad_s = n_revday * 2.0 * math.pi / 86400.0
    a_km = (MU_KM3_S2 / (n_rad_s ** 2)) ** (1.0 / 3.0)
    new_a = a_km + delta_a_km
    if new_a <= 0:
        return None
    new_n_rad_s = math.sqrt(MU_KM3_S2 / (new_a ** 3))
    new_n_revday = new_n_rad_s * 86400.0 / (2.0 * math.pi)

    perigee_new = new_a * (1.0 - sat.eccentricity) - EARTH_RADIUS_KM
    if perigee_new < MIN_SAFE_PERIGEE_KM:
        return None  # constraint violation — would dip below safe altitude

    # Rebuild line 2
    l2 = list(line2.rstrip())
    l2[8:16] = _fmt_field(sat.inclination, 8, 4)
    l2[17:25] = _fmt_field(sat.raan, 8, 4)
    l2[26:33] = _fmt_field(sat.eccentricity, 7, 7, force_decimal=True)
    l2[34:42] = _fmt_field(sat.arg_perigee, 8, 4)
    l2[43:51] = _fmt_field(sat.mean_anomaly, 8, 4)
    l2[52:63] = _fmt_field(new_n_revday, 11, 8)
    l2[63:68] = f"{sat.rev_number:5d}"
    new_l2 = "".join(l2)[:68]
    checksum = sum(int(ch) for ch in new_l2 if ch.isdigit()) + new_l2.count("-")
    new_l2 = new_l2 + str(checksum % 10)

    return line1.rstrip(), new_l2


def _risk_for_pair(line1_a: str, line2_a: str, line1_b: str, line2_b: str) -> dict:
    """Run features + ML + risk scoring for a pair (returns dict or {} on failure)."""
    try:
        pa = parse_tle(line1_a, line2_a)
        pb = parse_tle(line1_b, line2_b)
        ea = compute_orbital_elements(pa)
        eb = compute_orbital_elements(pb)
        features = compute_features(ea, eb)
        msd, prob, conf = model_manager.predict(features)
        from app.config import get_settings
        settings = get_settings()
        result = compute_full_risk(
            msd_meters=msd,
            collision_prob=prob,
            model_version=model_manager.model_version,
            confidence=conf,
            msd_threshold=settings.risk_msd_threshold,
            critical_threshold=settings.risk_critical,
            high_threshold=settings.risk_high,
            medium_threshold=settings.risk_medium,
        )
        return {
            "risk_score": result.risk_score,
            "risk_tier": result.risk_tier.value,
            "collision_prob": result.collision_prob,
            "msd_m": result.msd_meters,
            "confidence": result.confidence,
        }
    except Exception as e:
        logger.warning("Risk computation failed during maneuver sim: %s", e)
        return {}


def generate_candidates(state) -> List[ManeuverCandidate]:
    """Generate candidate maneuvers (deterministic, physics-checked later)."""
    candidates: List[ManeuverCandidate] = []
    base_risk = state.risk_score or 0.0
    base_miss = state.miss_distance_m or 0.0

    for i, spec in enumerate(CANDIDATE_SPECS, start=1):
        delta_a = spec["sma_delta_km"]
        if abs(delta_a) > MAX_SMA_DELTA_KM:
            continue
        if spec["kind"] == "NO_ACTION":
            candidates.append(ManeuverCandidate(
                candidate_id=f"M{i}",
                kind=spec["kind"],
                delta_v_m_s=0.0,
                sma_delta_km=0.0,
                status="VALID",
                risk_before=base_risk,
                risk_after=base_risk,
                miss_before_m=base_miss,
                miss_after_m=base_miss,
                tca_change_min=0.0,
                secondary_conflicts=0,
                note=spec["note"],
            ))
            continue

        # delta-v estimate for SMA change: dv ≈ n * Δa / 2
        n_rad_s = None
        try:
            pa = parse_tle(state.line1_a, state.line2_a)
            n_revday = pa.mean_motion
            n_rad_s = n_revday * 2.0 * math.pi / 86400.0
        except Exception:
            pass
        dv_m_s = 0.0
        if n_rad_s:
            dv_m_s = abs(n_rad_s * delta_a) * 1000.0 / 2.0

        if dv_m_s > MAX_DELTA_V_M_S:
            continue  # exceeds small-maneuver budget

        candidates.append(ManeuverCandidate(
            candidate_id=f"M{i}",
            kind=spec["kind"],
            delta_v_m_s=round(dv_m_s, 3),
            sma_delta_km=delta_a,
            status="PENDING",
            risk_before=base_risk,
            miss_before_m=base_miss,
            note=spec["note"],
        ))
    return candidates


def simulate_maneuver(state, candidate: ManeuverCandidate) -> ManeuverCandidate:
    """
    Simulate a candidate on the primary satellite and validate it physically.

    Re-propagates the modified TLE, recomputes the closest approach and the
    post-maneuver ML risk, and checks constraints + secondary conflicts.
    """
    if candidate.kind == "NO_ACTION":
        return candidate

    new_tle = apply_sma_change(state.line1_a, state.line2_a, candidate.sma_delta_km)
    if new_tle is None:
        candidate.status = "REJECTED"
        candidate.note = "Constraint violation — resulting orbit unsafe or invalid TLE"
        candidate.constraint_violations.append("perigee < safe altitude or invalid TLE")
        return candidate

    line1_a2, line2_a2 = new_tle

    # Physics: closest approach after maneuver
    try:
        ca = find_closest_approach(
            line1_a2, line2_a2, state.line1_b, state.line2_b,
            horizon_hours=state.horizon_hours,
        )
        candidate.miss_after_m = ca.miss_distance_m
        if state.tca:
            try:
                old_tca = datetime.fromisoformat(state.tca)
                candidate.tca_change_min = round((ca.tca - old_tca).total_seconds() / 60.0, 2)
            except Exception:
                candidate.tca_change_min = 0.0
    except OrbitalCalculationError as e:
        candidate.status = "REJECTED"
        candidate.note = f"Propagation failed after maneuver: {e}"
        candidate.constraint_violations.append("propagation error")
        return candidate

    # ML risk after maneuver
    after = _risk_for_pair(line1_a2, line2_a2, state.line1_b, state.line2_b)
    if after:
        candidate.risk_after = after["risk_score"]

    # Secondary conflicts: re-screen against the optional catalog
    conflicts = 0
    conflict_ids = []
    for obj in state.catalog:
        try:
            ca2 = find_closest_approach(
                line1_a2, line2_a2, obj["line1"], obj["line2"],
                horizon_hours=min(48.0, state.horizon_hours),
            )
            if ca2.miss_distance_m < 5000.0:
                conflicts += 1
                conflict_ids.append(obj.get("name") or obj.get("line1", "?")[:6])
        except Exception:
            continue
    candidate.secondary_conflicts = conflicts
    if conflict_ids:
        candidate.note = f"Creates {conflicts} new close approach(es): {', '.join(conflict_ids[:4])}"

    # Validation rules — a maneuver that trades one risk for another is rejected
    if candidate.risk_after > candidate.risk_before:
        candidate.status = "REJECTED"
        candidate.constraint_violations.append("post-maneuver risk higher than pre-maneuver risk")
    elif candidate.miss_after_m < candidate.miss_before_m and candidate.miss_after_m < 10000:
        candidate.status = "REJECTED"
        candidate.constraint_violations.append("miss distance worsened")
    elif candidate.secondary_conflicts > 0:
        candidate.status = "REJECTED"
        candidate.constraint_violations.append(f"creates {conflicts} secondary conflict(s)")
    else:
        candidate.status = "VALID"

    if candidate.status == "PENDING":
        candidate.status = "VALID"

    if not candidate.note:
        candidate.note = f"Simulated: miss {candidate.miss_before_m:.0f} m → {candidate.miss_after_m:.0f} m, " \
                        f"risk {candidate.risk_before:.3f} → {candidate.risk_after:.3f}"
    return candidate


def rank_candidates(valid: List[ManeuverCandidate]) -> List[ManeuverCandidate]:
    """
    Deterministic ranking — the LLM never chooses the winner.

    score = risk reduction - secondary conflict penalty - maneuver magnitude
            penalty - uncertainty penalty
    """
    max_dv = MAX_DELTA_V_M_S
    for c in valid:
        base = max(c.risk_before, 1e-6)
        risk_reduction = (c.risk_before - c.risk_after) / base
        conflict_penalty = c.secondary_conflicts * 0.4
        magnitude_penalty = min(0.5, (abs(c.delta_v_m_s) / max_dv) * 0.5)
        uncertainty_penalty = 0.05 * (1.0 - (c.risk_before))  # higher pre-maneuver risk = more uncertainty
        c.rank_score = round(risk_reduction - conflict_penalty - magnitude_penalty - uncertainty_penalty, 4)
    valid.sort(key=lambda c: c.rank_score, reverse=True)
    return valid
