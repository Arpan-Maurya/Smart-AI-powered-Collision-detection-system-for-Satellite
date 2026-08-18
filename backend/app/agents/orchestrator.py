"""
Central orchestrator.

Controls DETECT → ASSESS → ANALYZE → MANEUVER → VALIDATE → EXPLAIN with:

- conditional routing (graph.next_steps)
- per-agent retries
- repeated-agent / iteration loop detection
- a circuit breaker
- a wall-clock timeout
- deterministic fallback on repeated agent failure (never silently succeeds)
- WebSocket notifications (best-effort)
- persistence of workflow state
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.agents import graph
from app.agents.state import AgentName, ConjunctionState, WorkflowStatus
from app.agents import (
    monitoring_agent,
    risk_agent,
    analysis_agent,
    maneuver_agent,
    validation_agent,
    explanation_agent,
)
from app.agents import tools

logger = logging.getLogger(__name__)

AGENT_IMPL = {
    AgentName.MONITORING: monitoring_agent.run,
    AgentName.RISK: risk_agent.run,
    AgentName.ANALYSIS: analysis_agent.run,
    AgentName.MANEUVER: maneuver_agent.run,
    AgentName.VALIDATION: validation_agent.run,
    AgentName.EXPLANATION: explanation_agent.run,
}

MAX_RETRIES_PER_AGENT = 2
MAX_AGENT_STARTS = 3
CIRCUIT_BREAKER_LIMIT = 2
WORKFLOW_TIMEOUT_SECONDS = 90.0


def _notify(event_type: str, data: dict) -> None:
    """Best-effort WebSocket notification — never raises into the workflow."""
    try:
        from app.api.websocket import broadcast_orchestration_event
        import asyncio

        # If called from a sync context, fire-and-forget into the running loop
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(broadcast_orchestration_event(event_type, data))
        except RuntimeError:
            pass
    except Exception:
        pass


def _fallback_assessment(state: ConjunctionState, reason: str) -> ConjunctionState:
    """
    Deterministic fallback: compute the risk directly through the physics+ML
    path without the agent layer, and record the failure honestly.
    """
    try:
        from app.ml.explainability import build_reasons
        from app.ml.model_manager import model_manager

        features = tools.calculate_features(state)
        if features:
            state.features = features
            from app.config import get_settings
            settings = get_settings()
            prediction = tools.predict_collision_risk(features, {
                "msd_threshold": settings.risk_msd_threshold,
                "critical": settings.risk_critical,
                "high": settings.risk_high,
                "medium": settings.risk_medium,
            })
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
                relative_velocity_kms=state.relative_velocity_kms or 0.0,
                feature_importances=model_manager.feature_importances(),
                is_mock=model_manager.is_mock,
            )
    except Exception as e:
        logger.exception("Fallback assessment failed: %s", e)

    state.recommendation = {
        **state.recommendation,
        "fallback_used": True,
        "fallback_reason": reason,
    }
    return state


def run_workflow(state: ConjunctionState, catalog: Optional[List[dict]] = None) -> ConjunctionState:
    """Execute the agentic workflow with all safety controls."""
    if catalog:
        state.catalog = catalog

    state.workflow_status = WorkflowStatus.RUNNING
    state.log_event("WORKFLOW_STARTED", event_id=state.event_id, workflow_id=state.workflow_id)

    deadline = time.monotonic() + WORKFLOW_TIMEOUT_SECONDS
    agent_start_counts: Dict[str, int] = {}
    breaker_hits = 0
    iterations = 0

    while state.workflow_status == WorkflowStatus.RUNNING:
        steps = graph.next_steps(state)
        if not steps:
            break
        if iterations >= state.max_iterations:
            state.workflow_status = WorkflowStatus.FAILED
            state.recommendation["failure"] = "max_iterations_exceeded"
            state.log_event("WORKFLOW_FAILED", reason="max_iterations_exceeded")
            break

        agent = steps[0]
        iterations += 1
        agent_start_counts[agent.value] = agent_start_counts.get(agent.value, 0) + 1

        # Loop protection: repeated-agent detection
        if agent_start_counts[agent.value] > MAX_AGENT_STARTS:
            state.workflow_status = WorkflowStatus.FAILED
            state.recommendation["failure"] = f"repeated_agent_{agent.value}"
            state.log_event("WORKFLOW_FAILED", reason=f"repeated agent {agent.value}")
            _notify("WORKFLOW_FAILED", {"event_id": state.event_id, "reason": f"repeated agent {agent.value}"})
            break

        # Wall-clock timeout
        if time.monotonic() > deadline:
            state.workflow_status = WorkflowStatus.FAILED
            state.recommendation["failure"] = "timeout"
            state.log_event("WORKFLOW_FAILED", reason="timeout")
            _notify("WORKFLOW_FAILED", {"event_id": state.event_id, "reason": "timeout"})
            break

        state.current_agent = agent
        _notify("AGENT_STARTED", {"event_id": state.event_id, "agent": agent.value})

        success = False
        for attempt in range(MAX_RETRIES_PER_AGENT + 1):
            try:
                impl = AGENT_IMPL[agent]
                state = impl(state)
                success = True
                break
            except Exception as e:
                logger.warning("Agent %s attempt %d failed: %s", agent.value, attempt + 1, e)
                state.retry_count += 1
                if attempt < MAX_RETRIES_PER_AGENT:
                    state.log_event("AGENT_RETRY", agent=agent.value, error=str(e))
                    _notify("AGENT_RETRY", {"event_id": state.event_id, "agent": agent.value, "error": str(e)})
                # mark the last agent record as failed for observability
                for rec in reversed(state.agent_log):
                    if rec.agent == agent and rec.status == "STARTED":
                        rec.status = "FAILED"
                        rec.message = str(e)[:200]
                        break

        if not success:
            breaker_hits += 1
            state.log_event("WORKFLOW_FAILED", reason=f"agent_{agent.value}_failed")
            _notify("WORKFLOW_FAILED", {"event_id": state.event_id, "agent": agent.value})

            if breaker_hits >= CIRCUIT_BREAKER_LIMIT:
                state.workflow_status = WorkflowStatus.FAILED
                state.recommendation["failure"] = "circuit_breaker"
                state = _fallback_assessment(state, "circuit breaker tripped after repeated agent failures")
                state.log_event("WORKFLOW_FAILED", reason="circuit_breaker")
                break

            # Fallback deterministic workflow, then stop — never silently succeed
            state.workflow_status = WorkflowStatus.FAILED
            state = _fallback_assessment(state, f"agent {agent.value} failed after retries")
            state.log_event("WORKFLOW_FAILED", reason=f"agent_{agent.value}_failed")
            break

        _notify("AGENT_COMPLETED", {"event_id": state.event_id, "agent": agent.value})

    if state.workflow_status == WorkflowStatus.RUNNING:
        # Decision: CRITICAL always requires human approval; HIGH requires it
        # when a maneuver is recommended. LOW/MEDIUM finish automatically.
        if state.risk_tier == "CRITICAL":
            state.human_approval_required = True
            state.workflow_status = WorkflowStatus.REQUIRES_HUMAN
        elif state.risk_tier == "HIGH" and state.recommendation.get("recommended_candidate"):
            state.human_approval_required = True
            state.workflow_status = WorkflowStatus.REQUIRES_HUMAN
        else:
            state.workflow_status = WorkflowStatus.COMPLETED

        if state.human_approval_required:
            state.log_event(
                "HUMAN_APPROVAL_REQUIRED",
                event_id=state.event_id,
                candidate=state.recommendation.get("recommended_candidate"),
            )
            _notify("HUMAN_APPROVAL_REQUIRED", {
                "event_id": state.event_id,
                "candidate": state.recommendation.get("recommended_candidate"),
            })

    state.log_event("WORKFLOW_" + state.workflow_status.value, event_id=state.event_id)
    state.touch()

    try:
        tools.persist_workflow_state(state)
    except Exception as e:
        logger.warning("Failed to persist workflow state: %s", e)

    return state
