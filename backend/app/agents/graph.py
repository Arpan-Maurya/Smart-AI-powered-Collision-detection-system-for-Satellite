"""
Workflow graph — conditional routing between agents.

Linear safety pipeline with one conditional branch:

  DETECT → ASSESS → (LOW/MEDIUM: → EXPLAIN → END)
                   (HIGH/CRITICAL: → ANALYZE → MANEUVER → VALIDATE → EXPLAIN → END)
"""

from typing import List

from app.agents.state import AgentName, ConjunctionState

# Full ordered pipeline
ALL_STEPS: List[AgentName] = [
    AgentName.MONITORING,
    AgentName.RISK,
    AgentName.ANALYSIS,
    AgentName.MANEUVER,
    AgentName.VALIDATION,
    AgentName.EXPLANATION,
]


def next_steps(state: ConjunctionState) -> List[AgentName]:
    """Return the remaining steps for this state (conditional routing)."""
    steps = list(ALL_STEPS)

    if state.risk_tier not in ("HIGH", "CRITICAL"):
        # LOW / MEDIUM: skip maneuver generation and validation
        steps = [s for s in steps if s not in (AgentName.MANEUVER, AgentName.VALIDATION)]

    # Drop steps already executed (an agent is 'done' when it has a COMPLETED/SKIPPED record)
    done = {r.agent for r in state.agent_log if r.status in ("COMPLETED", "SKIPPED")}
    return [s for s in steps if s not in done]


def has_analysis(steps_taken: List[AgentName]) -> bool:
    return AgentName.ANALYSIS in steps_taken
