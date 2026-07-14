"""Phase 9 — module rollout stage flags."""

import os

from backend.utils.module_rollout_flags import (
    STAGES,
    get_module_rollout_payload,
    is_at_least_stage,
    is_generic_renderer_enabled,
    is_pf_from_db_enabled,
    is_usage_pricing_modules_enabled,
)


def test_rollout_stages_order():
    assert STAGES[0] == "seed_only"
    assert STAGES[-1] == "full"


def test_full_stage_enables_all(monkeypatch):
    monkeypatch.setenv("MODULE_ROLLOUT_STAGE", "full")
    assert is_generic_renderer_enabled()
    assert is_pf_from_db_enabled()
    assert is_usage_pricing_modules_enabled()


def test_seed_only_disables_user_facing(monkeypatch):
    monkeypatch.setenv("MODULE_ROLLOUT_STAGE", "seed_only")
    assert not is_generic_renderer_enabled()
    assert not is_pf_from_db_enabled()
    assert not is_usage_pricing_modules_enabled()


def test_rollout_payload(monkeypatch):
    monkeypatch.setenv("MODULE_ROLLOUT_STAGE", "pf_from_db")
    payload = get_module_rollout_payload()
    assert payload["module_rollout_stage"] == "pf_from_db"
    assert payload["module_pf_from_db_enabled"] is True
    assert payload["module_usage_pricing_enabled"] is False
