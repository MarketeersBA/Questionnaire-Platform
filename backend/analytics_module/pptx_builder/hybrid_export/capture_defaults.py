from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from ..layout import (
  CHART_FRAME_PAD_IN,
  REFERENCE_HEIGHT_IN,
  REFERENCE_WIDTH_IN,
  PPTXLayout,
)


@dataclass(frozen=True)
class CaptureDefaults:
  theme: str
  color_scheme: str
  aspect_ratio: str
  viewport_width_px: int
  viewport_height_px: int
  device_scale_factor: float
  base_dpi: int
  chart_body_width_in: float
  chart_body_height_in: float
  chart_frame_pad_in: float
  slide_width_in: float
  slide_height_in: float
  image_format: str
  include_ai_headline_in_capture: bool
  include_ai_deep_analysis_in_capture: bool

  def as_dict(self) -> Dict[str, object]:
    width_px, height_px = chart_body_capture_pixels(self)
    return {
      "theme": self.theme,
      "color_scheme": self.color_scheme,
      "aspect_ratio": self.aspect_ratio,
      "viewport_width_px": self.viewport_width_px,
      "viewport_height_px": self.viewport_height_px,
      "device_scale_factor": self.device_scale_factor,
      "base_dpi": self.base_dpi,
      "chart_body_width_in": self.chart_body_width_in,
      "chart_body_height_in": self.chart_body_height_in,
      "chart_body_width_px": width_px,
      "chart_body_height_px": height_px,
      "chart_frame_pad_in": self.chart_frame_pad_in,
      "slide_width_in": self.slide_width_in,
      "slide_height_in": self.slide_height_in,
      "image_format": self.image_format,
      "include_ai_headline_in_capture": self.include_ai_headline_in_capture,
      "include_ai_deep_analysis_in_capture": self.include_ai_deep_analysis_in_capture,
    }


_LAYOUT = PPTXLayout.for_reference()
_CHART_LEFT, _CHART_TOP, _CHART_WIDTH, _CHART_HEIGHT = _LAYOUT.chart_body_bounds()

CAPTURE_DEFAULTS = CaptureDefaults(
  theme="light",
  color_scheme="light",
  aspect_ratio="16:9",
  viewport_width_px=1920,
  viewport_height_px=1080,
  device_scale_factor=2.0,
  base_dpi=96,
  chart_body_width_in=float(_CHART_WIDTH.inches),
  chart_body_height_in=float(_CHART_HEIGHT.inches),
  chart_frame_pad_in=CHART_FRAME_PAD_IN,
  slide_width_in=REFERENCE_WIDTH_IN,
  slide_height_in=REFERENCE_HEIGHT_IN,
  image_format="png",
  include_ai_headline_in_capture=False,
  include_ai_deep_analysis_in_capture=False,
)


def slide_canvas_pixels(defaults: CaptureDefaults = CAPTURE_DEFAULTS) -> Tuple[int, int]:
  return defaults.viewport_width_px, defaults.viewport_height_px


def chart_body_viewport_pixels(
  defaults: CaptureDefaults = CAPTURE_DEFAULTS,
) -> Tuple[int, int]:
  width_ratio = defaults.chart_body_width_in / defaults.slide_width_in
  height_ratio = defaults.chart_body_height_in / defaults.slide_height_in
  width_px = int(round(defaults.viewport_width_px * width_ratio))
  height_px = int(round(defaults.viewport_height_px * height_ratio))
  return width_px, height_px


def chart_body_capture_pixels(
  defaults: CaptureDefaults = CAPTURE_DEFAULTS,
) -> Tuple[int, int]:
  scale = defaults.base_dpi * defaults.device_scale_factor
  width_px = int(round(defaults.chart_body_width_in * scale))
  height_px = int(round(defaults.chart_body_height_in * scale))
  return width_px, height_px
