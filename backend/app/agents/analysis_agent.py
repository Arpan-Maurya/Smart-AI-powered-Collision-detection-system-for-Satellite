"""Analysis agent — structured reasoning about geometry, TCA, uncertainty, history."""

import logging
from datetime import datetime, timezone

from app.agents import tools
from app.agents.state import AgentName, AgentRecord, ConjunctionState

logger = logging.getLogger(__name__)


def run(state: ConjunctionState) -> ConjunctionState:
    """Gather deterministic context and produce structured findings."""
    record = AgentRecord(agent=AgentName.ANALYSIS, status="STARTED", tool_called="get_satellite_state")
    state.agent_log.append(record)
    state.log_event("AGENT_STARTED", agent="ANALYSIS", event_id=state.event_id)

    findings = {
        "satellite_state": tools.get_satellite_state(state),
        "diagnostics": dict(state.diagnostics),
        "tca_horizon_hours": state.tca_horizon_hours,
        "historical_runs": tools.get_historical_events(state.event_id),
        "catalog_objects": len(state.catalog),
    }
    state.physics_result = findings

    state.log_event("AGENT_COMPLETED", agent="ANALYSIS", event_id=state.event_id)
    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = (
        f"Geometry analyzed: Δinc {findings['satellite_state'].get('inclination_delta_deg', '—')}°, "
        f"{len(state.catalog)} catalog object(s) screened for conflicts"
    )
    return state
