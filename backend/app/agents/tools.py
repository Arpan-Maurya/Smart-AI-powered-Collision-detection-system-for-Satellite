"""
Controlled agent tools.

Agents may only call these deterministic functions. There is intentionally
no arbitrary-shell / code-execution tool. Every tool either reads physics,
runs ML inference, or persists workflow state.
"""

import logging
from typing import Dict, List, Optional

from app.core.conjunction import find_closest_approach
from app.core.feature_engine import compute_features
from app.core.maneuver import generate_candidates as _generate_candidates
from app.core.maneuver import rank_candidates as _rank_candidates
from app.core.maneuver import simulate_maneuver as _simulate_maneuver
from app.core.orbital_calc import compute_orbital_elements
from app.core.risk_engine import compute_full_risk
from app.core.tle_parser import parse_tle
from app.ml.model_manager import model_manager
from app.agents.state import ConjunctionState, ManeuverCandidate

logger = logging.getLogger(__name__)


def get_satellite_state(state: ConjunctionState) -> Dict:
    """Return the current two-object orbital state from the workflow state."""
    try:
        pa = parse_tle(state.line1_a, state.line2_a, name=state.satellite_a.get("name"))
        pb = parse_tle(state.line1_b, state.line2_b, name=state.satellite_b.get("name"))
        ea = compute_orbital_elements(pa)
        eb = compute_orbital_elements(pb)
        return {
            "satellite_a": {"norad": pa.norad_id, "name": pa.name, "altitude_km": round(ea.semi_major_axis_km - 6378.137, 3)},
            "satellite_b": {"norad": pb.norad_id, "name": pb.name, "altitude_km": round(eb.semi_major_axis_km - 6378.137, 3)},
            "inclination_delta_deg": round(abs(ea.inclination_deg - eb.inclination_deg), 4),
            "sma_delta_km": round(abs(ea.semi_major_axis_km - eb.semi_major_axis_km), 4),
        }
    except Exception as e:
        logger.warning("get_satellite_state failed: %s", e)
        return {"error": str(e)}


def propagate_orbit(line1: str, line2: str, hours_ahead: float = 0.0) -> Dict:
    """Propagate a single object and return ECI position/velocity."""
    try:
        from datetime import datetime, timezone, timedelta
        from app.core.orbital_calc import propagate_sgp4
        pos, vel = propagate_sgp4(
            line1, line2,
            dt=datetime.now(timezone.utc) + timedelta(hours=hours_ahead),
        )
        return {
            "position_km": [float(x) for x in pos],
            "velocity_kms": [float(x) for x in vel],
            "hours_ahead": hours_ahead,
        }
    except Exception as e:
        return {"error": str(e)}


def detect_conjunction(state: ConjunctionState) -> Dict:
    """Re-run the deterministic closest-approach engine for the pair."""
    try:
        ca = find_closest_approach(
            state.line1_a, state.line2_a, state.line1_b, state.line2_b,
            horizon_hours=state.horizon_hours,
        )
        return {
            "tca": ca.tca.isoformat(),
            "miss_distance_m": ca.miss_distance_m,
            "relative_velocity_kms": ca.relative_velocity_kms,
        }
    except Exception as e:
        return {"error": str(e)}


def calculate_features(state: ConjunctionState) -> List[float]:
    """Compute the 8 model features for the pair."""
    try:
        pa = parse_tle(state.line1_a, state.line2_a)
        pb = parse_tle(state.line1_b, state.line2_b)
        ea = compute_orbital_elements(pa)
        eb = compute_orbital_elements(pb)
        features = compute_features(ea, eb)
        return [float(x) for x in features]
    except Exception as e:
        logger.warning("calculate_features failed: %s", e)
        return []


def predict_collision_risk(features: List[float], thresholds: Dict) -> Dict:
    """Run ML inference + deterministic risk scoring."""
    import numpy as np
    msd, prob, conf = model_manager.predict(np.asarray(features, dtype=np.float64))
    result = compute_full_risk(
        msd_meters=msd,
        collision_prob=prob,
        model_version=model_manager.model_version,
        confidence=conf,
        msd_threshold=thresholds.get("msd_threshold", 1000.0),
        critical_threshold=thresholds.get("critical", 0.8),
        high_threshold=thresholds.get("high", 0.6),
        medium_threshold=thresholds.get("medium", 0.3),
    )
    return {
        "msd_predicted_m": round(result.msd_meters, 2),
        "collision_probability": round(result.collision_prob, 6),
        "risk_score": round(result.risk_score, 6),
        "risk_tier": result.risk_tier.value,
        "confidence": round(result.confidence, 4),
        "model_version": result.model_version,
        "is_mock": model_manager.is_mock,
    }


def generate_maneuver_candidates(state: ConjunctionState) -> List[ManeuverCandidate]:
    """Generate candidate maneuvers (physics engine, no validation yet)."""
    return _generate_candidates(state)


def simulate_maneuver(state: ConjunctionState, candidate: ManeuverCandidate) -> ManeuverCandidate:
    """Simulate and validate one candidate through the physics layer."""
    return _simulate_maneuver(state, candidate)


def check_secondary_conflicts(state: ConjunctionState, candidate: ManeuverCandidate) -> int:
    """Return how many catalog objects the maneuver brings within 5 km."""
    if candidate.kind == "NO_ACTION":
        return 0
    from app.core.maneuver import apply_sma_change
    from app.core.conjunction import find_closest_approach
    new_tle = apply_sma_change(state.line1_a, state.line2_a, candidate.sma_delta_km)
    if not new_tle:
        return 0
    conflicts = 0
    for obj in state.catalog:
        try:
            ca = find_closest_approach(
                new_tle[0], new_tle[1], obj["line1"], obj["line2"],
                horizon_hours=min(48.0, state.horizon_hours),
            )
            if ca.miss_distance_m < 5000.0:
                conflicts += 1
        except Exception:
            continue
    return conflicts


def rank_candidates(valid: List[ManeuverCandidate]) -> List[ManeuverCandidate]:
    """Deterministic ranking layer."""
    return _rank_candidates(valid)


def get_historical_events(event_id: str) -> List[Dict]:
    """Return stored orchestration runs for this event (persistence layer)."""
    try:
        from app.db.orchestration_repo import list_runs_for_event
        return list_runs_for_event(event_id)
    except Exception as e:
        logger.warning("get_historical_events failed: %s", e)
        return []


def persist_workflow_state(state: ConjunctionState) -> Dict:
    """Persist the workflow state (Supabase when available, else in-memory)."""
    from app.db.orchestration_repo import upsert_run
    return upsert_run(state)
