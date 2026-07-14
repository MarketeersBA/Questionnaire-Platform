"""
Product test trial media asset service — GridFS storage for respondent photo/video uploads.

Token-scoped uploads validated against survey.product_test_config.trial_media_capture.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, AsyncIterator, Dict, List, Literal, Optional, Tuple

from bson import ObjectId
from fastapi import UploadFile
from PIL import Image, UnidentifiedImageError

from backend.config import settings
from backend.database import db
from backend.models import ProductTestMediaAsset
from backend.trial_media_capture.constants import (
    ALLOWED_TRIAL_IMAGE_MIMES,
    ALLOWED_TRIAL_MEDIA_MIMES,
    ALLOWED_TRIAL_VIDEO_MIMES,
    IMAGE_EXTENSIONS,
    LIFECYCLE_PENDING,
    LIFECYCLE_REPLACED,
    MEDIA_ASSETS_COLLECTION,
    VIDEO_EXTENSIONS,
)
from backend.services.product_test_media_scanner import initial_scan_status
from backend.services.product_test_media_streaming import iter_gridfs_chunks
from backend.trial_media_capture.snapshot import (
    TRIAL_MEDIA_CANONICAL_QUESTION_ID,
    normalize_trial_media_capture,
)
from backend.utils.trial_media_rollout_flags import assert_respondent_upload_rollout_enabled

logger = logging.getLogger(__name__)

Image.MAX_IMAGE_PIXELS = 25_000_000

MediaType = Literal["image", "video"]
BLOCKED_TOKEN_STATUSES = frozenset({"submitted", "failed"})


class ProductTestMediaAssetError(Exception):
    """Domain error for trial media upload operations."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def media_error_to_http(exc: ProductTestMediaAssetError):
    from fastapi import HTTPException

    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _assets_collection():
    return db.get_collection(MEDIA_ASSETS_COLLECTION)


def _media_bucket():
    return db.get_product_test_media_bucket()


def resolve_upload_limits(capture: Dict[str, Any]) -> Dict[str, int | float]:
    """Merge per-survey capture limits with platform caps."""
    max_image_mb = min(
        int(capture.get("max_image_mb") or settings.MAX_PRODUCT_TEST_IMAGE_MB),
        settings.MAX_PRODUCT_TEST_IMAGE_MB,
    )
    max_video_mb = min(
        int(capture.get("max_video_mb") or settings.MAX_PRODUCT_TEST_VIDEO_MB),
        settings.MAX_PRODUCT_TEST_VIDEO_MB,
    )
    max_duration = min(
        int(capture.get("max_video_duration_seconds") or settings.MAX_PRODUCT_TEST_VIDEO_DURATION_S),
        settings.MAX_PRODUCT_TEST_VIDEO_DURATION_S,
    )
    return {
        "max_image_bytes": max(1, max_image_mb) * 1024 * 1024,
        "max_video_bytes": max(1, max_video_mb) * 1024 * 1024,
        "max_video_duration_s": float(max(1, max_duration)),
    }


def _normalize_mime(content_type: Optional[str], filename: Optional[str]) -> str:
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime in ALLOWED_TRIAL_MEDIA_MIMES:
        return mime

    name = (filename or "").lower()
    for ext, mapped in {**IMAGE_EXTENSIONS, **VIDEO_EXTENSIONS}.items():
        if name.endswith(ext):
            return mapped

    raise ProductTestMediaAssetError(
        "Unsupported file type. Allowed images: JPEG, PNG, WebP. "
        "Allowed videos: MP4, WebM, MOV.",
        status_code=415,
    )


def _classify_media_type(mime: str) -> MediaType:
    if mime in ALLOWED_TRIAL_IMAGE_MIMES:
        return "image"
    if mime in ALLOWED_TRIAL_VIDEO_MIMES:
        return "video"
    raise ProductTestMediaAssetError("Unsupported media type.", status_code=415)


def _assert_accepted_by_config(media_type: MediaType, accepted_media: str) -> None:
    if accepted_media == "image_or_video":
        return
    if accepted_media == "image" and media_type != "image":
        raise ProductTestMediaAssetError(
            "This survey accepts images only.",
            status_code=415,
        )
    if accepted_media == "video" and media_type != "video":
        raise ProductTestMediaAssetError(
            "This survey accepts videos only.",
            status_code=415,
        )


async def _spool_upload_to_tempfile(file: UploadFile, max_bytes: int) -> Tuple[str, int]:
    """Stream upload to disk in bounded chunks — avoids loading large videos into RAM."""
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".upload")
    tmp_path = tmp.name
    total = 0
    try:
        while True:
            chunk = await file.read(64 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                raise ProductTestMediaAssetError(
                    f"File too large. Max {max_bytes // (1024 * 1024)}MB allowed for this upload.",
                    status_code=413,
                )
            tmp.write(chunk)
        tmp.flush()
    except Exception:
        tmp.close()
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise
    finally:
        tmp.close()

    if total == 0:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise ProductTestMediaAssetError("Empty file upload.", status_code=400)

    return tmp_path, total


async def _read_upload_bounded(file: UploadFile, max_bytes: int) -> bytes:
    """Legacy in-memory read for small payloads / tests."""
    chunks: list[bytes] = []
    total = 0

    while True:
        chunk = await file.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise ProductTestMediaAssetError(
                f"File too large. Max {max_bytes // (1024 * 1024)}MB allowed for this upload.",
                status_code=413,
            )
        chunks.append(chunk)

    if total == 0:
        raise ProductTestMediaAssetError("Empty file upload.", status_code=400)

    return b"".join(chunks)


def _inspect_image_file(path: str, mime: str) -> Tuple[int, int, str]:
    try:
        with Image.open(path) as img:
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise ProductTestMediaAssetError(
            "File is not a valid image.",
            status_code=415,
        ) from exc

    try:
        with Image.open(path) as img:
            width, height = img.size
            detected_format = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise ProductTestMediaAssetError(
            "Could not read image dimensions.",
            status_code=415,
        ) from exc

    if width < 1 or height < 1:
        raise ProductTestMediaAssetError("Image dimensions are invalid.", status_code=415)

    format_to_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }
    resolved_mime = format_to_mime.get(detected_format, mime)
    if resolved_mime not in ALLOWED_TRIAL_IMAGE_MIMES:
        raise ProductTestMediaAssetError(
            "Unsupported image format after inspection.",
            status_code=415,
        )
    return width, height, resolved_mime


def _inspect_image_bytes(raw: bytes, mime: str) -> Tuple[int, int, str]:
    try:
        with Image.open(BytesIO(raw)) as img:
            img.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise ProductTestMediaAssetError(
            "File is not a valid image.",
            status_code=415,
        ) from exc

    try:
        with Image.open(BytesIO(raw)) as img:
            width, height = img.size
            detected_format = (img.format or "").upper()
    except (UnidentifiedImageError, OSError) as exc:
        raise ProductTestMediaAssetError(
            "Could not read image dimensions.",
            status_code=415,
        ) from exc

    if width < 1 or height < 1:
        raise ProductTestMediaAssetError("Image dimensions are invalid.", status_code=415)

    format_to_mime = {
        "JPEG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
    }
    resolved_mime = format_to_mime.get(detected_format, mime)
    if resolved_mime not in ALLOWED_TRIAL_IMAGE_MIMES:
        raise ProductTestMediaAssetError(
            "Unsupported image format after inspection.",
            status_code=415,
        )
    return width, height, resolved_mime


def _probe_video_duration_file(path: str, max_duration_s: float) -> float:
    if not shutil.which("ffprobe"):
        raise ProductTestMediaAssetError(
            "Video validation is unavailable (ffprobe not installed).",
            status_code=503,
        )

    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        if result.returncode != 0:
            raise ProductTestMediaAssetError(
                "Could not inspect video file.",
                status_code=415,
            )

        duration_raw = (result.stdout or "").strip()
        if not duration_raw:
            raise ProductTestMediaAssetError(
                "Could not determine video duration.",
                status_code=415,
            )

        duration = float(duration_raw)
        if duration <= 0:
            raise ProductTestMediaAssetError("Video duration is invalid.", status_code=415)
        if duration > max_duration_s:
            raise ProductTestMediaAssetError(
                f"Video too long. Max {int(max_duration_s)} seconds allowed.",
                status_code=413,
            )
        return round(duration, 2)
    except ProductTestMediaAssetError:
        raise
    except (ValueError, subprocess.TimeoutExpired, OSError) as exc:
        raise ProductTestMediaAssetError(
            "Could not validate video duration.",
            status_code=415,
        ) from exc


def _extension_for_mime(mime: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "video/mp4": ".mp4",
        "video/webm": ".webm",
        "video/quicktime": ".mov",
    }.get(mime, ".bin")


async def _load_token_context(token: str) -> Tuple[Dict[str, Any], Dict[str, Any], str]:
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise ProductTestMediaAssetError("Invalid token.", status_code=404)

    status = token_doc.get("status")
    if status in BLOCKED_TOKEN_STATUSES:
        raise ProductTestMediaAssetError(
            "Survey already completed or validation failed for this link.",
            status_code=403,
        )

    survey_id = str(token_doc["survey_id"])
    if not ObjectId.is_valid(survey_id):
        raise ProductTestMediaAssetError("Invalid survey reference.", status_code=400)

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise ProductTestMediaAssetError("Survey not found.", status_code=404)

    return token_doc, survey, survey_id


def _validate_feature_enabled(survey: Dict[str, Any]) -> Dict[str, Any]:
    pt_config = survey.get("product_test_config") or {}
    capture = normalize_trial_media_capture(pt_config.get("trial_media_capture"))
    if not capture.get("enabled"):
        raise ProductTestMediaAssetError(
            "Trial media upload is not enabled for this survey.",
            status_code=403,
        )
    return capture


def _validate_question_id(question_id: str) -> str:
    normalized = (question_id or "").strip()
    if normalized != TRIAL_MEDIA_CANONICAL_QUESTION_ID:
        raise ProductTestMediaAssetError(
            f"Invalid question ID for trial media upload.",
            status_code=400,
        )
    return normalized


async def _find_registry_by_asset(asset_id: str) -> Optional[Dict[str, Any]]:
    if not asset_id or not ObjectId.is_valid(asset_id):
        return None
    return await _assets_collection().find_one({"asset_id": asset_id})


async def _delete_gridfs_asset(asset_id: str) -> None:
    if not asset_id or not ObjectId.is_valid(asset_id):
        return
    try:
        await _media_bucket().delete(ObjectId(asset_id))
    except Exception as exc:
        logger.warning("GridFS delete failed for trial media asset_id=%s: %s", asset_id, exc)


async def _delete_registry_doc(asset_id: str) -> None:
    await _assets_collection().delete_one({"asset_id": asset_id})


async def _remove_existing_for_token_question(token: str, question_id: str) -> None:
    existing = await _assets_collection().find_one({"token": token, "question_id": question_id})
    if not existing:
        return
    asset_id = existing.get("asset_id")
    if asset_id:
        await _assets_collection().update_one(
            {"asset_id": asset_id},
            {"$set": {"lifecycle_state": LIFECYCLE_REPLACED, "replaced_at": _utc_now()}},
        )
        await _delete_gridfs_asset(asset_id)
    await _delete_registry_doc(existing["asset_id"])


def _stream_headers(filename: str, asset_id: str, size_bytes: Optional[int] = None) -> Dict[str, str]:
    headers = {
        "Content-Disposition": f'inline; filename="{filename}"',
        "Cache-Control": "private, max-age=3600",
        "ETag": f'"{asset_id}"',
        "Accept-Ranges": "bytes",
    }
    if size_bytes is not None:
        headers["Content-Length"] = str(size_bytes)
    return headers


async def _open_chunked_gridfs_stream(
    asset_id: str,
    registry: Dict[str, Any],
) -> Tuple[AsyncIterator[bytes], str, Dict[str, str]]:
    try:
        grid_out = await _media_bucket().open_download_stream(ObjectId(asset_id))
    except Exception as exc:
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404) from exc

    mime = (
        (grid_out.metadata or {}).get("mime")
        or registry.get("mime")
        or "application/octet-stream"
    )
    filename = (
        (grid_out.metadata or {}).get("filename")
        or registry.get("filename")
        or f"trial_media_{asset_id}"
    )
    size_bytes = registry.get("size_bytes") or getattr(grid_out, "length", None)
    headers = _stream_headers(filename, asset_id, size_bytes)
    return iter_gridfs_chunks(grid_out), mime, headers


def _asset_from_registry(doc: Dict[str, Any]) -> ProductTestMediaAsset:
    return ProductTestMediaAsset.model_validate(doc)


async def save_trial_media_upload(
    token: str,
    question_id: str,
    file: UploadFile,
) -> ProductTestMediaAsset:
    """
    Validate, store in GridFS, and register a token-scoped trial media asset.

    Replaces any prior upload for the same token + question_id.
    """
    assert_respondent_upload_rollout_enabled()
    _validate_question_id(question_id)
    _token_doc, survey, survey_id = await _load_token_context(token)
    capture = _validate_feature_enabled(survey)
    limits = resolve_upload_limits(capture)

    read_cap = max(limits["max_image_bytes"], limits["max_video_bytes"])
    tmp_path, file_size = await _spool_upload_to_tempfile(file, int(read_cap))

    try:
        mime = _normalize_mime(file.content_type, file.filename)
        media_type = _classify_media_type(mime)
        _assert_accepted_by_config(media_type, capture.get("accepted_media", "image_or_video"))

        if media_type == "image":
            if file_size > limits["max_image_bytes"]:
                raise ProductTestMediaAssetError(
                    f"Image too large. Max {limits['max_image_bytes'] // (1024 * 1024)}MB allowed.",
                    status_code=413,
                )
            width, height, resolved_mime = _inspect_image_file(tmp_path, mime)
            duration_seconds = None
        else:
            if file_size > limits["max_video_bytes"]:
                raise ProductTestMediaAssetError(
                    f"Video too large. Max {limits['max_video_bytes'] // (1024 * 1024)}MB allowed.",
                    status_code=413,
                )
            duration_seconds = _probe_video_duration_file(tmp_path, limits["max_video_duration_s"])
            width, height, resolved_mime = None, None, mime

        await _remove_existing_for_token_question(token, question_id)

        filename = file.filename or f"trial_media_{question_id}{_extension_for_mime(resolved_mime)}"
        uploaded_at = _utc_now()
        grid_metadata = {
            "survey_id": survey_id,
            "token": token,
            "question_id": question_id,
            "media_type": media_type,
            "mime": resolved_mime,
            "filename": filename,
            "size_bytes": file_size,
            "created_at": uploaded_at.isoformat(),
        }
        if width is not None:
            grid_metadata["width"] = width
        if height is not None:
            grid_metadata["height"] = height
        if duration_seconds is not None:
            grid_metadata["duration_seconds"] = duration_seconds

        with open(tmp_path, "rb") as spooled:
            grid_id = await _media_bucket().upload_from_stream(
                filename,
                spooled,
                metadata=grid_metadata,
            )

        asset_id = str(grid_id)
        scan_status = initial_scan_status()

        registry_doc = {
            "asset_id": asset_id,
            "survey_id": survey_id,
            "token": token,
            "question_id": question_id,
            "media_type": media_type,
            "mime": resolved_mime,
            "filename": filename,
            "size_bytes": file_size,
            "width": width,
            "height": height,
            "duration_seconds": duration_seconds,
            "uploaded_at": uploaded_at,
            "lifecycle_state": LIFECYCLE_PENDING,
            "scan_status": scan_status,
        }
        await _assets_collection().insert_one(registry_doc)

        return _asset_from_registry(registry_doc)
    finally:
        if os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                logger.warning("Failed to remove spooled upload temp file: %s", tmp_path)


async def delete_trial_media_asset(token: str, asset_id: str) -> None:
    """Remove a pending trial media asset scoped to the respondent token."""
    assert_respondent_upload_rollout_enabled()
    _token_doc, survey, survey_id = await _load_token_context(token)
    _validate_feature_enabled(survey)

    if not ObjectId.is_valid(asset_id):
        raise ProductTestMediaAssetError("Invalid asset ID.", status_code=400)

    registry = await _find_registry_by_asset(asset_id)
    if not registry:
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)

    if registry.get("token") != token:
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)
    if str(registry.get("survey_id")) != survey_id:
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)

    await _delete_gridfs_asset(asset_id)
    await _delete_registry_doc(asset_id)


async def stream_trial_media_asset(
    token: str,
    asset_id: str,
) -> Tuple[AsyncIterator[bytes], str, Dict[str, str]]:
    """Chunked GridFS stream after token ownership check (public respondent preview)."""
    assert_respondent_upload_rollout_enabled()
    _token_doc, survey, survey_id = await _load_token_context(token)
    _validate_feature_enabled(survey)

    if not ObjectId.is_valid(asset_id):
        raise ProductTestMediaAssetError("Invalid asset ID.", status_code=400)

    registry = await _find_registry_by_asset(asset_id)
    if not registry or registry.get("token") != token or str(registry.get("survey_id")) != survey_id:
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)

    return await _open_chunked_gridfs_stream(asset_id, registry)


async def get_trial_media_asset_for_survey(survey_id: str, asset_id: str) -> ProductTestMediaAsset:
    """Load registry metadata after survey ownership check."""
    if not ObjectId.is_valid(asset_id):
        raise ProductTestMediaAssetError("Invalid asset ID.", status_code=400)

    registry = await _find_registry_by_asset(asset_id)
    if not registry or str(registry.get("survey_id")) != str(survey_id):
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)

    return _asset_from_registry(registry)


async def list_trial_media_assets_for_survey(survey_id: str) -> List[Dict[str, Any]]:
    """Return all trial media registry docs for a survey (newest first)."""
    cursor = _assets_collection().find({"survey_id": str(survey_id)}).sort("uploaded_at", -1)
    docs = await cursor.to_list(length=5000)
    return [_asset_from_registry(doc).model_dump(mode="json") for doc in docs]


async def stream_trial_media_asset_for_survey(
    survey_id: str,
    asset_id: str,
) -> Tuple[AsyncIterator[bytes], str, Dict[str, str]]:
    """Chunked GridFS stream after survey ownership + scan gate (analyst routes)."""
    from backend.services.product_test_media_scanner import ensure_analyst_scan_clear

    if not ObjectId.is_valid(asset_id):
        raise ProductTestMediaAssetError("Invalid asset ID.", status_code=400)

    registry_doc = await _assets_collection().find_one({"asset_id": asset_id})
    if not registry_doc or str(registry_doc.get("survey_id")) != str(survey_id):
        raise ProductTestMediaAssetError("Trial media asset not found.", status_code=404)

    await ensure_analyst_scan_clear(registry_doc)
    return await _open_chunked_gridfs_stream(asset_id, registry_doc)
