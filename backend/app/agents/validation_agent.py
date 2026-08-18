"""Validation agent — the safety gate.

Every candidate goes through orbit re-propagation, new closest-approach
computation, ML re-scoring and secondary-conflict checks. A maneuver that
reduces one risk but creates another is rejected.
"""

import logging
from datetime import datetime, timezone

from app.agents import tools
from app.agents.state import AgentName, AgentRecord, ConjunctionState

logger = logging.getLogger(__name__)


def run(state: ConjunctionState) -> ConjunctionState:
    """Simulate and validate every pending candidate through the physics layer."""
    record = AgentRecord(agent=AgentName.VALIDATION, status="STARTED", tool_called="simulate_maneuver")
    state.agent_log.append(record)

    state.validated = []
    state.rejected = []

    for candidate in state.candidates:
        validated = tools.simulate_maneuver(state, candidate)
        if validated.status == "VALID":
            state.validated.append(validated)
            state.log_event(
                "MANEUVER_VALIDATED",
                event_id=state.event_id,
                candidate=validated.candidate_id,
                risk_after=validated.risk_after,
            )
        else:
            state.rejected.append(validated)
            state.log_event(
                "MANEUVER_REJECTED",
                event_id=state.event_id,
                candidate=validated.candidate_id,
                reason=validated.note,
            )

    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = (
        f"{len(state.validated)} validated, {len(state.rejected)} rejected "
        f"({', '.join(c.candidate_id for c in state.rejected) or 'none'})"
    )
    return state
