"""
Product test snapshot migration — lazy save, batch recompose, runtime display fallback.

Phase 5: brand-expand legacy snapshots that lack brand_context when Parameters carry brands.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from backend.services.product_test_orchestration import (
    build_product_test_brand_context,
    resolve_brands_from_survey_data,
    resolve_orchestration_category,
    resolve_orchestration_language,
)

RUNTIME_FALLBACK_MARKER = "runtime_fallback"


def _snapshot_has_content(snapshot: Optional[Dict[str, Any]]) -> bool:
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


def snapshot_has_brand_context(snapshot: Optional[Dict[str, Any]]) -> bool:
    if not snapshot or not isinstance(snapshot, dict):
        return False
    ctx = snapshot.get("brand_context")
    return bool(ctx and (ctx.get("brands") or []))


def survey_has_configured_brands(survey_data: Dict[str, Any]) -> bool:
    ctx = resolve_brands_from_survey_data(survey_data)
    return bool(ctx.get("brands"))


def snapshot_needs_brand_recompose(
    snapshot: Optional[Dict[str, Any]],
    survey_data: Dict[str, Any],
) -> bool:
    """
    True when a stored snapshot has content but no brand_context while Parameters define brands.
  Full re-compose (brand loop) is recommended over runtime fallback alone.
    """
    if not _snapshot_has_content(snapshot):
        return False
    if snapshot_has_brand_context(snapshot):
        return False
    return survey_has_configured_brands(survey_data)


def resolve_runtime_single_brand_context(survey_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Display-only fallback when snapshot lacks brand_context.
    Priority: configured brands → own_brand → explicit category from Parameters.
    """
    full = resolve_brands_from_survey_data(survey_data)
    brands = list(full.get("brands") or [])
    if brands:
        return full

    tt_config = survey_data.get("taste_test_config") or {}
    config = survey_data.get("config") or {}
    own_brand = (
        full.get("own_brand")
        or tt_config.get("own_brand")
        or survey_data.get("own_brand")
    )
    if (own_brand or "").strip():
        category = full.get("category") or resolve_orchestration_category(survey_data)
        return build_product_test_brand_context(
            brands=[own_brand.strip()],
            own_brand=own_brand.strip(),
            category=category,
            testing_protocol=full.get("testing_protocol", "branded"),
            blind_codes=full.get("blind_codes") or {},
        )

    explicit_category = (
        (tt_config.get("category") or "").strip()
        or (config.get("category") or "").strip()
        or (survey_data.get("customizations") or {}).get("category", "").strip()
    )
    if explicit_category:
        return build_product_test_brand_context(
            brands=[explicit_category],
            category=explicit_category,
            testing_protocol=full.get("testing_protocol", "branded"),
            blind_codes=full.get("blind_codes") or {},
        )

    return None


def apply_runtime_brand_fallback_to_snapshot(
    snapshot: Dict[str, Any],
    survey_data: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Inject synthetic brand_context for respondent display when snapshot is legacy.
    Does not mutate scoped question IDs — regenerate snapshot for full brand loop.
    """
    if snapshot_has_brand_context(snapshot):
        return snapshot

    fallback_ctx = resolve_runtime_single_brand_context(survey_data)
    if not fallback_ctx:
        return snapshot

    result = dict(snapshot)
    result["brand_context"] = {
        **fallback_ctx,
        "_source": RUNTIME_FALLBACK_MARKER,
    }
    return result


async def ensure_brand_aware_product_test_snapshot(
    survey_data: Dict[str, Any],
    orchestration_service: Any,
    *,
    current_snapshot: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """
    Lazy on save: re-compose snapshot with brand loop when legacy snapshot meets brand Parameters.
    """
    snapshot = current_snapshot if current_snapshot is not None else survey_data.get("product_test_snapshot")
    if not snapshot_needs_brand_recompose(snapshot, survey_data):
        return snapshot

    pt_config = survey_data.get("product_test_config") or {}
    language = resolve_orchestration_language(survey_data)
    recomposed = await orchestration_service.compose_product_test_snapshot(
        pt_config, language, survey_data,
    )
    if _snapshot_has_content(recomposed):
        return recomposed
    return snapshot
