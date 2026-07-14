from __future__ import annotations

import os
from enum import Enum


class PPTXRolloutStage(str, Enum):
  FLAGGED = "flagged"
  COMPARISON = "comparison"
  DEFAULT = "default"


ROLLOUT_STAGE_ENV = "PPTX_ROLLOUT_STAGE"


def resolve_rollout_stage(explicit: str | None = None) -> PPTXRolloutStage:
  raw = explicit if explicit is not None else os.environ.get(ROLLOUT_STAGE_ENV, PPTXRolloutStage.FLAGGED.value)
  normalized = str(raw).strip().lower()
  for stage in PPTXRolloutStage:
    if normalized == stage.value:
      return stage
  return PPTXRolloutStage.FLAGGED


def describe_rollout_policy(stage: PPTXRolloutStage | None = None) -> dict[str, str]:
  resolved = stage or resolve_rollout_stage()
  if resolved == PPTXRolloutStage.FLAGGED:
    return {
      "stage": resolved.value,
      "render_mode_default": "native",
      "hybrid_activation": "Set PPTX_RENDER_MODE=hybrid to enable browser capture.",
      "native_builder_expansion": "allowed",
    }
  if resolved == PPTXRolloutStage.COMPARISON:
    return {
      "stage": resolved.value,
      "render_mode_default": "native",
      "hybrid_activation": "Set PPTX_RENDER_MODE=hybrid for side-by-side comparison runs.",
      "native_builder_expansion": "allowed",
    }
  return {
    "stage": resolved.value,
    "render_mode_default": "hybrid",
    "hybrid_activation": "Hybrid capture is the default. Set PPTX_RENDER_MODE=native to force legacy rebuilds.",
    "native_builder_expansion": "frozen_for_pilot_chart_families",
  }
