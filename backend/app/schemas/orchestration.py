"""
Pydantic models for the orchestration API.
"""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class CatalogObject(BaseModel):
    """A third object used for secondary-conflict screening."""

    name: Optional[str] = Field(default=None)
    line1: str = Field(description="TLE line 1")
    line2: str = Field(description="TLE line 2")


class OrchestrationAnalyzeRequest(BaseModel):
    """Request body for POST /orchestration/analyze."""

    line1_a: str = Field(description="TLE line 1 for object A")
    line2_a: str = Field(description="TLE line 2 for object A")
    line1_b: str = Field(description="TLE line 1 for object B")
    line2_b: str = Field(description="TLE line 2 for object B")
    name_a: Optional[str] = Field(default=None)
    name_b: Optional[str] = Field(default=None)
    horizon_hours: float = Field(default=24.0, ge=1.0, le=168.0)
    catalog: Optional[List[CatalogObject]] = Field(
        default=None,
        description="Other catalog objects screened for secondary conflicts",
    )


class HumanDecisionRequest(BaseModel):
    """Request body for POST /orchestration/{event_id}/approve|reject."""

    approve: bool = Field(description="True = approve, False = reject")
    note: Optional[str] = Field(default=None, max_length=500)


class ManeuverView(BaseModel):
    candidate_id: str
    kind: str
    status: str
    delta_v_m_s: float
    sma_delta_km: float
    risk_before: float
    risk_after: float
    miss_before_m: float
    miss_after_m: float
    tca_change_min: float
    secondary_conflicts: int
    constraint_violations: List[str]
    rank_score: float
    note: str


class OrchestrationResponse(BaseModel):
    """Full orchestration result."""

    workflow_id: str
    event_id: str
    status: str = Field(description="PENDING | RUNNING | COMPLETED | FAILED | REQUIRES_HUMAN | REJECTED")
    satellite_a: Dict = Field(default_factory=dict)
    satellite_b: Dict = Field(default_factory=dict)
    tca: Optional[str] = None
    miss_distance_m: Optional[float] = None
    relative_velocity_kms: Optional[float] = None
    risk_score: Optional[float] = None
    risk_tier: Optional[str] = None
    confidence: Optional[float] = None
    reasons: List[str] = Field(default_factory=list)
    ml_prediction: Dict = Field(
        default_factory=dict,
        description="ML model outputs: predicted miss distance, collision probability, model version, mock flag",
    )
    candidates: List[ManeuverView] = Field(default_factory=list)
    validated: List[ManeuverView] = Field(default_factory=list)
    rejected: List[ManeuverView] = Field(default_factory=list)
    secondary_conflicts: List[str] = Field(default_factory=list)
    recommendation: Dict = Field(default_factory=dict)
    explanation: str = Field(default="")
    agent_log: List[Dict] = Field(default_factory=list)
    timeline: List[Dict] = Field(default_factory=list)
    human_approval_required: bool = Field(default=False)
    approval_status: str = Field(default="NONE")
    model_metadata: Dict = Field(default_factory=dict)
    fallback_used: bool = Field(default=False)


class OrchestrationTimelineResponse(BaseModel):
    workflow_id: str
    event_id: str
    status: str
    timeline: List[Dict] = Field(default_factory=list)
