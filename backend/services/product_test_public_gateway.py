"""
Public respondent gateway helpers for product test surveys.

Resolves product_test_snapshot with stored → legacy L2 migration → runtime compose fallback.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from backend.services.product_test_orchestration import (
    migrate_legacy_l2_to_product_test_snapshot,
    resolve_orchestration_language,
    strip_product_test_from_l2,
)
from backend.services.product_test_snapshot_migration import (
    apply_runtime_brand_fallback_to_snapshot,
)

PRODUCT_TEST_BANK_DOCS = "docs/data/product-test-data-layer.md"


def is_product_test_survey(survey: Dict[str, Any]) -> bool:
    """True when survey is configured to run the product test module."""
    if survey.get("type") == "product_test":
        return True
    modules = set(survey.get("selected_modules") or [])
    modules.update(survey.get("module_sequence") or [])
    return "product_test" in modules


def resolve_default_selected_modules(survey: Dict[str, Any]) -> List[str]:
    """Default module list when survey has no explicit selected_modules."""
    stored = survey.get("selected_modules")
    if stored:
        return list(stored)

    survey_type = survey.get("type")
    if survey_type == "taste_test":
        return ["screening", "taste_test"]
    if survey_type == "product_test":
        return ["screening", "product_test"]
    return ["screening"]


def ensure_product_test_in_sequence(
    selected_mods: List[str],
    mod_sequence: List[str],
    survey: Dict[str, Any],
) -> Tuple[List[str], List[str]]:
    """Ensure product_test appears in modules/sequence for product_test surveys."""
    if not is_product_test_survey(survey):
        return selected_mods, mod_sequence

    mods = list(selected_mods)
    sequence = list(mod_sequence)

    if "product_test" not in mods:
        mods.append("product_test")
    if "product_test" not in sequence:
        insert_at = sequence.index("screening") + 1 if "screening" in sequence else 0
        sequence.insert(insert_at, "product_test")

    return mods, sequence


def snapshot_has_content(snapshot: Optional[Dict[str, Any]]) -> bool:
    if not snapshot or not isinstance(snapshot, dict):
        return False
    meta = snapshot.get("meta") or {}
    if meta.get("totalQuestions", 0) > 0:
        return True
    for phase in snapshot.get("phases") or []:
        for section in phase.get("sections") or []:
            if section.get("questions"):
                return True
    return False


def _empty_bank_detail() -> str:
    return (
        "Product test question bank is empty or not seeded. "
        f"See {PRODUCT_TEST_BANK_DOCS} for setup instructions."
    )


def _enrich_respondent_snapshot(
    snapshot: Dict[str, Any],
    survey: Dict[str, Any],
) -> Dict[str, Any]:
    """Apply runtime brand fallback and ensure packaging / trial media meta is present."""
    from backend.packaging_heatmap.snapshot import enrich_snapshot_with_packaging_heatmap_meta
    from backend.trial_media_capture.snapshot import enrich_snapshot_with_trial_media_capture_meta

    enriched = apply_runtime_brand_fallback_to_snapshot(snapshot, survey)
    pt_config = survey.get("product_test_config") or {}
    enriched = enrich_snapshot_with_packaging_heatmap_meta(enriched, pt_config)
    return enrich_snapshot_with_trial_media_capture_meta(enriched, pt_config)


def build_respondent_survey_config(
    survey: Dict[str, Any],
    product_test_snapshot: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Normalize respondent config for product_test (and shared taste_test shell).
    Merges snapshot brand_context with taste_test_config / survey top-level fields.
    """
    tt_config = survey.get("taste_test_config") or {}
    pt_config = survey.get("product_test_config") or {}
    snapshot_ctx = (product_test_snapshot or survey.get("product_test_snapshot") or {}).get("brand_context") or {}

    internal = survey.get("internal_brands_data") or tt_config.get("internal_brands_data") or []
    competitor = survey.get("competitor_brands_data") or tt_config.get("competitor_brands_data") or []

    own_brand = (
        snapshot_ctx.get("own_brand")
        or tt_config.get("own_brand")
        or survey.get("own_brand")
    )

    return {
        "category": (
            snapshot_ctx.get("category")
            or pt_config.get("category")
            or tt_config.get("category")
            or (survey.get("customizations") or {}).get("category")
            or ""
        ),
        "testing_protocol": (
            snapshot_ctx.get("testing_protocol")
            or tt_config.get("testing_protocol")
            or "branded"
        ),
        "blind_codes": (
            snapshot_ctx.get("blind_codes")
            or tt_config.get("blind_codes")
            or {}
        ),
        "own_brand": own_brand,
        "internal_brands_data": internal,
        "competitor_brands_data": competitor,
    }


async def resolve_product_test_snapshot_for_respondent(
    survey: Dict[str, Any],
    *,
    orchestration_service: Any,
) -> Optional[Dict[str, Any]]:
    """
    Resolve product_test_snapshot for public GET.

    Priority:
      1. survey.product_test_snapshot (if non-empty)
      2. migrate from template_snapshot_l2 PT sections
      3. runtime compose via orchestration_service.compose_product_test_snapshot

    Returns None when survey is not a product test study.
    Raises HTTP 503 when product test is expected but bank yields no questions.
    """
    if not is_product_test_survey(survey):
        return None

    language = resolve_orchestration_language(survey)

    stored = survey.get("product_test_snapshot")
    if snapshot_has_content(stored):
        return _enrich_respondent_snapshot(stored, survey)

    legacy_l2 = survey.get("template_snapshot_l2")
    migrated = migrate_legacy_l2_to_product_test_snapshot(legacy_l2, language)
    if snapshot_has_content(migrated):
        return _enrich_respondent_snapshot(migrated, survey)

    pt_config = survey.get("product_test_config") or {}
    composed = await orchestration_service.compose_product_test_snapshot(pt_config, language, survey)
    if snapshot_has_content(composed):
        return composed

    raise HTTPException(
        status_code=503,
        detail=_empty_bank_detail(),
    )


def resolve_respondent_language(survey: Dict[str, Any]) -> str:
    """Language for respondent UI — product test config takes precedence."""
    return resolve_orchestration_language(survey)


def prepare_layer2_for_public(survey: Dict[str, Any], l2_content: Dict[str, Any]) -> Dict[str, Any]:
    """Strip product/package test sections from L2 — taste test only on public gateway."""
    if is_product_test_survey(survey):
        return strip_product_test_from_l2(l2_content)
    return l2_content or {"sections": []}
