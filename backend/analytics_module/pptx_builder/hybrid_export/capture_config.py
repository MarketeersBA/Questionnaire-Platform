from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from .capture_defaults import CAPTURE_DEFAULTS


def _env_int(name: str, default: int) -> int:
  raw = os.environ.get(name)
  if raw is None or not str(raw).strip():
    return default
  return int(raw)


def _env_float(name: str, default: float) -> float:
  raw = os.environ.get(name)
  if raw is None or not str(raw).strip():
    return default
  return float(raw)


@dataclass(frozen=True)
class BrowserCaptureConfig:
  frontend_base_url: str
  navigation_timeout_ms: int
  ready_timeout_ms: int
  screenshot_timeout_ms: int
  device_scale_factor: float
  default_theme: str
  default_frame: str
  max_attempts: int
  ready_settle_ms: int
  chart_root_selector: str
  frame_ready_selector: str
  per_chart_timeout_sec: int
  batch_timeout_sec: int

  @classmethod
  def from_env(cls) -> "BrowserCaptureConfig":
    from .export_timeouts import PptxExportTimeouts

    timeouts = PptxExportTimeouts.from_env()
    return cls(
      frontend_base_url=os.environ.get(
        "PPTX_EXPORT_FRONTEND_BASE_URL",
        "http://localhost:5173",
      ).rstrip("/"),
      navigation_timeout_ms=_env_int("PPTX_CAPTURE_NAV_TIMEOUT_MS", 30000),
      ready_timeout_ms=_env_int("PPTX_CAPTURE_READY_TIMEOUT_MS", 45000),
      screenshot_timeout_ms=_env_int("PPTX_CAPTURE_SCREENSHOT_TIMEOUT_MS", 15000),
      device_scale_factor=_env_float(
        "PPTX_CAPTURE_DEVICE_SCALE_FACTOR",
        CAPTURE_DEFAULTS.device_scale_factor,
      ),
      default_theme=os.environ.get("PPTX_CAPTURE_THEME", CAPTURE_DEFAULTS.theme),
      default_frame=os.environ.get("PPTX_CAPTURE_FRAME", "chart_body"),
      max_attempts=max(1, _env_int("PPTX_CAPTURE_MAX_ATTEMPTS", 2)),
      ready_settle_ms=_env_int("PPTX_CAPTURE_READY_SETTLE_MS", 120),
      chart_root_selector=os.environ.get(
        "PPTX_CAPTURE_CHART_ROOT_SELECTOR",
        '[data-export-chart-root="true"]',
      ),
      frame_ready_selector=os.environ.get(
        "PPTX_CAPTURE_FRAME_READY_SELECTOR",
        '[data-export-ready="true"]',
      ),
      per_chart_timeout_sec=timeouts.per_chart,
      batch_timeout_sec=timeouts.capture_batch,
    )


def resolve_capture_artifact_dir(
  output_root: Path,
  report_id: str,
) -> Path:
  return output_root / report_id / "capture_artifacts"
