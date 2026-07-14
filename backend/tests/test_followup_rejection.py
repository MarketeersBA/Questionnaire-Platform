"""Tests for structured AI follow-up rejection responses."""

from backend.voice_feedback.followup_rejection import (
    FollowUpRejectionCode,
    annotate_engine_infra_failure,
    build_followup_complete_response,
    is_engine_infra_failure,
)


def test_build_followup_complete_response_includes_code_and_reasoning():
    body = build_followup_complete_response(
        rejection_code=FollowUpRejectionCode.ANSWER_TOO_SHORT,
        reasoning="Answer shorter than minimum length (5).",
    )
    assert body["action"] == "complete"
    assert body["rejection_code"] == "answer_too_short"
    assert "minimum length" in body["reasoning"]


def test_annotate_engine_infra_failure_tags_quota():
    result = annotate_engine_infra_failure({
        "action": "complete",
        "reasoning": "AIGuard quota exhausted for smart follow-up.",
        "followup_text": None,
        "key_insights": [],
    })
    assert result["rejection_code"] == "engine_infra_failure"


def test_is_engine_infra_failure_detects_api_key():
    assert is_engine_infra_failure("OpenAI API key not configured.")
