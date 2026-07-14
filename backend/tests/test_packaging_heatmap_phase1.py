"""Phase 1 — packaging heatmap asset storage, validation, and public serve."""

from __future__ import annotations

from io import BytesIO
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from backend.models import User
from backend.routers.auth import get_current_active_analyst
from backend.routers.packaging_heatmap import router as packaging_router
from backend.routers.public import router as public_router
from backend.services.packaging_heatmap_asset_service import (
    PackagingHeatmapAssetError,
    _inspect_image_bytes,
    save_packaging_image,
    validate_packaging_image_side,
)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "ABCD1234EFGH"
MOCK_USER = User(
    _id="507f1f77bcf86cd799439011",
    username="analyst",
    email="a@test.com",
    role="analyst",
    is_active=True,
)


def _make_png_bytes(width: int = 120, height: int = 80) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (width, height), color=(200, 40, 40)).save(buf, format="PNG")
    return buf.getvalue()


class FakeUpload:
    def __init__(self, data: bytes, filename: str = "front.png", content_type: str = "image/png"):
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


def test_validate_packaging_image_side():
    assert validate_packaging_image_side("front") == "front"
    assert validate_packaging_image_side("BACK") == "back"
    with pytest.raises(PackagingHeatmapAssetError):
        validate_packaging_image_side("side")


def test_inspect_image_bytes_extracts_dimensions():
    raw = _make_png_bytes(100, 200)
    width, height, mime = _inspect_image_bytes(raw, "image/png")
    assert width == 100
    assert height == 200
    assert mime == "image/png"


def test_inspect_image_bytes_rejects_invalid_payload():
    with pytest.raises(PackagingHeatmapAssetError):
        _inspect_image_bytes(b"not-an-image", "image/png")


@pytest.mark.asyncio
async def test_save_packaging_image_round_trip_updates_survey_config():
    raw = _make_png_bytes(64, 48)
    upload = FakeUpload(raw)

    draft_survey = {
        "_id": ObjectId(SURVEY_ID),
        "status": "draft",
        "product_test_config": {
            "language": "en",
            "packaging_heatmap_images": {"front": None, "back": None},
        },
    }

    bucket = AsyncMock()
    bucket.upload_from_stream = AsyncMock(return_value=ObjectId())
    bucket.delete = AsyncMock()

    surveys_col = AsyncMock()
    surveys_col.find_one = AsyncMock(return_value=draft_survey)
    surveys_col.update_one = AsyncMock()

    with patch("backend.services.packaging_heatmap_asset_service.db") as mock_db:
        mock_db.get_packaging_images_bucket.return_value = bucket
        mock_db.get_collection.return_value = surveys_col

        asset = await save_packaging_image(SURVEY_ID, "front", upload)

    assert asset.side == "front"
    assert asset.survey_id == SURVEY_ID
    assert asset.width == 64
    assert asset.height == 48
    assert asset.mime == "image/png"
    assert ObjectId.is_valid(asset.asset_id)

    bucket.upload_from_stream.assert_awaited_once()
    surveys_col.update_one.assert_awaited_once()
    update_doc = surveys_col.update_one.call_args[0][1]["$set"]["product_test_config"]
    assert update_doc["packaging_heatmap_images"]["front"]["asset_id"] == asset.asset_id


@pytest.mark.asyncio
async def test_save_packaging_image_rejects_oversized_file():
    huge = b"x" * (6 * 1024 * 1024)
    upload = FakeUpload(huge, content_type="image/png")

    with patch("backend.services.packaging_heatmap_asset_service.settings") as mock_settings:
        mock_settings.MAX_PACKAGING_IMAGE_MB = 5
        with pytest.raises(PackagingHeatmapAssetError) as exc:
            await save_packaging_image(SURVEY_ID, "front", upload)
        assert exc.value.status_code == 413


# ─── Router integration (mocked DB) ───────────────────────────────────────────

analyst_app = FastAPI()
analyst_app.include_router(packaging_router)

public_app = FastAPI()
public_app.include_router(public_router)


@pytest.fixture
def analyst_client():
    return TestClient(analyst_app)


@pytest.fixture
def public_client():
    return TestClient(public_app)


def test_upload_route_requires_auth(analyst_client):
    res = analyst_client.post(
        f"/surveys/{SURVEY_ID}/packaging-heatmap/images/front",
        files={"file": ("front.png", _make_png_bytes(), "image/png")},
    )
    assert res.status_code in (401, 403)


@patch("backend.routers.packaging_heatmap.save_packaging_image", new_callable=AsyncMock)
def test_upload_route_with_auth(mock_save, analyst_client):
    mock_save.return_value = {
        "asset_id": str(ObjectId()),
        "side": "front",
        "survey_id": SURVEY_ID,
        "width": 120,
        "height": 80,
        "mime": "image/png",
        "filename": "front.png",
        "uploaded_at": "2026-06-30T00:00:00Z",
    }
    analyst_app.dependency_overrides[get_current_active_analyst] = lambda: MOCK_USER
    try:
        res = analyst_client.post(
            f"/surveys/{SURVEY_ID}/packaging-heatmap/images/front",
            files={"file": ("front.png", _make_png_bytes(), "image/png")},
        )
        assert res.status_code == 200
        assert res.json()["side"] == "front"
        mock_save.assert_awaited_once()
    finally:
        analyst_app.dependency_overrides.clear()


def _mock_public_db(token_doc, survey_doc, grid_stream: bytes | None = None):
    tokens_col = MagicMock()
    tokens_col.find_one = AsyncMock(return_value=token_doc)

    surveys_col = MagicMock()
    surveys_col.find_one = AsyncMock(return_value=survey_doc)

    def get_collection(name):
        if name == "tokens":
            return tokens_col
        if name == "surveys":
            return surveys_col
        return MagicMock()

    return get_collection


@patch("backend.routers.public.stream_packaging_image", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_public_packaging_image_requires_valid_token(mock_get_collection, mock_stream, public_client):
    mock_get_collection.side_effect = _mock_public_db(None, None)

    res = public_client.get(f"/s/{TOKEN}/packaging-image/front")
    assert res.status_code == 404


@patch("backend.routers.public.stream_packaging_image", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_public_packaging_image_rejects_submitted_token(mock_get_collection, mock_stream, public_client):
    mock_get_collection.side_effect = _mock_public_db(
        {"token": TOKEN, "status": "submitted", "survey_id": SURVEY_ID},
        {"_id": ObjectId(SURVEY_ID), "product_test_config": {}},
    )

    res = public_client.get(f"/s/{TOKEN}/packaging-image/front")
    assert res.status_code == 403


@patch("backend.routers.public.stream_packaging_image", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_public_packaging_image_404_when_side_not_configured(mock_get_collection, mock_stream, public_client):
    asset_id = str(ObjectId())
    mock_get_collection.side_effect = _mock_public_db(
        {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID},
        {
            "_id": ObjectId(SURVEY_ID),
            "product_test_config": {
                "packaging_heatmap_images": {"front": None, "back": None},
            },
        },
    )

    res = public_client.get(f"/s/{TOKEN}/packaging-image/front")
    assert res.status_code == 404


@patch("backend.routers.public.stream_packaging_image", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_public_packaging_image_streams_when_configured(mock_get_collection, mock_stream, public_client):
    asset_id = str(ObjectId())

    async def _fake_stream(_asset_id: str):
        async def _iter():
            yield _make_png_bytes(10, 10)

        grid_out = _iter()
        return grid_out, "image/png", {"ETag": f'"{asset_id}"'}

    mock_stream.side_effect = _fake_stream

    mock_get_collection.side_effect = _mock_public_db(
        {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID},
        {
            "_id": ObjectId(SURVEY_ID),
            "product_test_config": {
                "packaging_heatmap_images": {
                    "front": {
                        "asset_id": asset_id,
                        "side": "front",
                        "survey_id": SURVEY_ID,
                        "width": 10,
                        "height": 10,
                        "mime": "image/png",
                        "uploaded_at": "2026-06-30T00:00:00Z",
                    },
                    "back": None,
                },
            },
        },
    )

    res = public_client.get(f"/s/{TOKEN}/packaging-image/front")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/png")
    mock_stream.assert_awaited_once_with(asset_id)
