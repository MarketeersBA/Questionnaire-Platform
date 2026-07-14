"""
Configurable timeouts for PPTX export stages (Phase 4).
"""
from __future__ import annotations

import os
from dataclasses import dataclass


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return max(1, int(raw))


@dataclass(frozen=True)
class PptxExportTimeouts:
    """All durations in seconds."""

    total_export: int
    capture_batch: int
    per_chart: int
    preparing: int
    assembling: int
    validating: int

    @classmethod
    def from_env(cls) -> "PptxExportTimeouts":
        per_chart = _env_int("PPTX_CAPTURE_PER_CHART_TIMEOUT_SEC", 90)
        capture_batch = _env_int(
            "PPTX_CAPTURE_BATCH_TIMEOUT_SEC",
            max(600, per_chart * 25),
        )
        return cls(
            total_export=_env_int("PPTX_TOTAL_EXPORT_TIMEOUT_SEC", 5400),
            capture_batch=capture_batch,
            per_chart=per_chart,
            preparing=_env_int("PPTX_STAGE_TIMEOUT_PREPARING_SEC", 600),
            assembling=_env_int("PPTX_STAGE_TIMEOUT_ASSEMBLE_SEC", 1800),
            validating=_env_int("PPTX_STAGE_TIMEOUT_VALIDATE_SEC", 600),
        )

    def stage_timeout(self, stage: str) -> int:
        mapping = {
            "preparing": self.preparing,
            "capturing_charts": self.capture_batch,
            "queued": self.preparing,
            "assembling_deck": self.assembling,
            "validating": self.validating,
            "failed": self.total_export,
            "ready": self.total_export,
        }
        return mapping.get(stage, self.total_export)
