from __future__ import annotations

from typing import Any, Dict, List

from backend.analytics_module.pptx_builder.hybrid_export.success_criteria import (
  build_phase0_scope_manifest,
)
from backend.tests.analytics.pptx_acceptance_contract import build_representative_screen_report


def build_golden_hybrid_capture_manifest() -> Dict[str, Any]:
  report = build_representative_screen_report()
  phase0 = build_phase0_scope_manifest(report)
  success_chart_ids = [
    "audience_affinity",
    "criteria_table",
    "competitive_position_matrix",
    "market_position_sigma",
  ]
  charts_by_id = {chart["chart_id"]: chart for chart in report["charts"]}
  captures: List[Dict[str, Any]] = []
  for chart_id in success_chart_ids:
    chart = charts_by_id[chart_id]
    captures.append(
      {
        "chart_id": chart["chart_id"],
        "chart_type": chart["chart_type"],
        "status": "success",
        "image_path": f"/tmp/capture_artifacts/{chart['chart_id']}.png",
        "image_bytes": 2048,
        "width": 1747,
        "height": 720,
        "viewport_url": f"http://frontend.test/surveys/golden/export-frame?chart_id={chart['chart_id']}",
        "theme": "light",
        "frame": "chart_body",
        "attempts": 1,
        "error": None,
        "duration_ms": 120,
      }
    )

  failed_chart = charts_by_id["open_end_likes"]
  captures.append(
    {
      "chart_id": failed_chart["chart_id"],
      "chart_type": failed_chart["chart_type"],
      "status": "failed",
      "image_path": None,
      "image_bytes": None,
      "width": 1747,
      "height": 720,
      "viewport_url": "http://frontend.test/surveys/golden/export-frame?chart_id=open_end_likes",
      "theme": "light",
      "frame": "chart_body",
      "attempts": 2,
      "error": "navigation_failed",
      "duration_ms": 240,
    }
  )

  return {
    "report_id": "golden-report",
    "survey_id": phase0.pilot.get("survey_id", "golden-survey"),
    "artifact_root": "/tmp/capture_artifacts",
    "success_count": len(success_chart_ids),
    "failure_count": 1,
    "captures": captures,
  }


def build_golden_image_backed_render_journal() -> List[Dict[str, Any]]:
  return [
    {
      "chart_id": "audience_affinity",
      "chart_type": "affinity_heatmap",
      "render_status": "rendered",
      "render_mode": "image_capture",
      "registry_key": "image_capture",
      "slide_index": 8,
    },
    {
      "chart_id": "overall_scatter",
      "chart_type": "scatter_plot",
      "render_status": "rendered",
      "render_mode": "native",
      "registry_key": "scatter_plot",
      "slide_index": 9,
    },
  ]
