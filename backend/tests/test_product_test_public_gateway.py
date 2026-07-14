"""Unit tests for product test public gateway helpers."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from backend.services.product_test_public_gateway import (
    ensure_product_test_in_sequence,
    is_product_test_survey,
    prepare_layer2_for_public,
    resolve_default_selected_modules,
    resolve_product_test_snapshot_for_respondent,
    snapshot_has_content,
)

SAMPLE_SNAPSHOT = {
    "version": 1,
    "language": "en",
    "phases": [{"timing": "before_use", "label": "Before Use", "sections": []}],
    "meta": {"totalQuestions": 2, "sectionCount": 1, "phaseCount": 1, "generatedAt": "2026-01-01"},
}


def test_is_product_test_survey_by_type():
    assert is_product_test_survey({"type": "product_test"}) is True
    assert is_product_test_survey({"type": "taste_test"}) is False


def test_is_product_test_survey_by_module_sequence():
    assert is_product_test_survey({"module_sequence": ["screening", "product_test"]}) is True


def test_resolve_default_selected_modules_product_test():
    mods = resolve_default_selected_modules({"type": "product_test"})
    assert mods == ["screening", "product_test"]


def test_resolve_default_selected_modules_taste_test():
    mods = resolve_default_selected_modules({"type": "taste_test"})
    assert mods == ["screening", "taste_test"]


def test_ensure_product_test_in_sequence():
    mods, seq = ensure_product_test_in_sequence(
        ["screening"], ["screening"], {"type": "product_test"}
    )
    assert "product_test" in mods
    assert "product_test" in seq


def test_prepare_layer2_strips_product_test_sections():
    l2 = {
        "sections": [
            {"module": "product_test", "title": "PT"},
            {"module": "taste_test", "title": "TT"},
        ]
    }
    stripped = prepare_layer2_for_public({"type": "product_test"}, l2)
    assert len(stripped["sections"]) == 1
    assert stripped["sections"][0]["module"] == "taste_test"


@pytest.mark.asyncio
async def test_resolve_snapshot_uses_stored_snapshot():
    orch = MagicMock()
    survey = {
        "type": "product_test",
        "product_test_snapshot": SAMPLE_SNAPSHOT,
    }
    result = await resolve_product_test_snapshot_for_respondent(survey, orchestration_service=orch)
    assert result == SAMPLE_SNAPSHOT
    orch.compose_product_test_snapshot.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_snapshot_runtime_compose_fallback():
    orch = MagicMock()
    orch.compose_product_test_snapshot = AsyncMock(return_value=SAMPLE_SNAPSHOT)
    survey = {
        "type": "product_test",
        "product_test_config": {"language": "en"},
    }
    result = await resolve_product_test_snapshot_for_respondent(survey, orchestration_service=orch)
    assert result == SAMPLE_SNAPSHOT
    orch.compose_product_test_snapshot.assert_awaited_once()


@pytest.mark.asyncio
async def test_resolve_snapshot_raises_503_on_empty_bank():
    orch = MagicMock()
    orch.compose_product_test_snapshot = AsyncMock(return_value={
        "version": 1,
        "language": "en",
        "phases": [],
        "meta": {"totalQuestions": 0, "sectionCount": 0, "phaseCount": 0},
    })
    survey = {"type": "product_test", "product_test_config": {"language": "en"}}

    with pytest.raises(HTTPException) as exc:
        await resolve_product_test_snapshot_for_respondent(survey, orchestration_service=orch)
    assert exc.value.status_code == 503
    assert "DATA_LAYER.md" in exc.value.detail


@pytest.mark.asyncio
async def test_resolve_snapshot_returns_none_for_non_product_test():
    orch = MagicMock()
    result = await resolve_product_test_snapshot_for_respondent(
        {"type": "taste_test"}, orchestration_service=orch
    )
    assert result is None


@pytest.mark.asyncio
async def test_resolve_snapshot_applies_runtime_brand_fallback_on_legacy_stored():
    legacy_snapshot = {
        "version": 1,
        "language": "en",
        "phases": [
            {
                "timing": "before_use",
                "sections": [
                    {
                        "id": "s1",
                        "module": "product_test",
                        "questions": [{"id": "pt_q01", "text": "Product Look"}],
                    }
                ],
            }
        ],
        "meta": {"totalQuestions": 1},
    }
    survey = {
        "type": "product_test",
        "product_test_snapshot": legacy_snapshot,
        "taste_test_config": {
            "own_brand": "Own Brand",
            "internal_brands_data": [{"name": "Own Brand"}],
            "testing_protocol": "blind",
            "blind_codes": {"Own Brand": "SAMPLE-A"},
        },
    }
    orch = MagicMock()
    result = await resolve_product_test_snapshot_for_respondent(survey, orchestration_service=orch)
    assert result is not None
    assert result["brand_context"]["brands"] == ["Own Brand"]
    assert result["brand_context"]["_source"] == "runtime_fallback"
    orch.compose_product_test_snapshot.assert_not_called()


@pytest.mark.asyncio
async def test_resolve_snapshot_migrates_legacy_l2():
    legacy_l2 = {
        "sections": [
            {
                "module": "product_test",
                "title": "Appearance",
                "questions": [
                    {
                        "id": "pt_q01",
                        "text": "Product Look",
                        "type": "scale",
                        "timing": "before_use",
                        "diagnostic_tag": "PF",
                    }
                ],
            }
        ]
    }
    survey = {
        "type": "product_test",
        "template_snapshot_l2": legacy_l2,
        "product_test_config": {"language": "en"},
    }
    orch = MagicMock()
    result = await resolve_product_test_snapshot_for_respondent(survey, orchestration_service=orch)
    assert result is not None
    assert result["phases"]
    assert result["meta"]["totalQuestions"] >= 1
    orch.compose_product_test_snapshot.assert_not_called()


def test_snapshot_has_content():
    assert snapshot_has_content(SAMPLE_SNAPSHOT) is True
    assert snapshot_has_content({"phases": [], "meta": {"totalQuestions": 0}}) is False
