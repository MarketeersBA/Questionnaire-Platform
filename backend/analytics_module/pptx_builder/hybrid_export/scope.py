from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, FrozenSet, Optional, Set

from ..presentation_planner import SlideIntent, SlideType


class ExportTarget(str, Enum):
  """What hybrid export optimizes for in Phase 0."""

  PIXEL_FAITHFUL_IMAGE = "pixel_faithful_image"
  EDITABLE_TEMPLATE_TEXT = "editable_template_text"
  NON_EDITABLE_CHART_IMAGES = "non_editable_chart_images"


class SlideRenderMode(str, Enum):
  """How a planned slide is expected to be rendered in the hybrid pipeline."""

  TEMPLATE_NATIVE = "template_native"
  CHART_CAPTURE = "chart_capture"
  NATIVE_CHART_FALLBACK = "native_chart_fallback"


@dataclass(frozen=True)
class ExportTargetDefinition:
  primary: ExportTarget
  chart_editability: str
  narrative_editability: str
  visual_source_of_truth: str

  def as_dict(self) -> Dict[str, str]:
    return {
      "primary": self.primary.value,
      "chart_editability": self.chart_editability,
      "narrative_editability": self.narrative_editability,
      "visual_source_of_truth": self.visual_source_of_truth,
    }


PHASE0_EXPORT_TARGET = ExportTargetDefinition(
  primary=ExportTarget.PIXEL_FAITHFUL_IMAGE,
  chart_editability="Charts are raster PNG captures; chart data is not editable in PowerPoint.",
  narrative_editability="Cover, overview, executive, SWOT, roadmap, and closing slides remain template text.",
  visual_source_of_truth="React ChartRenderer export frame for chart slides.",
)

NARRATIVE_SLIDE_TYPES: FrozenSet[SlideType] = frozenset(
  {
    SlideType.COVER,
    SlideType.SURVEY_OVERVIEW,
    SlideType.EXECUTIVE_SUMMARY,
    SlideType.STRATEGIC_INTELLIGENCE,
    SlideType.SECTION_DIVIDER,
    SlideType.SWOT,
    SlideType.RECOMMENDATIONS_4P,
    SlideType.CLOSING,
  }
)

PILOT_DECK_SLIDE_TYPES: FrozenSet[SlideType] = frozenset(
  {
    SlideType.COVER,
    SlideType.SURVEY_OVERVIEW,
    SlideType.EXECUTIVE_SUMMARY,
    SlideType.STRATEGIC_INTELLIGENCE,
    SlideType.SECTION_DIVIDER,
    SlideType.CONTENT_SLIDE,
    SlideType.SWOT,
    SlideType.RECOMMENDATIONS_4P,
    SlideType.CLOSING,
  }
)


def narrative_slide_types() -> Set[SlideType]:
  return set(NARRATIVE_SLIDE_TYPES)


def classify_intent_render_mode(intent: SlideIntent) -> SlideRenderMode:
  if intent.type != SlideType.CONTENT_SLIDE:
    return SlideRenderMode.TEMPLATE_NATIVE
  chart = intent.data if isinstance(intent.data, dict) else {}
  if is_chart_capture_candidate(chart):
    return SlideRenderMode.CHART_CAPTURE
  return SlideRenderMode.NATIVE_CHART_FALLBACK


def is_chart_capture_candidate(chart: Optional[Dict[str, Any]]) -> bool:
  if not isinstance(chart, dict):
    return False
  from .pilot_catalog import pilot_family_for_chart

  return pilot_family_for_chart(chart) is not None
