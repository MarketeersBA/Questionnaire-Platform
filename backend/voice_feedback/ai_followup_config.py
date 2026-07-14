"""Normalize persisted AI/MI follow-up config for runtime and public respondent payloads."""

from __future__ import annotations

from typing import Any, Optional

from backend.models import AiFollowupConfig

# Default open-end surfaces for newly created surveys (mirrors frontend DEFAULT_AI_FOLLOWUP).
DEFAULT_PROBE_ELIGIBLE_SURFACES: tuple[str, ...] = (
    "taste_l2_open_end",
    "product_test_open_end",
)


def normalize_ai_followup_config(raw: Optional[dict[str, Any]]) -> dict[str, Any]:
    """
    Merge legacy/partial survey ai_followup documents with model defaults.

    Ensures respondent clients always receive stable advanced fields
    (min_answer_length, dedupe_window_ms, channel flags, max_rounds) even when
    older surveys only persisted is_enabled.
    """
    defaults = AiFollowupConfig().model_dump()
    if not raw:
        return defaults

    merged: dict[str, Any] = {**defaults}
    for key, value in raw.items():
        if value is not None:
            merged[key] = value

    cfg = AiFollowupConfig.model_validate(merged)
    return cfg.model_dump()


def resolve_public_ai_followup(survey: dict[str, Any]) -> dict[str, Any]:
    """Resolved ai_followup block for GET /s/{token} respondent payloads."""
    return normalize_ai_followup_config(survey.get("ai_followup"))


def resolve_runtime_ai_followup(survey: dict[str, Any]) -> dict[str, Any]:
    """Resolved ai_followup for server-side follow-up gate evaluation."""
    return normalize_ai_followup_config(survey.get("ai_followup"))
