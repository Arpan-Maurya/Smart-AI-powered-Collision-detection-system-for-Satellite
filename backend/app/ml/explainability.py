"""
Explainability module.

Builds human-readable risk reasons strictly from actual system outputs:
physics results, ML predictions, TCA geometry and model importances.

Reasons are structured (list of strings) and every claim maps to a number
that was actually computed. The explanation agent assembles these into
prose without inventing facts.
"""

import logging
from typing import List

from app.core.feature_engine import FEATURE_NAMES

logger = logging.getLogger(__name__)


def build_reasons(
    risk_tier: str,
    risk_score: float,
    collision_prob: float,
    msd_meters: float,
    confidence: float,
    tca_horizon_hours: float,
    relative_velocity_kms: float,
    feature_importances: dict,
    is_mock: bool,
) -> List[str]:
    """
    Build a structured list of reasons for a risk assessment.

    Every reason references a computed value. Nothing here is guessed.
    """
    reasons: List[str] = []

    if msd_meters < 1000:
        reasons.append(f"Predicted separation of {msd_meters:.0f} m is below the 1 km safety threshold")
    elif msd_meters < 5000:
        reasons.append(f"Predicted separation of {msd_meters:.0f} m is close (5 km threshold)")

    if collision_prob >= 0.05:
        reasons.append(f"Collision probability is elevated at {collision_prob * 100:.2f}%")
    elif collision_prob >= 0.01:
        reasons.append(f"Collision probability of {collision_prob * 100:.2f}% exceeds the 1% review band")

    if tca_horizon_hours <= 6:
        reasons.append(f"Time of closest approach is imminent ({tca_horizon_hours:.1f} h away)")
    elif tca_horizon_hours <= 24:
        reasons.append(f"TCA is within the 24 h action window ({tca_horizon_hours:.1f} h)")

    if relative_velocity_kms > 10:
        reasons.append(f"High relative velocity ({relative_velocity_kms:.2f} km/s) — any impact would be severe")
    elif relative_velocity_kms < 1:
        reasons.append(f"Low relative velocity ({relative_velocity_kms:.2f} km/s) — long-duration near-parallel pass")

    if confidence < 0.5:
        reasons.append(f"Low model confidence ({confidence * 100:.0f}%) — additional analysis requested")

    # Top contributing model features (real importance when available)
    importances = feature_importances.get("importances", {})
    source = feature_importances.get("source", "MODEL")
    if importances:
        top = sorted(importances.items(), key=lambda kv: kv[1], reverse=True)[:3]
        names = ", ".join(f"{n}" for n, _ in top)
        reasons.append(f"Top model drivers: {names}")

    if not reasons:
        reasons.append("No risk factors above their configured thresholds")

    if is_mock:
        reasons.append("Result produced by the development MOCK model — not a real scientific prediction")

    return reasons
