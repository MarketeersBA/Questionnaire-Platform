from __future__ import annotations

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.acceptance_gate import (
  acceptance_allows_native_quarantine,
  evaluate_resolver_acceptance_invariants,
)
from backend.analytics_module.pptx_builder.hybrid_export.migration_comparison import (
  build_migration_comparison_manifest,
  build_pipeline_render_snapshot,
)
from backend.analytics_module.pptx_builder.hybrid_export.native_builder_policy import (
  FROZEN_NATIVE_PILOT_REGISTRY_KEYS,
  evaluate_native_builder_expansion,
  summarize_native_builder_policy,
)
from backend.analytics_module.pptx_builder.hybrid_export.render_mode import (
  PPTXRenderMode,
  resolve_render_mode,
)
from backend.analytics_module.pptx_builder.hybrid_export.rollout import (
  PPTXRolloutStage,
  describe_rollout_policy,
  resolve_rollout_stage,
)
from backend.tests.analytics.pptx_acceptance_contract import (
  REPRESENTATIVE_SCREEN_CHARTS,
  build_representative_screen_report,
  expected_backend_key,
)


@pytest.fixture(autouse=True)
def reset_rollout_env(monkeypatch: pytest.MonkeyPatch):
  monkeypatch.delenv("PPTX_RENDER_MODE", raising=False)
  monkeypatch.delenv("PPTX_ROLLOUT_STAGE", raising=False)
  monkeypatch.delenv("PPTX_NATIVE_QUARANTINE", raising=False)
  monkeypatch.delenv("PPTX_NATIVE_QUARANTINE_DISABLE", raising=False)


def test_flagged_rollout_defaults_to_native_render_mode():
  assert resolve_rollout_stage() == PPTXRolloutStage.FLAGGED
  assert resolve_render_mode() == PPTXRenderMode.NATIVE


def test_explicit_hybrid_render_mode_overrides_flagged_rollout(monkeypatch: pytest.MonkeyPatch):
  monkeypatch.setenv("PPTX_RENDER_MODE", "hybrid")
  assert resolve_render_mode() == PPTXRenderMode.HYBRID


def test_default_rollout_stage_enables_hybrid_without_explicit_render_mode(monkeypatch: pytest.MonkeyPatch):
  monkeypatch.setenv("PPTX_ROLLOUT_STAGE", "default")
  assert resolve_render_mode() == PPTXRenderMode.HYBRID


def test_explicit_native_render_mode_overrides_default_rollout(monkeypatch: pytest.MonkeyPatch):
  monkeypatch.setenv("PPTX_ROLLOUT_STAGE", "default")
  monkeypatch.setenv("PPTX_RENDER_MODE", "native")
  assert resolve_render_mode() == PPTXRenderMode.NATIVE


def test_migration_comparison_manifest_counts_native_vs_hybrid_paths():
  report = build_representative_screen_report()
  manifest = build_migration_comparison_manifest(report)

  native = manifest["native_pipeline"]
  hybrid = manifest["hybrid_pipeline"]
  comparison = manifest["comparison"]

  assert native["render_mode"] == "native"
  assert hybrid["render_mode"] == "hybrid"
  assert native["expected_image_capture_slides"] == 0
  assert hybrid["expected_image_capture_slides"] == hybrid["capture_candidate_count"]
  assert comparison["expected_image_capture_delta"] == hybrid["expected_image_capture_slides"]
  assert comparison["shared_total_charts"] is True
  assert comparison["manifest_count_focus"]["hybrid_capture_candidate_count"] > 0


def test_pipeline_snapshots_share_capture_candidate_inventory():
  report = build_representative_screen_report()
  native = build_pipeline_render_snapshot(report, render_mode=PPTXRenderMode.NATIVE)
  hybrid = build_pipeline_render_snapshot(report, render_mode=PPTXRenderMode.HYBRID)

  assert native["capture_candidate_count"] == hybrid["capture_candidate_count"]
  assert native["capture_chart_ids"] == hybrid["capture_chart_ids"]


def test_resolver_acceptance_invariants_pass_for_representative_contract():
  invariants = evaluate_resolver_acceptance_invariants(
    REPRESENTATIVE_SCREEN_CHARTS,
    expected_backend_key=expected_backend_key,
  )
  assert invariants["passed"] is True
  assert invariants["failure_count"] == 0


def test_native_quarantine_stays_disabled_until_acceptance_and_rollout_gate(monkeypatch: pytest.MonkeyPatch):
  invariants = evaluate_resolver_acceptance_invariants(
    REPRESENTATIVE_SCREEN_CHARTS,
    expected_backend_key=expected_backend_key,
  )
  assert acceptance_allows_native_quarantine(
    rollout_stage=PPTXRolloutStage.COMPARISON,
    resolver_invariants=invariants,
  ) is False

  monkeypatch.setenv("PPTX_NATIVE_QUARANTINE", "true")
  assert acceptance_allows_native_quarantine(
    rollout_stage=PPTXRolloutStage.COMPARISON,
    resolver_invariants=invariants,
  ) is True


def test_default_rollout_enables_quarantine_after_acceptance_invariants():
  invariants = evaluate_resolver_acceptance_invariants(
    REPRESENTATIVE_SCREEN_CHARTS,
    expected_backend_key=expected_backend_key,
  )
  assert acceptance_allows_native_quarantine(
    rollout_stage=PPTXRolloutStage.DEFAULT,
    resolver_invariants=invariants,
  ) is True


def test_pilot_capture_candidates_are_marked_hybrid_preferred():
  report = build_representative_screen_report()
  affinity = next(chart for chart in report["charts"] if chart["chart_id"] == "audience_affinity")
  decision = evaluate_native_builder_expansion(
    chart=affinity,
    registry_key="affinity_heatmap",
    rollout_stage=PPTXRolloutStage.FLAGGED,
    quarantine_enabled=False,
  )
  assert decision["status"] == "hybrid_preferred"
  assert decision["preferred_render_mode"] == "image_capture"


def test_default_rollout_freezes_pilot_native_builder_expansion():
  affinity = next(
    chart for chart in build_representative_screen_report()["charts"]
    if chart["chart_id"] == "audience_affinity"
  )
  decision = evaluate_native_builder_expansion(
    chart=affinity,
    registry_key="affinity_heatmap",
    rollout_stage=PPTXRolloutStage.DEFAULT,
    quarantine_enabled=True,
  )
  assert decision["status"] == "frozen"


def test_rollout_policy_describes_comparison_stage():
  policy = describe_rollout_policy(PPTXRolloutStage.COMPARISON)
  assert policy["render_mode_default"] == "native"
  assert "comparison" in policy["hybrid_activation"].lower()


def test_rollout_policy_describes_default_stage():
  policy = describe_rollout_policy(PPTXRolloutStage.DEFAULT)
  assert policy["render_mode_default"] == "hybrid"
  assert policy["native_builder_expansion"] == "frozen_for_pilot_chart_families"


def test_native_builder_policy_summary_lists_frozen_registry_keys():
  summary = summarize_native_builder_policy(rollout_stage=PPTXRolloutStage.DEFAULT, quarantine_enabled=True)
  assert "affinity_heatmap" in summary["frozen_registry_keys"]
  assert summary["frozen_registry_keys"] == sorted(FROZEN_NATIVE_PILOT_REGISTRY_KEYS)
