"""Tests for product test snapshot migration (Phase 5)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.services.product_test_snapshot_migration import (
    RUNTIME_FALLBACK_MARKER,
    apply_runtime_brand_fallback_to_snapshot,
    ensure_brand_aware_product_test_snapshot,
    resolve_runtime_single_brand_context,
    snapshot_needs_brand_recompose,
)

LEGACY_SNAPSHOT = {
    "version": 1,
    "language": "en",
    "phases": [
        {
            "timing": "before_use",
            "label": "Before Use",
            "sections": [
                {
                    "id": "s1",
                    "title": "Appearance",
                    "module": "product_test",
                    "questions": [{"id": "pt_q01", "text": "Product Look", "type": "scale"}],
                }
            ],
        }
    ],
    "meta": {"totalQuestions": 1, "sectionCount": 1, "phaseCount": 1},
}

SURVEY_WITH_BRANDS = {
    "type": "product_test",
    "taste_test_config": {
        "own_brand": "Own Brand",
        "internal_brands_data": [{"name": "Own Brand"}],
        "competitor_brands_data": [{"name": "Competitor X"}],
        "category": "Foam",
        "testing_protocol": "blind",
        "blind_codes": {"Own Brand": "SAMPLE-A"},
    },
    "product_test_config": {"language": "en"},
}

BRAND_EXPANDED_SNAPSHOT = {
    "version": 1,
    "language": "en",
    "brand_context": {"brands": ["Own Brand", "Competitor X"], "category": "Foam"},
    "phases": [
        {
            "timing": "before_use",
            "sections": [
                {"brand": "Own Brand", "questions": [{"id": "Own Brand_pt_q01"}]},
                {"brand": "Competitor X", "questions": [{"id": "Competitor X_pt_q01"}]},
            ],
        }
    ],
    "meta": {"totalQuestions": 2, "brandCount": 2},
}


def test_snapshot_needs_brand_recompose():
    assert snapshot_needs_brand_recompose(LEGACY_SNAPSHOT, SURVEY_WITH_BRANDS) is True
    assert snapshot_needs_brand_recompose(BRAND_EXPANDED_SNAPSHOT, SURVEY_WITH_BRANDS) is False


def test_resolve_runtime_single_brand_context_own_brand():
    ctx = resolve_runtime_single_brand_context(SURVEY_WITH_BRANDS)
    assert "Own Brand" in ctx["brands"]
    assert ctx["testing_protocol"] == "blind"


def test_apply_runtime_brand_fallback_to_snapshot():
    result = apply_runtime_brand_fallback_to_snapshot(LEGACY_SNAPSHOT, SURVEY_WITH_BRANDS)
    assert result["brand_context"]["_source"] == RUNTIME_FALLBACK_MARKER
    assert result["phases"] == LEGACY_SNAPSHOT["phases"]


@pytest.mark.asyncio
async def test_ensure_brand_aware_product_test_snapshot_lazy_recompose():
    orch = MagicMock()
    orch.compose_product_test_snapshot = AsyncMock(return_value=BRAND_EXPANDED_SNAPSHOT)

    result = await ensure_brand_aware_product_test_snapshot(
        SURVEY_WITH_BRANDS,
        orch,
        current_snapshot=LEGACY_SNAPSHOT,
    )
    assert result["brand_context"]["brands"] == ["Own Brand", "Competitor X"]
    orch.compose_product_test_snapshot.assert_awaited_once()
