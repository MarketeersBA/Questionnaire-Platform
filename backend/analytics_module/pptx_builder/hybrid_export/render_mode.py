from __future__ import annotations

import os
from enum import Enum

from .rollout import PPTXRolloutStage, resolve_rollout_stage


class PPTXRenderMode(str, Enum):
  NATIVE = "native"
  HYBRID = "hybrid"


def resolve_render_mode(explicit: str | None = None) -> PPTXRenderMode:
  if explicit:
    normalized = explicit.strip().lower()
    if normalized in {"hybrid", "capture", "browser"}:
      return PPTXRenderMode.HYBRID
    return PPTXRenderMode.NATIVE

  forced = os.environ.get("PPTX_RENDER_MODE")
  if forced is not None and str(forced).strip():
    normalized = str(forced).strip().lower()
    if normalized in {"hybrid", "capture", "browser"}:
      return PPTXRenderMode.HYBRID
    return PPTXRenderMode.NATIVE

  rollout_stage = resolve_rollout_stage()
  if rollout_stage == PPTXRolloutStage.DEFAULT:
    return PPTXRenderMode.NATIVE
  return PPTXRenderMode.NATIVE
