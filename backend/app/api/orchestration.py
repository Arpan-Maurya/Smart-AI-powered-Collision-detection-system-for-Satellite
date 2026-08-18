"""
Orchestration API routes — human-in-the-loop agentic workflow.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.core.exceptions import OrbitalCalculationError, TLEValidationError
from app.schemas.orchestration import (
    HumanDecisionRequest,
    OrchestrationAnalyzeRequest,
    OrchestrationResponse,
    OrchestrationTimelineResponse,
)
from app.services import orchestration_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/orchestration", tags=["Orchestration"])


@router.post(
    "/analyze",
    response_model=OrchestrationResponse,
    summary="Run the full agentic orchestration workflow",
    description=(
        "DETECT → ASSESS → ANALYZE → MANEUVER → VALIDATE → RANK → EXPLAIN. "
        "High/critical events produce recommended maneuvers; nothing is ever "
        "auto-executed — human approval is required and persisted."
    ),
)
async def analyze(body: OrchestrationAnalyzeRequest) -> OrchestrationResponse:
    try:
        return OrchestrationResponse(**orchestration_service.analyze(
            line1_a=body.line1_a,
            line2_a=body.line2_a,
            line1_b=body.line1_b,
            line2_b=body.line2_b,
            name_a=body.name_a,
            name_b=body.name_b,
            horizon_hours=body.horizon_hours,
            catalog=body.catalog,
        ))
    except TLEValidationError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except OrbitalCalculationError as e:
        raise HTTPException(status_code=422, detail=e.message)


@router.get(
    "/{workflow_id}",
    response_model=OrchestrationResponse,
    summary="Get an orchestration run",
    description="Returns the full workflow state for a workflow id.",
)
async def get_run(workflow_id: str) -> OrchestrationResponse:
    run = orchestration_service.get_run(workflow_id)
    if not run:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return OrchestrationResponse(**run)


@router.get(
    "/{workflow_id}/timeline",
    response_model=OrchestrationTimelineResponse,
    summary="Get the orchestration timeline",
    description="Structured timeline of workflow events — ideal for the demo UI.",
)
async def get_timeline(workflow_id: str) -> OrchestrationTimelineResponse:
    timeline = orchestration_service.get_timeline(workflow_id)
    if not timeline:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return OrchestrationTimelineResponse(**timeline)


@router.get(
    "/{workflow_id}/maneuvers",
    response_model=dict,
    summary="Get maneuver comparison",
    description="Candidate / validated / rejected maneuvers for a run.",
)
async def get_maneuvers(workflow_id: str) -> dict:
    maneuvers = orchestration_service.get_maneuvers(workflow_id)
    if not maneuvers:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return maneuvers


@router.post(
    "/{workflow_id}/approve",
    response_model=OrchestrationResponse,
    summary="Approve the recommended maneuver (human-in-the-loop)",
    description="Records the operator approval. The decision is persisted; no maneuver is ever auto-executed.",
)
async def approve(workflow_id: str, body: HumanDecisionRequest) -> OrchestrationResponse:
    run = orchestration_service.decide(workflow_id, approve=True, note=body.note)
    if not run:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return OrchestrationResponse(**run)


@router.post(
    "/{workflow_id}/reject",
    response_model=OrchestrationResponse,
    summary="Reject the recommendation (human-in-the-loop)",
    description="Records the operator rejection. The decision is persisted.",
)
async def reject(workflow_id: str, body: HumanDecisionRequest) -> OrchestrationResponse:
    run = orchestration_service.decide(workflow_id, approve=False, note=body.note)
    if not run:
        raise HTTPException(status_code=404, detail=f"Workflow {workflow_id} not found")
    return OrchestrationResponse(**run)
