"""
Orchestration service — public entry point for the agentic workflow.

Pipeline: TLE pair → conjunction detection → agentic analysis → candidate
maneuvers → physics validation → ranking → explainable recommendation →
human approval gate.
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.agents.orchestrator import run_workflow
from app.agents.state import ConjunctionState, WorkflowStatus
from app.core.exceptions import OrbitalCalculationError, TLEValidationError
from app.core.tle_parser import parse_tle
from app.db import orchestration_repo
from app.ml.model_manager import model_manager
from app.schemas.orchestration import CatalogObject, ManeuverView

logger = logging.getLogger(__name__)


def _view(candidate) -> ManeuverView:
    return ManeuverView(
        candidate_id=candidate.candidate_id,
        kind=candidate.kind,
        status=candidate.status,
        delta_v_m_s=candidate.delta_v_m_s,
        sma_delta_km=candidate.sma_delta_km,
        risk_before=candidate.risk_before,
        risk_after=candidate.risk_after,
        miss_before_m=candidate.miss_before_m,
        miss_after_m=candidate.miss_after_m,
        tca_change_min=candidate.tca_change_min,
        secondary_conflicts=candidate.secondary_conflicts,
        constraint_violations=list(candidate.constraint_violations),
        rank_score=candidate.rank_score,
        note=candidate.note,
    )


def _response(state: ConjunctionState) -> dict:
    return {
        "workflow_id": state.workflow_id,
        "event_id": state.event_id,
        "status": state.workflow_status.value,
        "satellite_a": state.satellite_a,
        "satellite_b": state.satellite_b,
        "tca": state.tca,
        "miss_distance_m": state.miss_distance_m,
        "relative_velocity_kms": state.relative_velocity_kms,
        "risk_score": state.risk_score,
        "risk_tier": state.risk_tier,
        "confidence": state.confidence,
        "reasons": list(state.reasons),
        "ml_prediction": dict(state.ml_prediction),
        "candidates": [_view(c) for c in state.candidates],
        "validated": [_view(c) for c in state.validated],
        "rejected": [_view(c) for c in state.rejected],
        "secondary_conflicts": list(state.secondary_conflicts),
        "recommendation": dict(state.recommendation),
        "explanation": state.explanation,
        "agent_log": [r.model_dump(mode="json") for r in state.agent_log],
        "timeline": list(state.timeline),
        "human_approval_required": state.human_approval_required,
        "approval_status": state.approval_status,
        "approval_note": state.approval_note,
        "model_metadata": model_manager.get_metadata(),
        "fallback_used": bool(state.recommendation.get("fallback_used", False)),
    }


def analyze(
    line1_a: str,
    line2_a: str,
    line1_b: str,
    line2_b: str,
    name_a: Optional[str] = None,
    name_b: Optional[str] = None,
    horizon_hours: float = 24.0,
    catalog: Optional[List[CatalogObject]] = None,
) -> dict:
    """
    Run the full orchestration workflow for a satellite pair.

    Returns the OrchestrationResponse dict. Raises TLEValidationError /
    OrbitalCalculationError for bad inputs.
    """
    # Validate TLEs up-front so the API returns 400/422 cleanly
    parsed_a = parse_tle(line1_a, line2_a, name=name_a)
    parsed_b = parse_tle(line1_b, line2_b, name=name_b)

    # Conjunction detection (fine propagation)
    from app.services.conjunction_service import detect_pair
    event = detect_pair(
        line1_a, line2_a, line1_b, line2_b,
        name_a=name_a, name_b=name_b, horizon_hours=horizon_hours,
    )
    if event is None:
        raise OrbitalCalculationError("No conjunction found within the screening threshold for this pair")

    state = ConjunctionState(
        satellite_a={"norad": parsed_a.norad_id, "name": parsed_a.name or ""},
        satellite_b={"norad": parsed_b.norad_id, "name": parsed_b.name or ""},
        line1_a=line1_a,
        line2_a=line2_a,
        line1_b=line1_b,
        line2_b=line2_b,
        tca=event.tca,
        miss_distance_m=event.miss_distance_m,
        relative_velocity_kms=event.relative_velocity_kms,
        horizon_hours=horizon_hours,
        tca_horizon_hours=event.diagnostics.get("tca_horizon_hours"),
        features=event.features,
        diagnostics=event.diagnostics,
        catalog=[obj.model_dump() for obj in catalog] if catalog else [],
    )

    state = run_workflow(state)
    return _response(state)


def get_run(workflow_id: str) -> Optional[dict]:
    """Fetch a stored orchestration run."""
    run = orchestration_repo.get_run(workflow_id)
    if not run:
        return None
    return _response(ConjunctionState(**run))


def get_timeline(workflow_id: str) -> Optional[dict]:
    """Fetch the orchestration timeline."""
    run = orchestration_repo.get_run(workflow_id)
    if not run:
        return None
    state = ConjunctionState(**run)
    return {
        "workflow_id": state.workflow_id,
        "event_id": state.event_id,
        "status": state.workflow_status.value,
        "timeline": state.timeline,
    }


def get_maneuvers(workflow_id: str) -> Optional[dict]:
    """Fetch candidate + validated + rejected maneuvers for a run."""
    run = orchestration_repo.get_run(workflow_id)
    if not run:
        return None
    state = ConjunctionState(**run)
    return {
        "workflow_id": state.workflow_id,
        "event_id": state.event_id,
        "candidates": [_view(c) for c in state.candidates],
        "validated": [_view(c) for c in state.validated],
        "rejected": [_view(c) for c in state.rejected],
    }


def decide(workflow_id: str, approve: bool, note: Optional[str] = None) -> Optional[dict]:
    """Record a human approval / rejection decision."""
    run = orchestration_repo.record_decision(workflow_id, approve=approve, note=note)
    if not run:
        return None
    return _response(ConjunctionState(**run))
