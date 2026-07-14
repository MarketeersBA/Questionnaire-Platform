from __future__ import annotations

from enum import Enum


class PPTXExportStage(str, Enum):
  PREPARING = "preparing"
  CAPTURING_CHARTS = "capturing_charts"
  ASSEMBLING_DECK = "assembling_deck"
  VALIDATING = "validating"
  READY = "ready"


STAGE_PROGRESS: dict[PPTXExportStage, int] = {
  PPTXExportStage.PREPARING: 15,
  PPTXExportStage.CAPTURING_CHARTS: 40,
  PPTXExportStage.ASSEMBLING_DECK: 65,
  PPTXExportStage.VALIDATING: 85,
  PPTXExportStage.READY: 100,
}

NATIVE_STAGE_PROGRESS: dict[PPTXExportStage, int] = {
  PPTXExportStage.PREPARING: 20,
  PPTXExportStage.CAPTURING_CHARTS: 20,  # Native path skips capture stage.
  PPTXExportStage.ASSEMBLING_DECK: 70,
  PPTXExportStage.VALIDATING: 90,
  PPTXExportStage.READY: 100,
}


def stage_progress_for_mode(render_mode: str) -> dict[PPTXExportStage, int]:
  normalized = (render_mode or "").strip().lower()
  if normalized == "native":
    return NATIVE_STAGE_PROGRESS
  return STAGE_PROGRESS
