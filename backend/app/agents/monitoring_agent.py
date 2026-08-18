"""Monitoring agent — detects new conjunction events and stale data."""

import logging
import uuid
from datetime import datetime, timezone

from app.agents.state import AgentName, AgentRecord, ConjunctionState
from app.core.tle_parser import parse_tle

logger = logging.getLogger(__name__)

STALE_TLE_DAYS = 14.0


def _tle_age_days(line1: str, line2: str) -> float:
    try:
        sat = parse_tle(line1, line2)
        epoch = datetime(sat.epoch_year, 1, 1, tzinfo=timezone.utc)
        from datetime import timedelta
        epoch = epoch + timedelta(days=sat.epoch_day - 1)
        return (datetime.now(timezone.utc) - epoch).total_seconds() / 86400.0
    except Exception:
        return 0.0


def run(state: ConjunctionState) -> ConjunctionState:
    """Initialize an event, flag stale TLEs, and emit CONJUNCTION_DETECTED."""
    record = AgentRecord(agent=AgentName.MONITORING, status="STARTED", tool_called="detect_conjunction")
    state.agent_log.append(record)

    if not state.event_id:
        state.event_id = "CJ-" + uuid.uuid4().hex[:12].upper()
    if not state.workflow_id:
        state.workflow_id = "WF-" + uuid.uuid4().hex[:12].upper()

    messages = []
    age_a = _tle_age_days(state.line1_a, state.line2_a)
    age_b = _tle_age_days(state.line1_b, state.line2_b)
    if age_a > STALE_TLE_DAYS:
        messages.append(f"Object A TLE is {age_a:.1f} days old (stale)")
    if age_b > STALE_TLE_DAYS:
        messages.append(f"Object B TLE is {age_b:.1f} days old (stale)")

    state.log_event(
        "CONJUNCTION_DETECTED",
        event_id=state.event_id,
        satellite_a=state.satellite_a.get("name") or state.line1_a[2:7].strip(),
        satellite_b=state.satellite_b.get("name") or state.line1_b[2:7].strip(),
    )

    record.status = "COMPLETED"
    record.ended_at = datetime.now(timezone.utc).isoformat()
    record.message = "; ".join(messages) if messages else "Conjunction event registered; TLE data current"
    return state
