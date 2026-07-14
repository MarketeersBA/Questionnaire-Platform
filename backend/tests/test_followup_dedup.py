"""Tests for smart follow-up deduplication keys."""

from backend.voice_feedback.followup_dedup import build_followup_dedup_key


def test_dedup_key_stable_for_same_payload():
    kwargs = dict(
        survey_id="507f1f77bcf86cd799439011",
        token="abc123",
        question_id="BrandA_q1",
        current_round=1,
        source="text",
        answer_text="  It tastes creamy  ",
    )
    assert build_followup_dedup_key(**kwargs) == build_followup_dedup_key(**kwargs)


def test_dedup_key_changes_when_answer_changes():
    base = dict(
        survey_id="s1",
        token="t1",
        question_id="q1",
        current_round=1,
        source="text",
    )
    assert build_followup_dedup_key(**base, answer_text="sweet taste") != build_followup_dedup_key(
        **base, answer_text="bitter aftertaste"
    )


def test_dedup_key_changes_when_round_or_source_changes():
    base = dict(
        survey_id="s1",
        token="t1",
        question_id="q1",
        answer_text="same answer",
    )
    k1 = build_followup_dedup_key(**base, current_round=1, source="text")
    k2 = build_followup_dedup_key(**base, current_round=2, source="text")
    k3 = build_followup_dedup_key(**base, current_round=1, source="voice")
    assert len({k1, k2, k3}) == 3
