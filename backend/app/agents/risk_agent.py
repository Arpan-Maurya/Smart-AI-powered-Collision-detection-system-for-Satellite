"""Risk assessment agent — calls physics + ML, combines outputs, determines severity."""

import logging
from datetime import datetime, timezone

from app.config import get_settings
from app.agents import tools
from app.agents.state import AgentName, AgentRecord, ConjunctionState
from app.ml.explainability import build_reasons
from app.ml.model_manager import model_manager

logger = logging.getLogger(__name__)


def run(state: ConjunctionState) -> ConjunctionState:
    """Score the conjunction with the ML model and deterministic risk engine."""
    record = AgentRecord(agent=AgentName.RISK, status="STARTED", tool_called="predict_collision_risk")
    state.agent_log.append(record)
    state.log_event("RISK_ASSESSMENT_STARTED", event_id=state.event_id)

    settings = get_settings()
    thresholds = {
        "msd_threshold": settings.risk_msd_threshold,
        "critical": settings.risk_critical,
        "high": settings.risk_high,
        "medium": settings.risk_medium,
    }

    features = tools.calculate_features(state)
    if not features:
        raise RuntimeError("Feature engineering produced no features")
    state.features = features

    prediction = tools.predict_collision_risk(features, thresholds)
    state.ml_prediction = prediction
    state.risk_score = prediction["risk_score"]
    state.risk_tier = prediction["risk_tier"]
    state.confidence = prediction["confidence"]

    state.reasons = build_reasons(
        risk_tier=prediction["risk_tier"],
        risk_score=prediction["risk_score"],
        collision_prob=prediction["collision_probability"],
        msd_meters=prediction["msd_predicted_m"],
        confidence=prediction["confidence"],
        tca_horizon_hours=state.diagnostics.get("tca_horizon_hours", 24.0),
        relative_velocity_kms=state.relative_velocity_kms or state.diagnostics.get("relative_velocity_kms", 0.0),
        feature_importances=model_manager.feature_importances(),
        is_mock=model_manager.is_mock,
    )

    state.log_event(
        "RISK_ASSESSMENT_COMPLETED",
        risk_tier=prediction["risk_tier"],
        risk_score=prediction["risk_score"],
        model_version=prediction["model_version"],
    )

    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = (
        f"Risk {prediction['risk_tier']} — score {prediction['risk_score']:.4f}, "
        f"Pc {prediction['collision_probability'] * 100:.3f}%, MSD {prediction['msd_predicted_m']:.0f} m"
    )
    return state
