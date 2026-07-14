from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..presentation_planner import PresentationPlanner, SlideType
from .capture_defaults import CAPTURE_DEFAULTS
from .filter_policy import PHASE0_FILTER_POLICY, resolve_export_dataset
from .pilot_catalog import PILOT_REPORT_ID, PILOT_SURVEY_ID, pilot_family_for_chart
from .scope import (
  PHASE0_EXPORT_TARGET,
  PILOT_DECK_SLIDE_TYPES,
  SlideRenderMode,
  classify_intent_render_mode,
)


@dataclass(frozen=True)
class Phase0ScopeManifest:
  phase: str
  export_target: Dict[str, str]
  capture_defaults: Dict[str, object]
  filter_policy: Dict[str, object]
  pilot: Dict[str, object]
  slide_plan: List[Dict[str, object]] = field(default_factory=list)
  capture_candidates: List[Dict[str, object]] = field(default_factory=list)
  native_fallback_charts: List[Dict[str, object]] = field(default_factory=list)
  success_criteria: List[Dict[str, str]] = field(default_factory=list)

  def as_dict(self) -> Dict[str, object]:
    return {
      "phase": self.phase,
      "export_target": self.export_target,
      "capture_defaults": self.capture_defaults,
      "filter_policy": self.filter_policy,
      "pilot": self.pilot,
      "slide_plan": self.slide_plan,
      "capture_candidates": self.capture_candidates,
      "native_fallback_charts": self.native_fallback_charts,
      "success_criteria": self.success_criteria,
    }


PHASE0_SUCCESS_CRITERIA: List[Dict[str, str]] = [
  {
    "id": "pixel_faithful_charts",
    "statement": "Every pilot chart family slide is rendered from a browser capture, not a rebuilt native chart.",
  },
  {
    "id": "editable_narrative",
    "statement": "Cover, overview, executive, strategic, divider, SWOT, roadmap, and closing slides remain template-native text.",
  },
  {
    "id": "deterministic_capture_environment",
    "statement": "Captures use the frozen light theme, 16:9 viewport, and chart-body pixel dimensions from capture defaults.",
  },
  {
    "id": "base_report_only",
    "statement": "Exports use the persisted base report unless a persisted export_slice payload is supplied.",
  },
  {
    "id": "manifest_traceability",
    "statement": "Each capture candidate records chart_id, chart_type, pilot family, and render mode for downstream validation.",
  },
]


def _append_chart_capture_row(
  chart: Dict[str, Any],
  order_index: int,
  capture_candidates: List[Dict[str, object]],
  native_fallback_charts: List[Dict[str, object]],
) -> None:
  chart_id = str(chart.get("chart_id") or "")
  chart_type = str(chart.get("chart_type") or "table")
  family = pilot_family_for_chart(chart)
  render_mode = (
    SlideRenderMode.CHART_CAPTURE
    if family is not None
    else SlideRenderMode.NATIVE_CHART_FALLBACK
  )
  payload = {
    "order_index": order_index,
    "chart_id": chart_id,
    "chart_type": chart_type,
    "title": chart.get("title"),
    "pilot_family": family.value if family else None,
    "render_mode": render_mode.value,
  }
  if render_mode == SlideRenderMode.CHART_CAPTURE:
    capture_candidates.append(payload)
  else:
    native_fallback_charts.append(payload)


def build_phase0_scope_manifest(
  report_doc: Dict[str, Any],
  export_request: Optional[Dict[str, Any]] = None,
) -> Phase0ScopeManifest:
  intents = PresentationPlanner.define_slide_intents(report_doc)
  slide_plan: List[Dict[str, object]] = []
  capture_candidates: List[Dict[str, object]] = []
  native_fallback_charts: List[Dict[str, object]] = []

  for index, intent in enumerate(intents):
    render_mode = classify_intent_render_mode(intent)
    slide_plan.append(
      {
        "order_index": index,
        "slide_type": intent.type.value,
        "title": intent.title,
        "render_mode": render_mode.value,
        "in_pilot_deck": intent.type in PILOT_DECK_SLIDE_TYPES,
      }
    )

    if intent.type == SlideType.CONTENT_SLIDE and isinstance(intent.data, dict):
      _append_chart_capture_row(
        intent.data,
        index,
        capture_candidates,
        native_fallback_charts,
      )
      continue

    if intent.type == SlideType.STRATEGIC_INTELLIGENCE and isinstance(intent.data, dict):
      for chart in intent.data.get("charts", []) or []:
        if isinstance(chart, dict):
          _append_chart_capture_row(
            chart,
            index,
            capture_candidates,
            native_fallback_charts,
          )

  pilot_families_present = sorted(
    {
      str(item["pilot_family"])
      for item in capture_candidates
      if item.get("pilot_family")
    }
  )

  return Phase0ScopeManifest(
    phase="phase_0",
    export_target=PHASE0_EXPORT_TARGET.as_dict(),
    capture_defaults=CAPTURE_DEFAULTS.as_dict(),
    filter_policy={
      **PHASE0_FILTER_POLICY.as_dict(),
      "resolved_dataset": resolve_export_dataset(report_doc, export_request),
    },
    pilot={
      "survey_id": PILOT_SURVEY_ID,
      "report_id": PILOT_REPORT_ID,
      "deck_slide_types": sorted(slide_type.value for slide_type in PILOT_DECK_SLIDE_TYPES),
      "pilot_families": pilot_families_present,
      "capture_candidate_count": len(capture_candidates),
      "native_fallback_count": len(native_fallback_charts),
    },
    slide_plan=slide_plan,
    capture_candidates=capture_candidates,
    native_fallback_charts=native_fallback_charts,
    success_criteria=PHASE0_SUCCESS_CRITERIA,
  )


def evaluate_phase0_readiness(manifest: Phase0ScopeManifest) -> List[Dict[str, str]]:
  issues: List[Dict[str, str]] = []

  if manifest.export_target.get("primary") != "pixel_faithful_image":
    issues.append(
      {
        "code": "export_target_mismatch",
        "message": "Phase 0 requires pixel_faithful_image as the export target.",
      }
    )

  if manifest.filter_policy.get("include_ephemeral_ui_filters"):
    issues.append(
      {
        "code": "filter_policy_too_broad",
        "message": "Ephemeral UI filters must remain out of scope for Phase 0.",
      }
    )

  if not manifest.capture_candidates:
    issues.append(
      {
        "code": "no_capture_candidates",
        "message": "Pilot report must include at least one chart capture candidate.",
      }
    )

  expected_families = {
    "heatmap",
    "wordcloud",
    "radar",
    "scatter",
    "gauge",
    "dense_table",
  }
  present_families = {
    str(item.get("pilot_family"))
    for item in manifest.capture_candidates
    if item.get("pilot_family")
  }
  missing_families = sorted(expected_families - present_families)
  if missing_families:
    issues.append(
      {
        "code": "pilot_family_coverage_gap",
        "message": f"Pilot deck is missing capture coverage for: {', '.join(missing_families)}.",
      }
    )

  return issues
