"""
Product test analytics helpers — attribute registry and response extraction.

Stable schema for filtering __structured.product_test.flat_evaluations.
Brand-aware buckets align with frontend productTestAnalytics.ts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.services.product_test_value_classification import (
    TRIAL_MEDIA_MODULE,
    is_numeric_score_product_test_value_kind,
    is_scalar_product_test_value_kind,
    resolve_row_value_kind,
)

PRODUCT_TEST_UNSCOPED_BRAND_KEY = "__unscoped__"


def resolve_canonical_question_id(question_id: str, brand_key: Optional[str]) -> str:
    if brand_key and question_id.startswith(f"{brand_key}_"):
        return question_id[len(brand_key) + 1 :]
    return question_id


def brand_key_for_analytics(brand: Optional[str]) -> str:
    if brand and str(brand).strip():
        return str(brand).strip()
    return PRODUCT_TEST_UNSCOPED_BRAND_KEY


def evaluation_matches_brand(row: Dict[str, Any], brand_key: str) -> bool:
    row_brand = row.get("brand")
    if brand_key == PRODUCT_TEST_UNSCOPED_BRAND_KEY:
        return not (row_brand and str(row_brand).strip())
    return row_brand == brand_key


def build_attribute_registry_from_snapshot(
    snapshot: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Build question registry from product_test_snapshot phases."""
    if not snapshot or not isinstance(snapshot, dict):
        return []

    entries: List[Dict[str, Any]] = []
    for phase in snapshot.get("phases") or []:
        timing = phase.get("timing")
        for section in phase.get("sections") or []:
            section_id = section.get("id")
            section_title = section.get("title")
            module = section.get("module")
            section_brand = section.get("brand")
            for question in section.get("questions") or []:
                brand = section_brand or question.get("brand")
                question_id = question.get("id")
                entries.append({
                    "question_id": question_id,
                    "brand": brand,
                    "canonical_question_id": (
                        question.get("canonicalQuestionId")
                        or resolve_canonical_question_id(question_id or "", brand)
                    ),
                    "section_id": section_id,
                    "section_title": section_title,
                    "timing": timing,
                    "module": module,
                    "diagnostic_tag": question.get("diagnostic_tag"),
                    "question_text": question.get("text"),
                    "question_type": question.get("type"),
                })
    return [e for e in entries if e.get("question_id")]


def extract_product_test_flat_evaluations(
    response_answers: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Pull flat_evaluations from a stored response answers blob."""
    structured = response_answers.get("__structured") or {}
    product_test = structured.get("product_test") or {}
    return list(product_test.get("flat_evaluations") or [])


def filter_evaluations_by_timing(
    evaluations: List[Dict[str, Any]],
    timing: str,
) -> List[Dict[str, Any]]:
    return [e for e in evaluations if e.get("timing") == timing]


def filter_evaluations_by_diagnostic_tag(
    evaluations: List[Dict[str, Any]],
    tag: str,
) -> List[Dict[str, Any]]:
    return [e for e in evaluations if e.get("diagnostic_tag") == tag]


def filter_evaluations_by_brand(
    evaluations: List[Dict[str, Any]],
    brand_key: str,
) -> List[Dict[str, Any]]:
    return [e for e in evaluations if evaluation_matches_brand(e, brand_key)]


def filter_evaluations_by_module(
    evaluations: List[Dict[str, Any]],
    module: str,
) -> List[Dict[str, Any]]:
    return [e for e in evaluations if e.get("module") == module]


def filter_trial_media_evaluations(
    evaluations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Rows whose value is a trial media asset reference."""
    return [
        row for row in evaluations
        if row.get("module") == TRIAL_MEDIA_MODULE
        or resolve_row_value_kind(row) == "media_reference"
    ]


def filter_scalar_evaluations(
    evaluations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Rows eligible for numeric / scalar score aggregations."""
    return [
        row for row in evaluations
        if is_scalar_product_test_value_kind(resolve_row_value_kind(row))
    ]


def filter_numeric_score_evaluations(
    evaluations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Rows with numeric scores only (excludes text scalars)."""
    return [
        row for row in evaluations
        if is_numeric_score_product_test_value_kind(resolve_row_value_kind(row))
    ]


def summarize_trial_media_responses(
    responses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Aggregate trial media uploads across stored responses."""
    by_media_type: Dict[str, int] = {}
    by_timing: Dict[str, int] = {}
    total_bytes = 0
    total_duration_seconds = 0.0
    duration_count = 0
    responses_with_media = 0
    upload_count = 0

    for response in responses:
        answers = response.get("answers") or {}
        rows = filter_trial_media_evaluations(extract_product_test_flat_evaluations(answers))
        if not rows:
            continue

        responses_with_media += 1
        for row in rows:
            value = row.get("value")
            if not isinstance(value, dict):
                continue

            upload_count += 1
            media_type = str(value.get("media_type") or "unknown")
            timing = row.get("timing") or "unknown"
            by_media_type[media_type] = by_media_type.get(media_type, 0) + 1
            by_timing[timing] = by_timing.get(timing, 0) + 1

            size_bytes = value.get("size_bytes")
            if isinstance(size_bytes, (int, float)):
                total_bytes += int(size_bytes)

            duration = value.get("duration_seconds")
            if isinstance(duration, (int, float)):
                total_duration_seconds += float(duration)
                duration_count += 1

    return {
        "response_count": len(responses),
        "responses_with_media": responses_with_media,
        "upload_count": upload_count,
        "by_media_type": by_media_type,
        "by_timing": by_timing,
        "total_bytes": total_bytes,
        "avg_duration_seconds": (
            round(total_duration_seconds / duration_count, 2) if duration_count else None
        ),
    }


def summarize_product_test_responses(
    responses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Aggregate counts by timing, diagnostic tag, module, and brand across responses."""
    by_timing: Dict[str, int] = {}
    by_tag: Dict[str, int] = {}
    by_module: Dict[str, int] = {}
    by_brand: Dict[str, Dict[str, Any]] = {}
    scalar_by_timing: Dict[str, int] = {}
    scalar_by_tag: Dict[str, int] = {}
    total_answers = 0
    scalar_answer_count = 0
    media_reference_count = 0

    for response in responses:
        answers = response.get("answers") or {}
        for row in extract_product_test_flat_evaluations(answers):
            total_answers += 1
            timing = row.get("timing") or "unknown"
            tag = row.get("diagnostic_tag") or "none"
            module = row.get("module") or "unknown"
            brand_bucket = brand_key_for_analytics(row.get("brand"))
            value_kind = resolve_row_value_kind(row)

            by_timing[timing] = by_timing.get(timing, 0) + 1
            by_tag[tag] = by_tag.get(tag, 0) + 1
            by_module[module] = by_module.get(module, 0) + 1

            if value_kind == "media_reference":
                media_reference_count += 1
            elif is_scalar_product_test_value_kind(value_kind):
                scalar_answer_count += 1
                scalar_by_timing[timing] = scalar_by_timing.get(timing, 0) + 1
                scalar_by_tag[tag] = scalar_by_tag.get(tag, 0) + 1

            existing = by_brand.get(brand_bucket)
            brand_display = row.get("brand_display")
            if existing:
                existing["count"] += 1
                if brand_display and str(brand_display).strip():
                    existing["brand_display"] = brand_display
            else:
                by_brand[brand_bucket] = {
                    "count": 1,
                    "brand_display": brand_display,
                }

    return {
        "response_count": len(responses),
        "total_answers": total_answers,
        "scalar_answer_count": scalar_answer_count,
        "media_reference_count": media_reference_count,
        "by_timing": by_timing,
        "by_diagnostic_tag": by_tag,
        "by_module": by_module,
        "by_brand": by_brand,
        "scalar_by_timing": scalar_by_timing,
        "scalar_by_diagnostic_tag": scalar_by_tag,
        "trial_media": summarize_trial_media_responses(responses),
    }


def resolve_product_test_attribute_registry_for_survey(
    survey_doc: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Stable Phase 5 attribute registry from snapshot (stored or legacy L2 migration).
    Used by reports / exports to filter __structured.product_test.flat_evaluations.
    """
    from backend.services.product_test_orchestration import (
        migrate_legacy_l2_to_product_test_snapshot,
        resolve_orchestration_language,
    )
    from backend.services.product_test_public_gateway import snapshot_has_content

    snapshot = survey_doc.get("product_test_snapshot")
    if not snapshot_has_content(snapshot):
        language = resolve_orchestration_language(survey_doc)
        snapshot = migrate_legacy_l2_to_product_test_snapshot(
            survey_doc.get("template_snapshot_l2"),
            language,
        )
    return build_attribute_registry_from_snapshot(snapshot)


def build_trial_media_download_path(survey_id: str, asset_id: str) -> str:
    """Relative authenticated API path for spreadsheet export links."""
    return f"/api/surveys/{survey_id}/product-test/media/{asset_id}/download"


def summarize_packaging_heatmap_responses(
    responses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Summarize packaging heatmap clicks across stored responses."""
    from backend.services.packaging_heatmap_analytics_service import (
        filter_packaging_heatmap_evaluations,
        extract_regions_from_evaluation,
        resolve_heatmap_side_intent,
    )

    by_side: Dict[str, int] = {}
    by_intent: Dict[str, int] = {}
    by_question: Dict[str, int] = {}
    total_clicks = 0
    responses_with_heatmap = 0

    for response in responses:
        answers = response.get("answers") or {}
        rows = filter_packaging_heatmap_evaluations(
            extract_product_test_flat_evaluations(answers),
        )
        if not rows:
            continue

        responses_with_heatmap += 1
        for row in rows:
            regions = extract_regions_from_evaluation(row)
            if not regions:
                continue
            side, intent = resolve_heatmap_side_intent(row)
            question_id = row.get("question_id") or "unknown"
            total_clicks += len(regions)
            if side:
                by_side[side] = by_side.get(side, 0) + len(regions)
            if intent:
                by_intent[intent] = by_intent.get(intent, 0) + len(regions)
            by_question[question_id] = by_question.get(question_id, 0) + len(regions)

    return {
        "response_count": len(responses),
        "responses_with_heatmap": responses_with_heatmap,
        "total_clicks": total_clicks,
        "by_side": by_side,
        "by_intent": by_intent,
        "by_question": by_question,
    }
