"""
Product test flat evaluation value classification.

Shared by analytics, exports, and admin review — keeps media references out of
numeric score aggregations while preserving them in detail views.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional, Tuple

ProductTestValueKind = Literal[
    "scalar_numeric",
    "scalar_text",
    "media_reference",
    "packaging_heatmap",
    "open_end",
    "unknown",
]

TRIAL_MEDIA_MODULE = "trial_media_capture"
PACKAGING_HEATMAP_MODULE = "packaging_heatmap"


def is_product_test_media_reference(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    asset_id = value.get("asset_id")
    media_type = value.get("media_type")
    return bool(asset_id) and media_type in ("image", "video")


def classify_product_test_evaluation_value(
    value: Any,
    *,
    module: Optional[str] = None,
    question_type: Optional[str] = None,
) -> ProductTestValueKind:
    if module == TRIAL_MEDIA_MODULE or question_type == "media-upload":
        return "media_reference" if is_product_test_media_reference(value) else "unknown"

    if module == PACKAGING_HEATMAP_MODULE:
        return "packaging_heatmap"

    if value is None:
        return "unknown"

    if isinstance(value, bool):
        return "unknown"

    if isinstance(value, (int, float)):
        return "scalar_numeric"

    if isinstance(value, str):
        return "scalar_text" if value.strip() else "unknown"

    if isinstance(value, dict):
        if is_product_test_media_reference(value):
            return "media_reference"
        if "text" in value or "voice_feedback_id" in value:
            return "open_end"
        if any(key in value for key in ("clicks", "regions", "image_side")):
            return "packaging_heatmap"

    return "unknown"


def is_scalar_product_test_value_kind(kind: ProductTestValueKind) -> bool:
    return kind in ("scalar_numeric", "scalar_text")


def is_numeric_score_product_test_value_kind(kind: ProductTestValueKind) -> bool:
    return kind == "scalar_numeric"


def should_exclude_from_numeric_aggregation(kind: ProductTestValueKind) -> bool:
    return kind in ("media_reference", "packaging_heatmap", "open_end", "unknown")


def resolve_row_value_kind(row: Dict[str, Any]) -> ProductTestValueKind:
    """Prefer stored value_kind; fall back to runtime classification."""
    stored = row.get("value_kind")
    if isinstance(stored, str) and stored:
        return stored  # type: ignore[return-value]
    return classify_product_test_evaluation_value(
        row.get("value"),
        module=row.get("module"),
        question_type=row.get("question_type"),
    )


def extract_media_reference_fields(value: Any) -> Tuple[Optional[str], Optional[str]]:
    if not is_product_test_media_reference(value):
        return None, None
    return str(value.get("asset_id")), value.get("media_type")
