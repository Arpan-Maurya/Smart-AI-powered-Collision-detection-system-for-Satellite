"""
Pydantic models for conjunction detection.
"""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class ConjunctionEvent(BaseModel):
    """A detected close approach between two objects."""

    event_id: str = Field(description="Stable event identifier")
    sat1_norad_id: str = Field(description="NORAD ID of object A")
    sat2_norad_id: str = Field(description="NORAD ID of object B")
    sat1_name: Optional[str] = Field(default=None, description="Name of object A")
    sat2_name: Optional[str] = Field(default=None, description="Name of object B")
    tca: str = Field(description="Time of closest approach (ISO 8601)")
    miss_distance_m: float = Field(description="Minimum separation in meters")
    relative_velocity_kms: float = Field(description="Relative velocity at TCA (km/s)")
    horizon_hours: float = Field(description="Search horizon used (hours)")
    features: List[float] = Field(description="8 model features in canonical order")
    feature_names: List[str] = Field(description="Feature names (canonical order)")
    diagnostics: Dict[str, float] = Field(
        default_factory=dict,
        description="Non-model physics/diagnostic features (relative velocity, TCA horizon, altitude overlap, etc.)",
    )
    risk_score: Optional[float] = Field(default=None, description="Filled in by the ML risk assessment step")
    risk_tier: Optional[str] = Field(default=None, description="Filled in by the ML risk assessment step")
    model_version: Optional[str] = Field(default=None, description="Model that produced the risk output")


class ConjunctionDetectionRequest(BaseModel):
    """Request body for POST /conjunctions/detect."""

    line1_a: str = Field(description="TLE line 1 for object A")
    line2_a: str = Field(description="TLE line 2 for object A")
    line1_b: str = Field(description="TLE line 1 for object B")
    line2_b: str = Field(description="TLE line 2 for object B")
    name_a: Optional[str] = Field(default=None, description="Name for object A")
    name_b: Optional[str] = Field(default=None, description="Name for object B")
    horizon_hours: float = Field(default=24.0, ge=1.0, le=168.0, description="Forward search window")
    miss_distance_threshold_m: float = Field(
        default=50_000.0,
        ge=100.0,
        le=1_000_000.0,
        description="Only report close approaches below this miss distance",
    )


class CatalogDetectionRequest(BaseModel):
    """Request body for POST /conjunctions/detect/catalog (multi-object screening)."""

    tles: List[dict] = Field(description="List of {name?, line1, line2} TLE sets")
    horizon_hours: float = Field(default=24.0, ge=1.0, le=168.0)
    miss_distance_threshold_m: float = Field(default=50_000.0, ge=100.0, le=1_000_000.0)
    max_pairs: int = Field(default=200, ge=1, le=2000, description="Cap on reported events")


class ConjunctionDetectionResponse(BaseModel):
    """Response for conjunction detection."""

    events: List[ConjunctionEvent] = Field(description="Detected conjunction events")
    count: int = Field(description="Number of events")
    screened_pairs: int = Field(description="Candidate pairs after broad-phase filtering")
    total_pairs: int = Field(description="Total possible pairs in catalog")
    source: str = Field(description="Data source label")
