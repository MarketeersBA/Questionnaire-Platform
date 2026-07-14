"""Analyst-facing routes for product test trial media review and streaming."""

from typing import Annotated, Any, Dict, List

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.database import db
from backend.models import ProductTestMediaAsset, User
from backend.routers.auth import get_current_active_analyst
from backend.services.product_test_media_asset_service import (
    ProductTestMediaAssetError,
    get_trial_media_asset_for_survey,
    list_trial_media_assets_for_survey,
    media_error_to_http,
    stream_trial_media_asset_for_survey,
)
from backend.trial_media_capture.constants import MEDIA_ASSETS_COLLECTION

router = APIRouter(prefix="/surveys", tags=["product-test-media"])


async def _get_survey_or_404(survey_id: str) -> dict:
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.get("/{survey_id}/product-test/media")
async def list_product_test_trial_media(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
) -> Dict[str, Any]:
    """List trial media assets registered for a survey (analyst review index)."""
    del current_user
    await _get_survey_or_404(survey_id)
    assets = await list_trial_media_assets_for_survey(survey_id)
    return {
        "survey_id": survey_id,
        "count": len(assets),
        "assets": assets,
    }


@router.get(
    "/{survey_id}/product-test/media/{asset_id}",
    response_model=ProductTestMediaAsset,
)
async def get_product_test_trial_media_meta(
    survey_id: str,
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Return registry metadata for one trial media asset."""
    del current_user
    await _get_survey_or_404(survey_id)
    try:
        return await get_trial_media_asset_for_survey(survey_id, asset_id)
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc


@router.get("/{survey_id}/product-test/media/{asset_id}/stream")
async def stream_product_test_trial_media_analyst(
    survey_id: str,
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Stream trial media bytes for authenticated analyst review."""
    del current_user
    await _get_survey_or_404(survey_id)
    try:
        grid_out, mime, headers = await stream_trial_media_asset_for_survey(survey_id, asset_id)
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc

    return StreamingResponse(grid_out, media_type=mime, headers=headers)


@router.get("/{survey_id}/product-test/media/{asset_id}/download")
async def download_product_test_trial_media_analyst(
    survey_id: str,
    asset_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Download trial media with attachment disposition for analyst exports."""
    del current_user
    await _get_survey_or_404(survey_id)
    try:
        grid_out, mime, headers = await stream_trial_media_asset_for_survey(survey_id, asset_id)
        filename = headers.get("Content-Disposition", "").split("filename=")[-1].strip('"')
        if not filename:
            filename = f"trial_media_{asset_id}"
        headers = {
            **headers,
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc

    return StreamingResponse(grid_out, media_type=mime, headers=headers)
