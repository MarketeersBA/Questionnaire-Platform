from __future__ import annotations

from typing import Any, Dict, List, Optional

from .render_mode import PPTXRenderMode
from .success_criteria import build_phase0_scope_manifest


def build_pipeline_render_snapshot(
  report_doc: Dict[str, Any],
  *,
  render_mode: PPTXRenderMode,
  export_request: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
  scope = build_phase0_scope_manifest(report_doc, export_request)
  capture_candidates = list(scope.capture_candidates)
  native_fallback_charts = list(scope.native_fallback_charts)
  total_charts = len(report_doc.get("charts", []) or [])

  if render_mode == PPTXRenderMode.HYBRID:
    expected_image_capture_slides = len(capture_candidates)
    expected_native_chart_slides = len(native_fallback_charts)
  else:
    expected_image_capture_slides = 0
    expected_native_chart_slides = total_charts

  return {
    "render_mode": render_mode.value,
    "total_charts": total_charts,
    "capture_candidate_count": len(capture_candidates),
    "native_fallback_count": len(native_fallback_charts),
    "expected_image_capture_slides": expected_image_capture_slides,
    "expected_native_chart_slides": expected_native_chart_slides,
    "pilot_families": sorted(
      {
        str(item.get("pilot_family"))
        for item in capture_candidates
        if item.get("pilot_family")
      }
    ),
    "capture_chart_ids": [str(item.get("chart_id")) for item in capture_candidates if item.get("chart_id")],
    "native_fallback_chart_ids": [
      str(item.get("chart_id")) for item in native_fallback_charts if item.get("chart_id")
    ],
  }


def compare_pipeline_snapshots(
  *,
  native_snapshot: Dict[str, Any],
  hybrid_snapshot: Dict[str, Any],
) -> Dict[str, Any]:
  native_capture = int(native_snapshot.get("capture_candidate_count", 0))
  hybrid_capture = int(hybrid_snapshot.get("capture_candidate_count", 0))
  native_image = int(native_snapshot.get("expected_image_capture_slides", 0))
  hybrid_image = int(hybrid_snapshot.get("expected_image_capture_slides", 0))
  native_native = int(native_snapshot.get("expected_native_chart_slides", 0))
  hybrid_native = int(hybrid_snapshot.get("expected_native_chart_slides", 0))

  return {
    "native_render_mode": native_snapshot.get("render_mode"),
    "hybrid_render_mode": hybrid_snapshot.get("render_mode"),
    "capture_candidate_delta": hybrid_capture - native_capture,
    "expected_image_capture_delta": hybrid_image - native_image,
    "expected_native_chart_delta": hybrid_native - native_native,
    "shared_total_charts": native_snapshot.get("total_charts") == hybrid_snapshot.get("total_charts"),
    "manual_review_checklist": [
      "Compare slide count and section ordering between native and hybrid decks.",
      "Verify hybrid image-backed slides match the report export frame visually.",
      "Confirm native fallback charts still render when capture artifacts are missing.",
      "Review export manifest image_capture_count and capture_validation counts.",
      "Review blocked chart forensics before promoting rollout stage to default.",
    ],
    "manifest_count_focus": {
      "native_expected_native_chart_slides": native_native,
      "hybrid_expected_image_capture_slides": hybrid_image,
      "hybrid_expected_native_chart_slides": hybrid_native,
      "hybrid_capture_candidate_count": hybrid_capture,
    },
  }


def build_migration_comparison_manifest(
  report_doc: Dict[str, Any],
  *,
  export_request: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
  native_snapshot = build_pipeline_render_snapshot(
    report_doc,
    render_mode=PPTXRenderMode.NATIVE,
    export_request=export_request,
  )
  hybrid_snapshot = build_pipeline_render_snapshot(
    report_doc,
    render_mode=PPTXRenderMode.HYBRID,
    export_request=export_request,
  )
  return {
    "native_pipeline": native_snapshot,
    "hybrid_pipeline": hybrid_snapshot,
    "comparison": compare_pipeline_snapshots(
      native_snapshot=native_snapshot,
      hybrid_snapshot=hybrid_snapshot,
    ),
  }
