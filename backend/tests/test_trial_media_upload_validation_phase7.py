"""Phase 7 — upload validation matrix for trial media capture."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from PIL import Image

from backend.services.product_test_media_asset_service import (
    ProductTestMediaAssetError,
    save_trial_media_upload,
)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "TRIALMEDIA1"
QUESTION_ID = "pt_trial_media_upload"


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
                "max_image_mb": 5,
                "max_video_mb": 25,
                "max_video_duration_seconds": 60,
            }
        },
    }


def _active_token(status: str = "active"):
    return {"token": TOKEN, "status": status, "survey_id": SURVEY_ID}


def _mock_db(*, token_doc, survey_doc, assets_col=None):
    assets_col = assets_col or MagicMock()
    assets_col.find_one = AsyncMock(return_value=None)
    assets_col.insert_one = AsyncMock()
    assets_col.delete_one = AsyncMock()
    assets_col.update_one = AsyncMock()

    tokens = MagicMock()
    tokens.find_one = AsyncMock(return_value=token_doc)
    surveys = MagicMock()
    surveys.find_one = AsyncMock(return_value=survey_doc)

    def col(name):
        if name == "tokens":
            return tokens
        if name == "surveys":
            return surveys
        return assets_col

    return col, assets_col


@pytest.fixture(autouse=True)
def _enable_respondent_upload_rollout(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "respondent_upload")


@pytest.mark.asyncio
async def test_upload_rejects_invalid_token():
    col, _ = _mock_db(token_doc=None, survey_doc=_enabled_survey())
    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(_make_png_bytes()))
        assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_upload_rejects_submitted_token():
    col, _ = _mock_db(token_doc=_active_token("submitted"), survey_doc=_enabled_survey())
    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(_make_png_bytes()))
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_upload_rejects_disabled_survey_feature():
    survey = _enabled_survey()
    survey["product_test_config"]["trial_media_capture"]["enabled"] = False
    col, _ = _mock_db(token_doc=_active_token(), survey_doc=survey)
    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(_make_png_bytes()))
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_upload_rejects_wrong_mime():
    col, _ = _mock_db(token_doc=_active_token(), survey_doc=_enabled_survey())
    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(
                TOKEN,
                QUESTION_ID,
                FakeUpload(b"%PDF-1.4", filename="doc.pdf", content_type="application/pdf"),
            )
        assert exc.value.status_code == 415


@pytest.mark.asyncio
async def test_upload_rejects_oversized_image():
    huge = _make_png_bytes() + (b"x" * (6 * 1024 * 1024))
    col, _ = _mock_db(token_doc=_active_token(), survey_doc=_enabled_survey())
    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(huge))
        assert exc.value.status_code == 413


@pytest.mark.asyncio
async def test_upload_rejects_video_over_duration_limit():
    col, _assets_col = _mock_db(token_doc=_active_token(), survey_doc=_enabled_survey())

    def _raise_duration(*_args, **_kwargs):
        raise ProductTestMediaAssetError(
            "Video too long. Max 60 seconds allowed.",
            status_code=413,
        )

    with patch("backend.services.product_test_media_asset_service.db.get_collection", side_effect=col), \
         patch(
             "backend.services.product_test_media_asset_service._probe_video_duration_file",
             side_effect=_raise_duration,
         ):
        with pytest.raises(ProductTestMediaAssetError) as exc:
            await save_trial_media_upload(
                TOKEN,
                QUESTION_ID,
                FakeUpload(b"fake-video", filename="clip.mp4", content_type="video/mp4"),
            )
        assert exc.value.status_code == 413
        assert "60" in exc.value.message


@pytest.mark.asyncio
async def test_upload_rejects_when_rollout_schema_only(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "schema_only")
    with pytest.raises(ProductTestMediaAssetError) as exc:
        await save_trial_media_upload(TOKEN, QUESTION_ID, FakeUpload(_make_png_bytes()))
    assert exc.value.status_code == 503
