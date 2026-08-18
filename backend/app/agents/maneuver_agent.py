"""Maneuver agent — generates candidate maneuvers (never declares them safe)."""

import logging
from datetime import datetime, timezone

from app.agents import tools
from app.agents.state import AgentName, AgentRecord, ConjunctionState

logger = logging.getLogger(__name__)


def run(state: ConjunctionState) -> ConjunctionState:
    """Generate candidate maneuvers for HIGH/CRITICAL events only."""
    record = AgentRecord(agent=AgentName.MANEUVER, status="STARTED", tool_called="generate_maneuver_candidates")
    state.agent_log.append(record)

    if state.risk_tier not in ("HIGH", "CRITICAL"):
        record.status = "SKIPPED"
        record.ended_at = datetime.now(timezone.utc).isoformat()
        record.message = f"No maneuver generation for tier {state.risk_tier}"
        return state

    state.candidates = tools.generate_maneuver_candidates(state)
    state.log_event(
        "MANEUVER_GENERATED",
        event_id=state.event_id,
        count=len(state.candidates),
        candidates=[c.candidate_id for c in state.candidates],
    )

    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = f"Generated {len(state.candidates)} candidate maneuver(s) for physics validation"
    return state
