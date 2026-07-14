"""Analyst-facing routes for packaging heatmap image management and analytics."""

from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.database import db
from backend.models import PackagingImageAsset, User
from backend.routers.auth import get_current_active_analyst
from backend.services.packaging_heatmap_analytics_service import (
    get_survey_heatmap_summary,
    rebuild_aggregates,
)
from backend.services.packaging_heatmap_asset_service import (
    PackagingHeatmapAssetError,
    get_packaging_image_from_config,
    packaging_error_to_http,
    remove_packaging_image_for_survey,
    save_packaging_image,
    stream_packaging_image,
    validate_packaging_image_side,
    save_voice_note,
)

router = APIRouter(prefix="/surveys", tags=["packaging-heatmap"])


async def _get_survey_or_404(survey_id: str) -> dict:
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.post(
    "/{survey_id}/packaging-heatmap/images/{side}",
    response_model=PackagingImageAsset,
)
async def upload_packaging_heatmap_image(
    survey_id: str,
    side: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
    file: UploadFile = File(...),
):
    """Upload or replace a packaging photo (front/back) for a draft product test survey."""
    del current_user  # auth gate only
    try:
        validate_packaging_image_side(side)
        return await save_packaging_image(survey_id, side, file)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc


@router.delete("/{survey_id}/packaging-heatmap/images/{side}")
async def delete_packaging_heatmap_image(
    survey_id: str,
    side: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Remove a packaging photo and clear it from product_test_config."""
    del current_user
    try:
        validate_packaging_image_side(side)
        await remove_packaging_image_for_survey(survey_id, side)
        return {"message": "Packaging image removed.", "side": side.strip().lower()}
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc


@router.get(
    "/{survey_id}/packaging-heatmap/images/{side}",
    response_model=PackagingImageAsset,
)
async def get_packaging_heatmap_image_meta(
    survey_id: str,
    side: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Return stored asset metadata for a survey side (analyst preview)."""
    del current_user
    from backend.services.packaging_heatmap_asset_service import get_packaging_image_from_config

    survey = await _get_survey_or_404(survey_id)
    asset = get_packaging_image_from_config(survey.get("product_test_config"), side)
    if not asset:
        raise HTTPException(status_code=404, detail=f"No packaging image for side '{side}'")
    return asset


@router.get("/{survey_id}/packaging-heatmap/images/{side}/stream")
async def stream_packaging_heatmap_image_analyst(
    survey_id: str,
    side: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Stream packaging image bytes for analyst viewers (Responses page)."""
    del current_user
    try:
        validate_packaging_image_side(side)
        survey = await _get_survey_or_404(survey_id)
        asset = get_packaging_image_from_config(survey.get("product_test_config"), side)
        if not asset:
            raise HTTPException(status_code=404, detail=f"No packaging image for side '{side}'")
        grid_out, mime, headers = await stream_packaging_image(asset.asset_id)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc

    return StreamingResponse(grid_out, media_type=mime, headers=headers)


@router.get("/{survey_id}/packaging-heatmap/summary")
async def get_packaging_heatmap_summary(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Aggregated click-density grids per question (intent × side)."""
    del current_user
    try:
        return await get_survey_heatmap_summary(survey_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{survey_id}/packaging-heatmap/rebuild")
async def rebuild_packaging_heatmap_aggregates(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Full recompute of heatmap aggregates from stored responses (repair)."""
    del current_user
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
    survey = await _get_survey_or_404(survey_id)
    del survey
    return await rebuild_aggregates(survey_id)

@router.post("/{survey_id}/packaging-heatmap/voice-notes")
async def upload_heatmap_voice_note(
    survey_id: str,
    file: UploadFile = File(...),
):
    """Upload a voice note for a packaging heatmap region. Accessible by respondents."""
    try:
        return await save_voice_note(survey_id, file)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc

@router.get("/{survey_id}/packaging-heatmap/voice-notes/{asset_id}")
async def stream_heatmap_voice_note(
    survey_id: str,
    asset_id: str,
):
    """Stream a voice note audio file."""
    try:
        # Re-use stream logic since it just fetches from GridFS by asset_id
        grid_out, mime, headers = await stream_packaging_image(asset_id)
        return StreamingResponse(grid_out, media_type=mime, headers=headers)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc
