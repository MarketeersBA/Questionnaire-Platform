"""Structured rejection codes and responses for live AI/MI follow-up."""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import Any, Optional

logger = logging.getLogger(__name__)


class FollowUpRejectionCode(StrEnum):
    """Machine-readable gate outcomes for POST /s/{token}/followup."""

    AI_DISABLED = "ai_disabled"
    TEXT_CHANNEL_DISABLED = "text_channel_disabled"
    VOICE_CHANNEL_DISABLED = "voice_channel_disabled"
    CATEGORY_DISABLED = "category_disabled"
    SURFACE_UNKNOWN = "surface_unknown"
    SURFACE_DISABLED = "surface_disabled"
    NON_PROBE_CATEGORY = "non_probe_category"
    NON_OPEN_END_SCHEMA = "non_open_end_schema"
    QUESTION_INELIGIBLE = "question_ineligible"
    ANSWER_TOO_SHORT = "answer_too_short"
    MAX_ROUNDS_EXCEEDED = "max_rounds_exceeded"
    ENGINE_INFRA_FAILURE = "engine_infra_failure"


_COMPLETE_BODY = {
    "action": "complete",
    "followup_text": None,
    "key_insights": [],
}


def build_followup_complete_response(
    *,
    rejection_code: FollowUpRejectionCode,
    reasoning: str,
) -> dict[str, Any]:
    """Standard complete response with diagnostic fields for respondent clients."""
    return {
        **_COMPLETE_BODY,
        "rejection_code": rejection_code.value,
        "reasoning": reasoning,
    }


def log_followup_rejection(
    *,
    token: str,
    question_id: str,
    rejection_code: FollowUpRejectionCode,
    reasoning: str,
    respondent_surface: Optional[str] = None,
    source: Optional[str] = None,
    current_round: Optional[int] = None,
) -> None:
    logger.info(
        "AI follow-up rejected token=%s question_id=%s code=%s surface=%s source=%s round=%s reason=%s",
        token,
        question_id,
        rejection_code.value,
        respondent_surface,
        source,
        current_round,
        reasoning,
    )


def is_engine_infra_failure(reasoning: Optional[str]) -> bool:
    if not reasoning:
        return False
    lower = reasoning.lower()
    return (
        "openai api key" in lower
        or "quota" in lower
        or "backend exception" in lower
        or "exception" in lower
    )


def annotate_engine_infra_failure(result: dict[str, Any]) -> dict[str, Any]:
    """Tag engine soft-complete responses that indicate infrastructure failure."""
    if result.get("action") != "complete":
        return result
    reasoning = result.get("reasoning")
    if not is_engine_infra_failure(reasoning):
        return result
    return {
        **result,
        "rejection_code": FollowUpRejectionCode.ENGINE_INFRA_FAILURE.value,
    }
