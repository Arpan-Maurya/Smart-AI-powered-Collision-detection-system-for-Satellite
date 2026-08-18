"""Explanation agent — human-readable explanation from structured outputs only."""

import logging
from datetime import datetime, timezone

from app.agents import tools
from app.agents.state import AgentName, AgentRecord, ConjunctionState

logger = logging.getLogger(__name__)


def run(state: ConjunctionState) -> ConjunctionState:
    """Rank validated maneuvers deterministically and build the explanation."""
    record = AgentRecord(agent=AgentName.EXPLANATION, status="STARTED", tool_called="rank_candidates")
    state.agent_log.append(record)

    ranked = tools.rank_candidates(state.validated) if state.validated else []
    state.validated = ranked

    reasons_bullets = "\n".join(f"• {r}" for r in state.reasons)

    if ranked:
        best = ranked[0]
        explanation = (
            f"Risk was classified as {state.risk_tier} (score {state.risk_score:.4f}). "
            f"Reasons:\n{reasons_bullets}\n\n"
            f"Maneuver {best.candidate_id} ({best.kind}) is recommended because it reduces the predicted "
            f"conjunction risk from {best.risk_before:.3f} to {best.risk_after:.3f} "
            f"while producing the lowest secondary-conjunction impact "
            f"({best.secondary_conflicts} conflicts) at a simulated delta-v of {best.delta_v_m_s:.2f} m/s."
        )
    else:
        explanation = (
            f"Risk was classified as {state.risk_tier} (score {state.risk_score:.4f}). "
            f"Reasons:\n{reasons_bullets}\n\n"
            + (
                "No candidate maneuver passed physics validation — no maneuver is recommended; "
                "continue monitoring."
                if state.candidates
                else "No maneuver analysis required at this risk level."
            )
        )

    state.explanation = explanation

    recommended = state.validated[0] if state.validated else None
    state.recommendation = {
        "recommended_candidate": recommended.candidate_id if recommended else None,
        "recommended_kind": recommended.kind if recommended else None,
        "risk_before": recommended.risk_before if recommended else state.risk_score,
        "risk_after": recommended.risk_after if recommended else state.risk_score,
        "delta_v_m_s": recommended.delta_v_m_s if recommended else 0.0,
        "why": f"Highest deterministic utility score ({recommended.rank_score:.4f}) after physics validation"
        if recommended
        else "None — no validated candidate",
        "physics_validation_status": "PASSED" if recommended else ("FAILED" if state.rejected else "NOT_REQUIRED"),
        "human_approval_required": state.human_approval_required,
        "approval_status": state.approval_status,
    }

    # Note: HUMAN_APPROVAL_REQUIRED is emitted authoritatively by the
    # orchestrator AFTER the workflow decides approval is needed, so the
    # timeline order is: recommendation ready -> approval required.
    state.log_event("RECOMMENDATION_READY", event_id=state.event_id)

    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = f"Recommendation: {state.recommendation['recommended_candidate'] or 'NONE'}"
    return state
