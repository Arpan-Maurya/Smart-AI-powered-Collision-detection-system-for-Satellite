"""
Orchestration run persistence.

Tries Supabase first (``orchestration_runs`` table) and falls back to a
thread-safe in-memory store when the table or connection is unavailable.
This keeps local demos and tests fully functional without database setup,
while still persisting when Supabase is configured.
"""

import logging
import threading
from typing import Dict, List, Optional

from app.agents.state import ConjunctionState

logger = logging.getLogger(__name__)

TABLE = "orchestration_runs"

_mem: Dict[str, dict] = {}
_lock = threading.Lock()


def _to_dict(state: ConjunctionState) -> dict:
    return state.model_dump(mode="json")


def upsert_run(state: ConjunctionState) -> dict:
    """Persist a workflow run. Supabase-first, in-memory fallback."""
    payload = _to_dict(state)

    # Try Supabase (best-effort — table may not exist in a fresh project)
    try:
        from app.db.client import get_supabase_client
        client = get_supabase_client()
        client.table(TABLE).upsert(
            {
                "workflow_id": state.workflow_id,
                "event_id": state.event_id,
                "status": state.workflow_status.value,
                "risk_tier": state.risk_tier,
                "payload": payload,
            },
            on_conflict="workflow_id",
        ).execute()
        return payload
    except Exception as e:
        logger.debug("Supabase orchestration persistence unavailable (%s) — using in-memory", e)

    with _lock:
        _mem[state.workflow_id] = payload
    return payload


def get_run(workflow_id: str) -> Optional[dict]:
    """Fetch a run by workflow id (in-memory first, then Supabase)."""
    with _lock:
        if workflow_id in _mem:
            return _mem[workflow_id]
    try:
        from app.db.client import get_supabase_client
        client = get_supabase_client()
        result = client.table(TABLE).select("payload").eq("workflow_id", workflow_id).limit(1).execute()
        if result.data and result.data[0].get("payload"):
            return result.data[0]["payload"]
    except Exception:
        pass
    return None


def list_runs_for_event(event_id: str, limit: int = 10) -> List[dict]:
    """Return recent runs for an event (history for the analysis agent)."""
    with _lock:
        runs = [r for r in _mem.values() if r.get("event_id") == event_id][-limit:]
    if runs:
        return runs
    try:
        from app.db.client import get_supabase_client
        client = get_supabase_client()
        result = client.table(TABLE).select("payload").eq("event_id", event_id).limit(limit).execute()
        return [r["payload"] for r in result.data if r.get("payload")]
    except Exception:
        return []


def record_decision(workflow_id: str, approve: bool, note: Optional[str] = None) -> Optional[dict]:
    """Persist a human decision on a workflow run."""
    run = get_run(workflow_id)
    if not run:
        return None
    run["approval_status"] = "APPROVED" if approve else "REJECTED"
    run["approval_note"] = note
    run["workflow_status"] = "COMPLETED" if approve else "REJECTED"

    try:
        from app.db.client import get_supabase_client
        client = get_supabase_client()
        client.table(TABLE).update(
            {
                "status": run["workflow_status"],
                "approval_status": run["approval_status"],
                "payload": run,
            }
        ).eq("workflow_id", workflow_id).execute()
    except Exception as e:
        logger.debug("Supabase decision persistence unavailable (%s) — in-memory only", e)

    with _lock:
        _mem[workflow_id] = run
    return run
