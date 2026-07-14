"""Tests for AI follow-up config normalization."""

from backend.voice_feedback.ai_followup_config import (
    normalize_ai_followup_config,
    resolve_public_ai_followup,
)


def test_normalize_legacy_enabled_survey_merges_advanced_defaults():
    raw = {"is_enabled": True}
    cfg = normalize_ai_followup_config(raw)
    assert cfg["is_enabled"] is True
    assert cfg["max_rounds"] == 2
    assert cfg["apply_to_text"] is True
    assert cfg["apply_to_voice"] is True
    assert cfg["min_answer_length"] == 5
    assert cfg["dedupe_window_ms"] == 1000
    assert cfg["eligible_surfaces"] is None


def test_normalize_preserves_explicit_advanced_fields():
    raw = {
        "is_enabled": True,
        "eligible_surfaces": ["taste_l2_open_end"],
        "min_answer_length": 8,
        "dedupe_window_ms": 1500,
    }
    cfg = normalize_ai_followup_config(raw)
    assert cfg["eligible_surfaces"] == ["taste_l2_open_end"]
    assert cfg["min_answer_length"] == 8
    assert cfg["dedupe_window_ms"] == 1500


def test_resolve_public_ai_followup_from_survey_doc():
    survey = {"ai_followup": {"is_enabled": True, "max_rounds": 3}}
    cfg = resolve_public_ai_followup(survey)
    assert cfg["is_enabled"] is True
    assert cfg["max_rounds"] == 3
    assert cfg["min_answer_length"] == 5
