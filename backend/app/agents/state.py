"""
Strongly typed agent workflow state.

All agent outputs flow through ``ConjunctionState``. Arbitrary LLM text is
never stored as authoritative state — only structured fields, and every
structured field is produced by a deterministic tool or the ML service.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkflowStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REQUIRES_HUMAN = "REQUIRES_HUMAN"
    REJECTED = "REJECTED"


class AgentName(str, Enum):
    MONITORING = "MONITORING"
    RISK = "RISK"
    ANALYSIS = "ANALYSIS"
    MANEUVER = "MANEUVER"
    VALIDATION = "VALIDATION"
    EXPLANATION = "EXPLANATION"
    ORCHESTRATOR = "ORCHESTRATOR"


class AgentRecord(BaseModel):
    """One agent execution entry in the workflow log."""

    agent: AgentName
    status: str = Field(description="STARTED | COMPLETED | FAILED | RETRYING | SKIPPED")
    started_at: str = Field(default_factory=_utcnow)
    ended_at: Optional[str] = None
    tool_called: Optional[str] = None
    message: str = Field(default="")
    retries: int = Field(default=0)


class ManeuverCandidate(BaseModel):
    """A candidate avoidance maneuver with physics validation results."""

    candidate_id: str = Field(description="M1, M2, ...")
    kind: str = Field(description="NO_ACTION | ALTITUDE_UP | ALTITUDE_DOWN | PHASE_SHIFT")
    delta_v_m_s: float = Field(default=0.0, description="Estimated delta-v (simulation)")
    sma_delta_km: float = Field(default=0.0, description="Semi-major axis change (simulation)")
    status: str = Field(default="PENDING", description="PENDING | VALID | REJECTED")
    risk_before: float = Field(default=0.0)
    risk_after: float = Field(default=0.0)
    miss_before_m: float = Field(default=0.0)
    miss_after_m: float = Field(default=0.0)
    tca_change_min: float = Field(default=0.0)
    secondary_conflicts: int = Field(default=0)
    constraint_violations: List[str] = Field(default_factory=list)
    rank_score: float = Field(default=0.0)
    note: str = Field(default="", description="Structured validation note (not free-form LLM text)")


class ConjunctionState(BaseModel):
    """Authoritative state for one orchestration workflow."""

    workflow_id: str = Field(default="")
    event_id: str = Field(default="")

    satellite_a: Dict[str, str] = Field(default_factory=dict)
    satellite_b: Dict[str, str] = Field(default_factory=dict)
    line1_a: str = Field(default="")
    line2_a: str = Field(default="")
    line1_b: str = Field(default="")
    line2_b: str = Field(default="")

    tca: Optional[str] = None
    miss_distance_m: Optional[float] = None
    relative_velocity_kms: Optional[float] = None
    horizon_hours: float = Field(default=24.0)
    tca_horizon_hours: Optional[float] = None

    features: List[float] = Field(default_factory=list)
    diagnostics: Dict[str, float] = Field(default_factory=dict)

    ml_prediction: Dict = Field(default_factory=dict)
    physics_result: Dict = Field(default_factory=dict)

    risk_score: Optional[float] = None
    risk_tier: Optional[str] = None
    confidence: Optional[float] = None
    reasons: List[str] = Field(default_factory=list)

    candidates: List[ManeuverCandidate] = Field(default_factory=list)
    validated: List[ManeuverCandidate] = Field(default_factory=list)
    rejected: List[ManeuverCandidate] = Field(default_factory=list)
    secondary_conflicts: List[str] = Field(default_factory=list)

    current_agent: Optional[AgentName] = None
    workflow_status: WorkflowStatus = Field(default=WorkflowStatus.PENDING)
    retry_count: int = Field(default=0)
    max_iterations: int = Field(default=8)
    agent_log: List[AgentRecord] = Field(default_factory=list)
    timeline: List[Dict] = Field(default_factory=list)

    explanation: str = Field(default="")
    recommendation: Dict = Field(default_factory=dict)

    human_approval_required: bool = Field(default=False)
    approval_status: str = Field(default="NONE", description="NONE | APPROVED | REJECTED")
    approval_note: Optional[str] = None

    catalog: List[Dict] = Field(default_factory=list, description="Other objects for secondary-conflict checks")

    created_at: str = Field(default_factory=_utcnow)
    updated_at: str = Field(default_factory=_utcnow)

    def log_event(self, event: str, **data) -> None:
        """Append a timeline entry (used by the /timeline endpoint and WebSocket)."""
        self.timeline.append({"t": _utcnow(), "event": event, **data})

    def touch(self) -> None:
        self.updated_at = _utcnow()
