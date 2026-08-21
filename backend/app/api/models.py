"""
ML model status API route.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from app.ml.model_manager import model_manager

logger = None
router = APIRouter(prefix="/models", tags=["ML Models"])


from typing import Optional

class ModelsStatusResponse(BaseModel):
    model_version: str
    is_mock: bool
    model_source: str
    model_type: str
    feature_count: int
    loaded: bool
    status: str
    regressor: Optional[str] = None
    classifier: Optional[str] = None


@router.get(
    "/status",
    response_model=ModelsStatusResponse,
    summary="ML model status",
    description="Reports which model version is loaded and whether the REAL or MOCK model produced results.",
)
async def models_status() -> ModelsStatusResponse:
    meta = model_manager.get_metadata()
    return ModelsStatusResponse(**meta)
