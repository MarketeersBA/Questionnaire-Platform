"""Unit tests for trial media capture snapshot builders."""

from backend.trial_media_capture.snapshot import (
    TRIAL_MEDIA_CANONICAL_QUESTION_ID,
    TRIAL_MEDIA_SECTION_ID,
    append_trial_media_capture_to_phases,
    build_trial_media_capture_snapshot_meta,
)
from backend.services.product_test_orchestration import build_product_test_snapshot


def _enabled_trial_media(**overrides):
    base = {
        "enabled": True,
        "accepted_media": "image_or_video",
        "required": False,
        "timing": "after_use",
        "prompt_en": "Upload media",
        "prompt_ar": "ارفع وسائط",
        "max_video_duration_seconds": 60,
        "max_image_mb": 5,
        "max_video_mb": 25,
    }
    base.update(overrides)
    return base


def test_build_trial_media_capture_snapshot_meta_disabled():
    assert build_trial_media_capture_snapshot_meta({"trial_media_capture": {"enabled": False}}) is None


def test_append_trial_media_injects_question_into_after_use():
    bank = [{
        "question_id": "pt_q08",
        "attribute": "Ease",
        "attribute_type": "sub",
        "parent_attribute": "Prep",
        "question_type": "scale 1-5",
        "en_text": "Ease",
        "timing": "During Use",
        "question_status": "fixed",
    }]
    pt_config = {"trial_media_capture": _enabled_trial_media()}
    snapshot = build_product_test_snapshot(pt_config, bank, [], "en")

    assert snapshot["meta"]["totalQuestions"] == 2
    assert snapshot["meta"]["trial_media_capture"]["question_id"] == TRIAL_MEDIA_CANONICAL_QUESTION_ID

    after_phase = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    media_section = next(s for s in after_phase["sections"] if s["id"] == TRIAL_MEDIA_SECTION_ID)
    assert media_section["module"] == "trial_media_capture"
    assert media_section["questions"][0]["type"] == "media-upload"
    assert media_section["questions"][0]["id"] == TRIAL_MEDIA_CANONICAL_QUESTION_ID


def test_append_trial_media_creates_during_use_phase_when_missing():
    bank = [{
        "question_id": "pt_q01",
        "attribute": "Look",
        "attribute_type": "sub",
        "parent_attribute": "Appearance",
        "question_type": "scale 1-5",
        "en_text": "Look",
        "timing": "Before Use",
        "question_status": "fixed",
    }]
    pt_config = {"trial_media_capture": _enabled_trial_media(timing="during_use")}
    snapshot = build_product_test_snapshot(pt_config, bank, [], "en")

    during_phase = next(p for p in snapshot["phases"] if p["timing"] == "during_use")
    assert any(s["module"] == "trial_media_capture" for s in during_phase["sections"])
    assert snapshot["meta"]["phaseCount"] == 2


def test_append_trial_media_capture_to_phases_noop_when_disabled():
    phases = [{"timing": "before_use", "label": "Before Use", "sections": []}]
    result = append_trial_media_capture_to_phases(
        phases,
        {"trial_media_capture": {"enabled": False}},
        "en",
    )
    assert result == phases
