"""Phase 6 — trial media lifecycle, scan hooks, and cleanup."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId

from backend.services.product_test_media_lifecycle import (
    cleanup_abandoned_trial_media,
    extract_media_asset_ids_from_answers,
    finalize_trial_media_on_submit,
)
from backend.services.product_test_media_scanner import (
    ensure_analyst_scan_clear,
    initial_scan_status,
    scan_trial_media_asset,
)
from backend.services.product_test_media_asset_service import ProductTestMediaAssetError
from backend.trial_media_capture.constants import LIFECYCLE_PENDING, SCAN_QUARANTINED, SCAN_SKIPPED


def test_extract_media_asset_ids_from_answers():
    answers = {
        "__structured": {
            "product_test": {
                "flat_evaluations": [
                    {
                        "module": "trial_media_capture",
                        "value": {
                            "asset_id": "abc123",
                            "media_type": "image",
                        },
                    }
                ]
            }
        }
    }
    assert extract_media_asset_ids_from_answers(answers) == {"abc123"}


@pytest.mark.asyncio
async def test_finalize_trial_media_on_submit_marks_submitted():
    col = MagicMock()
    col.find_one = AsyncMock(return_value={
        "asset_id": "abc123",
        "token": "TOK1",
        "scan_status": "skipped",
    })
    col.update_one = AsyncMock()

    answers = {
        "__structured": {
            "product_test": {
                "flat_evaluations": [
                    {"value": {"asset_id": "abc123", "media_type": "image"}},
                ]
            }
        }
    }

    with patch("backend.services.product_test_media_asset_service._assets_collection", return_value=col):
        stats = await finalize_trial_media_on_submit("TOK1", answers)

    assert stats["finalized"] == 1
    col.update_one.assert_awaited()


@pytest.mark.asyncio
async def test_cleanup_abandoned_trial_media_dry_run():
    old = datetime.now(timezone.utc) - timedelta(hours=48)
    assets_col = MagicMock()
    assets_col.find = MagicMock(return_value=MagicMock(
        limit=MagicMock(return_value=MagicMock(
            to_list=AsyncMock(return_value=[{
                "asset_id": str(ObjectId()),
                "token": "TOK1",
                "lifecycle_state": LIFECYCLE_PENDING,
                "uploaded_at": old,
            }])
        ))
    ))

    tokens_col = MagicMock()
    tokens_col.find = MagicMock(return_value=MagicMock(
        to_list=AsyncMock(return_value=[])
    ))

    responses_col = MagicMock()
    responses_col.find_one = AsyncMock(return_value=None)

    def get_col(name):
        if name == "product_test_media_assets":
            return assets_col
        if name == "tokens":
            return tokens_col
        if name == "responses":
            return responses_col
        return MagicMock()

    with patch("backend.services.product_test_media_lifecycle.db.get_collection", side_effect=get_col):
        stats = await cleanup_abandoned_trial_media(dry_run=True, abandoned_ttl_hours=24)

    assert stats["dry_run"] is True
    assert stats["deleted_count"] == 1


def test_initial_scan_status_defaults_skipped():
    with patch("backend.services.product_test_media_scanner.settings") as mock_settings:
        mock_settings.PRODUCT_TEST_MEDIA_SCAN_ENABLED = False
        assert initial_scan_status() == SCAN_SKIPPED


@pytest.mark.asyncio
async def test_ensure_analyst_scan_clear_blocks_quarantined():
    with pytest.raises(ProductTestMediaAssetError) as exc:
        await ensure_analyst_scan_clear({"scan_status": SCAN_QUARANTINED})
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_scan_hook_stub_clean_when_enabled():
    with patch("backend.services.product_test_media_scanner.settings") as mock_settings:
        mock_settings.PRODUCT_TEST_MEDIA_SCAN_ENABLED = True
        mock_settings.PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN = True
        result = await scan_trial_media_asset({"asset_id": "x"}, asset_id="x")
        assert result.status == "clean"
