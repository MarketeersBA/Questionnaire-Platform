"""
Packaging heatmap asset service — GridFS storage for product package images.

Handles validation, dimension extraction, survey config persistence, and streaming.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from backend.config import settings
from backend.database import db
from backend.models import PackagingImageAsset
from backend.packaging_heatmap.constants import (
    ALLOWED_PACKAGING_IMAGE_MIMES,
    PACKAGING_IMAGE_SIDES,
)

logger = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 25_000_000  # guard against decompression bombs (~5000x5000)


class PackagingHeatmapAssetError(Exception):
    """Domain error for packaging image operations."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def validate_packaging_image_side(side: str) -> str:
    normalized = (side or "").strip().lower()
    if normalized not in PACKAGING_IMAGE_SIDES:
        raise PackagingHeatmapAssetError(
            f"Invalid side '{side}'. Must be one of: {', '.join(PACKAGING_IMAGE_SIDES)}",
            status_code=400,
        )
    return normalized


def _normalize_mime(content_type: Optional[str], filename: Optional[str]) -> str:
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in ALLOWED_PACKAGING_IMAGE_MIMES:
        return mime

    name = (filename or "").lower()
    if name.endswith(".jpg") or name.endswith(".jpeg"):
        return "image/jpeg"
    if name.endswith(".png"):
        return "image/png"
    if name.endswith(".webp"):
        return "image/webp"

    raise PackagingHeatmapAssetError(
        "Unsupported image type. Allowed: JPEG, PNG, WebP.",
        status_code=415,
    )


def _inspect_image_bytes(raw: bytes, mime: str) -> Tuple[int, int, str]:
    try:
        with Image.open(BytesIO(raw)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise PackagingHeatmapAssetError(
            "File is not a valid image.",
            status_code=415,
        ) from exc

    try:
        with Image.open(BytesIO(raw)) as img:
            width, height = img.size
            detected_format = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise PackagingHeatmapAssetError(
            "Could not read image dimensions.",
            status_code=415,
        ) from exc

    if width < 1 or height < 1:
        raise PackagingHeatmapAssetError("Image dimensions are invalid.", status_code=415)

    format_to_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }
    resolved_mime = format_to_mime.get(detected_format, mime)
    if resolved_mime not in ALLOWED_PACKAGING_IMAGE_MIMES:
        raise PackagingHeatmapAssetError(
            "Unsupported image format after inspection.",
            status_code=415,
        )
    return width, height, resolved_mime


async def _read_upload_bounded(file: UploadFile) -> bytes:
    max_bytes = settings.MAX_PACKAGING_IMAGE_MB * 1024 * 1024
    chunks: list[bytes] = []
    total = 0

    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise PackagingHeatmapAssetError(
                f"File too large. Max {settings.MAX_PACKAGING_IMAGE_MB}MB allowed.",
                status_code=413,
            )
        chunks.append(chunk)

    if total == 0:
        raise PackagingHeatmapAssetError("Empty file upload.", status_code=400)

    return b"".join(chunks)


def _asset_from_doc(asset_doc: Dict[str, Any]) -> PackagingImageAsset:
    return PackagingImageAsset.model_validate(asset_doc)


def get_packaging_image_from_config(
    product_test_config: Optional[Dict[str, Any]],
    side: str,
) -> Optional[PackagingImageAsset]:
    """Resolve a side asset from survey product_test_config."""
    normalized_side = validate_packaging_image_side(side)
    if not product_test_config:
        return None
    images = product_test_config.get("packaging_heatmap_images") or {}
    raw = images.get(normalized_side)
    if not raw:
        return None
    try:
        return _asset_from_doc(raw)
    except Exception:
        logger.warning("Invalid packaging image asset for side=%s", normalized_side)
        return None


async def delete_packaging_image(asset_id: str) -> None:
    """Remove a GridFS object. No-op if missing or invalid id."""
    if not asset_id or not ObjectId.is_valid(asset_id):
        return

    bucket = db.get_packaging_images_bucket()
    try:
        await bucket.delete(ObjectId(asset_id))
    except Exception as exc:
        logger.warning("GridFS delete failed for asset_id=%s: %s", asset_id, exc)


async def _replace_survey_side_asset(
    survey_id: str,
    side: str,
    asset: Optional[PackagingImageAsset],
) -> Dict[str, Any]:
    """Persist asset reference on survey.product_test_config.packaging_heatmap_images."""
    surveys_col = db.get_collection("surveys")
    survey = await surveys_col.find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise PackagingHeatmapAssetError("Survey not found.", status_code=404)

    pt_config = dict(survey.get("product_test_config") or {})
    images = dict(pt_config.get("packaging_heatmap_images") or {"front": None, "back": None})
    images[side] = asset.model_dump(mode="json") if asset else None
    pt_config["packaging_heatmap_images"] = images

    await surveys_col.update_one(
        {"_id": ObjectId(survey_id)},
        {"$set": {"product_test_config": pt_config, "updated_at": _utc_now()}},
    )
    return pt_config


async def save_packaging_image(
    survey_id: str,
    side: str,
    file: UploadFile,
) -> PackagingImageAsset:
    """
    Validate, store in GridFS, and attach to survey product_test_config.

    Replaces any existing image for the same side (old GridFS file deleted).
    """
    if not ObjectId.is_valid(survey_id):
        raise PackagingHeatmapAssetError("Invalid survey ID.", status_code=400)

    normalized_side = validate_packaging_image_side(side)

    raw = await _read_upload_bounded(file)
    mime = _normalize_mime(file.content_type, file.filename)
    width, height, resolved_mime = _inspect_image_bytes(raw, mime)

    surveys_col = db.get_collection("surveys")
    survey = await surveys_col.find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise PackagingHeatmapAssetError("Survey not found.", status_code=404)

    if survey.get("status") != "draft":
        raise PackagingHeatmapAssetError(
            "Packaging images can only be uploaded while survey is in draft status.",
            status_code=400,
        )

    existing = get_packaging_image_from_config(
        survey.get("product_test_config"),
        normalized_side,
    )
    if existing and existing.asset_id:
        await delete_packaging_image(existing.asset_id)

    bucket = db.get_packaging_images_bucket()
    filename = file.filename or f"{normalized_side}{_extension_for_mime(resolved_mime)}"
    metadata = {
        "survey_id": survey_id,
        "side": normalized_side,
        "mime": resolved_mime,
        "width": width,
        "height": height,
        "filename": filename,
    }

    grid_id = await bucket.upload_from_stream(
        filename,
        BytesIO(raw),
        metadata=metadata,
    )
    asset_id = str(grid_id)

    asset = PackagingImageAsset(
        asset_id=asset_id,
        side=normalized_side,
        survey_id=survey_id,
        width=width,
        height=height,
        mime=resolved_mime,
        filename=filename,
        uploaded_at=_utc_now(),
    )

    await _replace_survey_side_asset(survey_id, normalized_side, asset)
    return asset


async def remove_packaging_image_for_survey(survey_id: str, side: str) -> None:
    """Delete GridFS asset and clear survey config reference for a side."""
    if not ObjectId.is_valid(survey_id):
        raise PackagingHeatmapAssetError("Invalid survey ID.", status_code=400)

    normalized_side = validate_packaging_image_side(side)
    surveys_col = db.get_collection("surveys")
    survey = await surveys_col.find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise PackagingHeatmapAssetError("Survey not found.", status_code=404)

    if survey.get("status") != "draft":
        raise PackagingHeatmapAssetError(
            "Packaging images can only be removed while survey is in draft status.",
            status_code=400,
        )

    existing = get_packaging_image_from_config(
        survey.get("product_test_config"),
        normalized_side,
    )
    if existing and existing.asset_id:
        await delete_packaging_image(existing.asset_id)

    await _replace_survey_side_asset(survey_id, normalized_side, None)


def _extension_for_mime(mime: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }.get(mime, ".img")


async def stream_packaging_image(asset_id: str) -> Tuple[Any, str, Dict[str, str]]:
    """
    Open GridFS download stream for an asset.

    Returns (grid_out_stream, media_type, response_headers).
    """
    if not asset_id or not ObjectId.is_valid(asset_id):
        raise PackagingHeatmapAssetError("Invalid asset ID.", status_code=400)

    bucket = db.get_packaging_images_bucket()
    try:
        grid_out = await bucket.open_download_stream(ObjectId(asset_id))
    except Exception as exc:
        raise PackagingHeatmapAssetError("Packaging image not found.", status_code=404) from exc

    mime = (
        (grid_out.metadata or {}).get("mime")
        or getattr(grid_out, "content_type", None)
        or "application/octet-stream"
    )
    filename = (
        (grid_out.metadata or {}).get("filename")
        or getattr(grid_out, "filename", None)
        or f"packaging_{asset_id}"
    )

    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "public, max-age=86400, immutable",
        "ETag": f'"{asset_id}"',
    }
    return grid_out, mime, headers


def packaging_error_to_http(exc: PackagingHeatmapAssetError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)

async def save_voice_note(
    survey_id: str,
    file: UploadFile,
) -> Dict[str, Any]:
    """Store an audio/webm voice note in GridFS."""
    if not ObjectId.is_valid(survey_id):
        raise PackagingHeatmapAssetError("Invalid survey ID.", status_code=400)

    max_bytes = 5 * 1024 * 1024
    raw = await file.read()
    if len(raw) > max_bytes:
        raise PackagingHeatmapAssetError("Voice note too large. Max 5MB.", status_code=413)

    if not raw:
        raise PackagingHeatmapAssetError("Empty voice note.", status_code=400)

    bucket = db.get_packaging_images_bucket()
    filename = file.filename or "voice_note.webm"
    metadata = {
        "survey_id": survey_id,
        "type": "voice_note",
        "mime": "audio/webm",
        "filename": filename,
    }

    grid_id = await bucket.upload_from_stream(
        filename,
        BytesIO(raw),
        metadata=metadata,
    )

    return {
        "asset_id": str(grid_id),
        "mime": "audio/webm",
        "duration_estimate": None
    }

