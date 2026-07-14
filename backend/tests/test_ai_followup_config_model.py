"""AiFollowupConfig model defaults for legacy surveys."""

from backend.models import AiFollowupConfig


def test_ai_followup_config_legacy_defaults():
    cfg = AiFollowupConfig(is_enabled=True)
    assert cfg.max_rounds == 2
    assert cfg.apply_to_text is True
    assert cfg.apply_to_voice is True
    assert cfg.eligible_surfaces is None
    assert cfg.min_answer_length == 5
    assert cfg.dedupe_window_ms == 1000


def test_ai_followup_config_accepts_advanced_fields():
    cfg = AiFollowupConfig(
        is_enabled=True,
        eligible_surfaces=["taste_l2_open_end"],
        min_answer_length=7,
        dedupe_window_ms=900,
    )
    assert cfg.eligible_surfaces == ["taste_l2_open_end"]
    assert cfg.min_answer_length == 7
    assert cfg.dedupe_window_ms == 900
