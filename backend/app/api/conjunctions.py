"""
Conjunction detection API routes.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.core.exceptions import OrbitalCalculationError, TLEValidationError
from app.schemas.conjunction import (
    CatalogDetectionRequest,
    ConjunctionDetectionRequest,
    ConjunctionDetectionResponse,
)
from app.services.conjunction_service import detect_pair, screen_catalog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conjunctions", tags=["Conjunction Detection"])


@router.post(
    "/detect",
    response_model=ConjunctionDetectionResponse,
    summary="Detect a conjunction between two objects",
    description=(
        "Runs fine SGP4 closest-approach detection for a single pair and returns the "
        "conjunction event with model features and physics diagnostics."
    ),
)
async def detect_conjunction(body: ConjunctionDetectionRequest) -> ConjunctionDetectionResponse:
    try:
        event = detect_pair(
            body.line1_a, body.line2_a, body.line1_b, body.line2_b,
            name_a=body.name_a, name_b=body.name_b,
            horizon_hours=body.horizon_hours,
        )
        events = [event] if event else []
        return ConjunctionDetectionResponse(
            events=events,
            count=len(events),
            screened_pairs=1,
            total_pairs=1,
            source="SGP4 FINE PROPAGATION",
        )
    except TLEValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except OrbitalCalculationError as e:
        raise HTTPException(status_code=422, detail=e.message)


@router.post(
    "/detect/catalog",
    response_model=ConjunctionDetectionResponse,
    summary="Screen a catalog for conjunctions",
    description=(
        "Broad-phase altitude filtering followed by fine SGP4 propagation. "
        "Avoids O(N²) propagation for mega-constellation scale."
    ),
)
async def detect_catalog(body: CatalogDetectionRequest) -> ConjunctionDetectionResponse:
    try:
        events, screened, total = screen_catalog(
            body.tles,
            horizon_hours=body.horizon_hours,
            miss_distance_threshold_m=body.miss_distance_threshold_m,
            max_pairs=body.max_pairs,
        )
        return ConjunctionDetectionResponse(
            events=events,
            count=len(events),
            screened_pairs=screened,
            total_pairs=total,
            source="BROAD-PHASE FILTER + SGP4 FINE PROPAGATION",
        )
    except TLEValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except OrbitalCalculationError as e:
        raise HTTPException(status_code=422, detail=e.message)
