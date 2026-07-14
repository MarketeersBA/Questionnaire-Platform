"""Phase 7 — trial media rollout stage flags."""

import pytest

from backend.utils.trial_media_rollout_flags import (
    STAGES,
    assert_respondent_upload_rollout_enabled,
    get_trial_media_rollout_payload,
    is_trial_media_respondent_upload_enabled,
    is_trial_media_schema_rollout_enabled,
)
from backend.services.product_test_media_asset_service import ProductTestMediaAssetError


def test_rollout_stages_order():
    assert STAGES == ["schema_only", "respondent_upload"]


def test_schema_only_default_disables_respondent_upload(monkeypatch):
    monkeypatch.delenv("TRIAL_MEDIA_ROLLOUT_STAGE", raising=False)
    assert is_trial_media_schema_rollout_enabled() is True
    assert is_trial_media_respondent_upload_enabled() is False


def test_respondent_upload_stage_enables_public_pipeline(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "respondent_upload")
    assert is_trial_media_respondent_upload_enabled() is True


def test_rollout_payload_shape(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "schema_only")
    payload = get_trial_media_rollout_payload()
    assert payload["trial_media_rollout_stage"] == "schema_only"
    assert payload["trial_media_schema_enabled"] is True
    assert payload["trial_media_respondent_upload_enabled"] is False
    assert payload["default_survey_toggle"] is False


def test_assert_respondent_upload_rollout_enabled_blocks_schema_only(monkeypatch):
    monkeypatch.setenv("TRIAL_MEDIA_ROLLOUT_STAGE", "schema_only")
    with pytest.raises(ProductTestMediaAssetError) as exc:
        assert_respondent_upload_rollout_enabled()
    assert exc.value.status_code == 503
