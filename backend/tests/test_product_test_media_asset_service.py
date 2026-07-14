"""Phase 3 — product test trial media upload pipeline."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from backend.routers.public import router as public_router
from backend.services.product_test_media_asset_service import (
    ProductTestMediaAssetError,
    _inspect_image_bytes,
    _normalize_mime,
    delete_trial_media_asset,
    resolve_upload_limits,
    save_trial_media_upload,
)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "TRIALMEDIA1"
QUESTION_ID = "pt_trial_media_upload"


@pytest.fixture(autouse=True)
def _enable_respondent_upload_rollout(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "respondent_upload")


def _make_png_bytes(width: int = 120, height: int = 80) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), color=(30, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


class FakeUpload:
    def __init__(self, data: bytes, filename: str = "trial.png", content_type: str = "image/png"):
        self._data = data
        self.filename = filename
        self.content_type = content_type
        self._pos = 0

    async def read(self, n: int = -1) -> bytes:
        if n == -1:
            chunk = self._data[self._pos :]
            self._pos = len(self._data)
            return chunk
        chunk = self._data[self._pos : self._pos + n]
        self._pos += len(chunk)
        return chunk


def _enabled_survey():
    return {
        "_id": ObjectId(SURVEY_ID),
        "status": "active",
        "product_test_config": {
            "trial_media_capture": {
                "enabled": True,
                "accepted_media": "image_or_video",
                "required": False,
                "timing": "after_use",
                "max_video_duration_seconds": 60,
                "max_image_mb": 5,
                "max_video_mb": 25,
            }
        },
    }


def _active_token(status: str = "active"):
    return {"token": TOKEN, "status": status, "survey_id": SURVEY_ID}


def test_normalize_mime_from_extension():
    assert _normalize_mime(None, "clip.mp4") == "video/mp4"
    assert _normalize_mime("image/png", "x.png") == "image/png"


def test_inspect_image_bytes():
    raw = _make_png_bytes(64, 48)
    width, height, mime = _inspect_image_bytes(raw, "image/png")
    assert width == 64
    assert height == 48
    assert mime == "image/png"


def test_resolve_upload_limits_caps_by_settings():
    limits = resolve_upload_limits({
        "max_image_mb": 99,
        "max_video_mb": 99,
        "max_video_duration_seconds": 999,
    })
    assert limits["max_image_bytes"] <= 5 * 1024 * 1024 + 1
    assert limits["max_video_duration_s"] <= 60


@pytest.mark.asyncio
async def test_save_trial_media_upload_rejects_disabled_feature():
    with patch("backend.services.product_test_media_asset_service.db.get_collection") as mock_get_col:
        tokens = MagicMock()
        tokens.find_one = AsyncMock(return_value=_active_token())
        surveys = MagicMock()
        surveys.find_one = AsyncMock(return_value={
            "_id": ObjectId(SURVEY_ID),
            "product_test_config": {"trial_media_capture": {"enabled": False}},
        })
        mock_get_col.side_effect = lambda name: tokens if name == "tokens" else surveys

        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(_make_png_bytes()))
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_save_trial_media_upload_stores_image_and_registry():
    png = _make_png_bytes()
    bucket = MagicMock()
    bucket.upload_from_stream = AsyncMock(return_value=ObjectId())
    assets_col = MagicMock()
    assets_col.find_one = AsyncMock(return_value=None)
    assets_col.insert_one = AsyncMock()
    assets_col.delete_one = AsyncMock()

    with patch("backend.services.product_test_media_asset_service.db.get_collection") as mock_get_col, \
         patch("backend.services.product_test_media_asset_service.db.get_product_test_media_bucket", return_value=bucket):
        tokens = MagicMock()
        tokens.find_one = AsyncMock(return_value=_active_token())
        surveys = MagicMock()
        surveys.find_one = AsyncMock(return_value=_enabled_survey())

        def col(name):
            if name == "tokens":
                return tokens
            if name == "surveys":
                return surveys
            return assets_col

        mock_get_col.side_effect = col

        asset = await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(png))
        assert asset.media_type == "image"
        assert asset.question_id == QUESTION_ID
        assert asset.token == TOKEN
        assert asset.width == 120
        assert asset.height == 80
        bucket.upload_from_stream.assert_awaited_once()
        assets_col.insert_one.assert_awaited_once()


@pytest.mark.asyncio
async def test_delete_trial_media_asset_requires_token_scope():
    registry = {
        "asset_id": str(ObjectId()),
        "survey_id": SURVEY_ID,
        "token": "OTHER",
        "question_id": QUESTION_ID,
    }
    assets_col = MagicMock()
    assets_col.find_one = AsyncMock(return_value=registry)

    with patch("backend.services.product_test_media_asset_service.db.get_collection") as mock_get_col:
        tokens = MagicMock()
        tokens.find_one = AsyncMock(return_value=_active_token())
        surveys = MagicMock()
        surveys.find_one = AsyncMock(return_value=_enabled_survey())
        mock_get_col.side_effect = lambda name: (
            tokens if name == "tokens" else surveys if name == "surveys" else assets_col
        )

        with pytest.raises(ProductTestMediaAssetError) as exc:
            await delete_trial_media_asset(TOKEN, registry["asset_id"])
        assert exc.value.status_code == 404


@pytest.fixture
def public_client():
    app = FastAPI()
    app.include_router(public_router)
    return TestClient(app)


def test_public_upload_route_rejects_submitted_token(public_client):
    with patch("backend.routers.public.save_trial_media_upload", new_callable=AsyncMock) as mock_save:
        mock_save.side_effect = ProductTestMediaAssetError(
            "Survey already completed or validation failed for this link.",
            status_code=403,
        )
        with patch("backend.routers.public.db.get_collection"):
            response = public_client.post(
                f"/s/{TOKEN}/product-test/media/{QUESTION_ID}",
                files={"file": ("trial.png", _make_png_bytes(), "image/png")},
            )
    assert response.status_code == 403


def test_public_upload_route_success(public_client):
    from backend.models import ProductTestMediaAsset
    from datetime import datetime, timezone

    fake_asset = ProductTestMediaAsset(
        asset_id=str(ObjectId()),
        survey_id=SURVEY_ID,
        token=TOKEN,
        question_id=QUESTION_ID,
        media_type="image",
        mime="image/png",
        filename="trial.png",
        size_bytes=100,
        width=10,
        height=10,
        uploaded_at=datetime.now(timezone.utc),
    )

    with patch("backend.routers.public.save_trial_media_upload", new_callable=AsyncMock) as mock_save:
        mock_save.return_value = fake_asset
        response = public_client.post(
            f"/s/{TOKEN}/product-test/media/{QUESTION_ID}",
            files={"file": ("trial.png", _make_png_bytes(), "image/png")},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["asset_id"] == fake_asset.asset_id
    assert body["media_type"] == "image"
