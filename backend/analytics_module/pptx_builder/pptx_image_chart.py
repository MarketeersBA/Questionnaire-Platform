from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from pptx.slide import Slide

from .base_builder import BaseChartBuilder, BuilderEmptyDataError

logger = logging.getLogger(__name__)


class PPTXImageChart(BaseChartBuilder):
  """Inserts a captured browser PNG into the template chart body region."""

  def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
    capture_path = chart_data.get("pptx_capture_path")
    if not capture_path:
      raise BuilderEmptyDataError("Missing pptx_capture_path for image-backed chart slide.")

    image_path = Path(str(capture_path))
    if not image_path.is_file():
      raise BuilderEmptyDataError(f"Captured chart image not found: {image_path}")

    left, top, width, height = self.layout.chart_body_bounds()
    slide.shapes.add_picture(
      str(image_path.resolve()),
      left,
      top,
      width=width,
      height=height,
    )
    logger.info(
      "[PPTXImageChart] Inserted captured chart image for '%s' from %s",
      chart_data.get("chart_id"),
      image_path,
    )
