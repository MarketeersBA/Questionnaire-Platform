from __future__ import annotations

from typing import Any, Dict, FrozenSet, Optional

from ..presentation_planner import SlideType
from .acceptance_gate import acceptance_allows_native_quarantine
from .pilot_catalog import PilotChartFamily, pilot_family_for_chart
from .rollout import PPTXRolloutStage, describe_rollout_policy, resolve_rollout_stage
from .scope import NARRATIVE_SLIDE_TYPES, is_chart_capture_candidate


FROZEN_NATIVE_PILOT_REGISTRY_KEYS: FrozenSet[str] = frozenset(
  {
    "affinity_heatmap",
    "wordcloud",
    "radar",
    "scatter",
    "scatter_plot",
    "scatter_bubble",
    "sigma_intent_scatter",
    "gauge",
    "nps_recommend",
    "criteria_table",
    "reference_table",
    "table",
    "image_capture",
  }
)


def is_intentional_editable_slide(slide_type: SlideType) -> bool:
  return slide_type in NARRATIVE_SLIDE_TYPES


def is_native_builder_quarantined(registry_key: str) -> bool:
  return registry_key in FROZEN_NATIVE_PILOT_REGISTRY_KEYS


def should_prefer_hybrid_render(chart: Dict[str, Any]) -> bool:
  return is_chart_capture_candidate(chart)


def evaluate_native_builder_expansion(
  *,
  chart: Optional[Dict[str, Any]] = None,
  registry_key: Optional[str] = None,
  rollout_stage: Optional[PPTXRolloutStage] = None,
  quarantine_enabled: Optional[bool] = None,
) -> Dict[str, Any]:
  stage = rollout_stage or resolve_rollout_stage()
  policy = describe_rollout_policy(stage)
  quarantine_active = (
    quarantine_enabled
    if quarantine_enabled is not None
    else acceptance_allows_native_quarantine(rollout_stage=stage)
  )

  family = pilot_family_for_chart(chart or {})
  registry = str(registry_key or "")
  chart_id = str((chart or {}).get("chart_id") or "")

  if policy["native_builder_expansion"] == "frozen_for_pilot_chart_families" or quarantine_active:
    if family is not None or is_native_builder_quarantined(registry):
      return {
        "chart_id": chart_id,
        "registry_key": registry,
        "status": "frozen",
        "reason": "Pilot chart families should route through hybrid capture instead of new native builders.",
        "preferred_render_mode": "image_capture",
      }

  if should_prefer_hybrid_render(chart or {}):
    return {
      "chart_id": chart_id,
      "registry_key": registry,
      "status": "hybrid_preferred",
      "reason": "Chart is a Phase 0 capture candidate.",
      "preferred_render_mode": "image_capture",
    }

  return {
    "chart_id": chart_id,
    "registry_key": registry,
    "status": "allowed",
    "reason": "Native builder expansion remains allowed for non-pilot or narrative slides.",
    "preferred_render_mode": "native",
  }


def summarize_native_builder_policy(
  *,
  rollout_stage: Optional[PPTXRolloutStage] = None,
  quarantine_enabled: Optional[bool] = None,
) -> Dict[str, Any]:
  stage = rollout_stage or resolve_rollout_stage()
  quarantine_active = (
    quarantine_enabled
    if quarantine_enabled is not None
    else acceptance_allows_native_quarantine(rollout_stage=stage)
  )
  return {
    **describe_rollout_policy(stage),
    "quarantine_active": quarantine_active,
    "frozen_registry_keys": sorted(FROZEN_NATIVE_PILOT_REGISTRY_KEYS),
    "intentional_editable_slide_types": sorted(slide_type.value for slide_type in NARRATIVE_SLIDE_TYPES),
    "pilot_families": [family.value for family in PilotChartFamily],
  }
