from __future__ import annotations

from backend.analytics_module.pptx_builder.hybrid_export import (
  CAPTURE_DEFAULTS,
  EXPORT_DATASET_BASE_REPORT,
  EXPORT_DATASET_PERSISTED_SLICE,
  PILOT_CHART_IDS,
  PilotChartFamily,
  build_phase0_scope_manifest,
  chart_body_capture_pixels,
  classify_intent_render_mode,
  evaluate_phase0_readiness,
  is_chart_capture_candidate,
  pilot_family_for_chart,
  resolve_export_dataset,
  slide_canvas_pixels,
)
from backend.analytics_module.pptx_builder.hybrid_export.scope import (
  PHASE0_EXPORT_TARGET,
  SlideRenderMode,
)
from backend.analytics_module.pptx_builder.presentation_planner import (
  PresentationPlanner,
  SlideIntent,
  SlideType,
)
from backend.tests.analytics.pptx_acceptance_contract import REPRESENTATIVE_SCREEN_CHARTS


def _pilot_report_doc() -> dict:
  return {
    "survey_id": "69ce229eeed39ea9d5282afa",
    "metadata": {"title": "Pilot Report", "brand": "Pilot Brand"},
    "insights": {
      "executive_summary": "Executive summary copy.",
      "key_findings": ["Finding A"],
      "market_position_report": {"headline": "Market position"},
      "brand_swot": {"Brand A": {"strengths": ["S1"]}},
      "recommendations_4p": {"product": ["Do X"]},
    },
    "charts": REPRESENTATIVE_SCREEN_CHARTS,
  }


def test_phase0_export_target_is_pixel_faithful_and_non_editable_charts():
  target = PHASE0_EXPORT_TARGET.as_dict()
  assert target["primary"] == "pixel_faithful_image"
  assert "raster PNG" in target["chart_editability"]
  assert "template text" in target["narrative_editability"]


def test_capture_defaults_use_light_theme_and_fixed_canvas():
  assert CAPTURE_DEFAULTS.theme == "light"
  assert CAPTURE_DEFAULTS.aspect_ratio == "16:9"
  assert slide_canvas_pixels() == (1920, 1080)

  width_px, height_px = chart_body_capture_pixels()
  assert width_px == 3494
  assert height_px == 1440


def test_pilot_catalog_covers_hard_chart_families():
  for chart in REPRESENTATIVE_SCREEN_CHARTS:
    family = pilot_family_for_chart(chart)
    if chart["chart_id"] in PILOT_CHART_IDS:
      assert family is not None

  assert pilot_family_for_chart({"chart_id": "audience_affinity", "chart_type": "affinity_heatmap"}) == PilotChartFamily.HEATMAP
  assert pilot_family_for_chart({"chart_id": "open_end_likes", "chart_type": "wordcloud"}) == PilotChartFamily.WORDCLOUD
  assert pilot_family_for_chart({"chart_id": "attribute_radar", "chart_type": "radar"}) == PilotChartFamily.RADAR
  assert pilot_family_for_chart({"chart_id": "overall_scatter", "chart_type": "scatter_plot"}) == PilotChartFamily.SCATTER
  assert pilot_family_for_chart({"chart_id": "nps_recommend", "chart_type": "gauge"}) == PilotChartFamily.GAUGE
  assert pilot_family_for_chart({"chart_id": "criteria_table", "chart_type": "criteria_table"}) == PilotChartFamily.DENSE_TABLE


def test_intent_render_mode_splits_template_and_capture_paths():
  cover = SlideIntent(SlideType.COVER, data={"title": "Cover"})
  assert classify_intent_render_mode(cover) == SlideRenderMode.TEMPLATE_NATIVE

  capture_chart = {"chart_id": "audience_affinity", "chart_type": "affinity_heatmap"}
  capture_intent = SlideIntent(SlideType.CONTENT_SLIDE, data=capture_chart)
  assert classify_intent_render_mode(capture_intent) == SlideRenderMode.CHART_CAPTURE
  assert is_chart_capture_candidate(capture_chart)

  fallback_chart = {"chart_id": "product_preference", "chart_type": "grouped_bar"}
  fallback_intent = SlideIntent(SlideType.CONTENT_SLIDE, data=fallback_chart)
  assert classify_intent_render_mode(fallback_intent) == SlideRenderMode.NATIVE_CHART_FALLBACK
  assert not is_chart_capture_candidate(fallback_chart)


def test_filter_policy_defaults_to_base_report_without_persisted_slice():
  report_doc = _pilot_report_doc()
  assert resolve_export_dataset(report_doc) == EXPORT_DATASET_BASE_REPORT
  assert resolve_export_dataset(report_doc, {"export_slice": {"filters": {"region": "KSA"}}}) == EXPORT_DATASET_PERSISTED_SLICE


def test_phase0_scope_manifest_maps_planner_to_capture_candidates():
  manifest = build_phase0_scope_manifest(_pilot_report_doc())
  payload = manifest.as_dict()

  assert payload["phase"] == "phase_0"
  assert payload["filter_policy"]["resolved_dataset"] == EXPORT_DATASET_BASE_REPORT
  assert payload["pilot"]["capture_candidate_count"] > 0
  assert any(item["render_mode"] == SlideRenderMode.TEMPLATE_NATIVE.value for item in payload["slide_plan"])
  assert any(item["render_mode"] == SlideRenderMode.CHART_CAPTURE.value for item in payload["slide_plan"])

  planned_types = {item["slide_type"] for item in payload["slide_plan"]}
  assert SlideType.COVER.value in planned_types
  assert SlideType.EXECUTIVE_SUMMARY.value in planned_types
  assert SlideType.CONTENT_SLIDE.value in planned_types

  capture_families = {item["pilot_family"] for item in payload["capture_candidates"]}
  assert capture_families == {
    "heatmap",
    "wordcloud",
    "radar",
    "scatter",
    "gauge",
    "dense_table",
  }

  issues = evaluate_phase0_readiness(manifest)
  assert issues == []


def test_phase0_readiness_flags_missing_pilot_families():
  sparse_report = {
    "metadata": {"title": "Sparse"},
    "insights": {},
    "charts": [{"chart_id": "criteria_table", "chart_type": "criteria_table", "title": "Only table"}],
  }
  manifest = build_phase0_scope_manifest(sparse_report)
  issues = evaluate_phase0_readiness(manifest)
  codes = {item["code"] for item in issues}
  assert "pilot_family_coverage_gap" in codes
