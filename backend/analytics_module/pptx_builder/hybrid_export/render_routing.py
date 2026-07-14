from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Tuple, Type

from ..chart_resolver import ChartResolution, PPTXChartResolver
from ..pptx_image_chart import PPTXImageChart


def should_render_chart_as_image(chart_data: Dict[str, Any]) -> bool:
  capture_path = chart_data.get("pptx_capture_path")
  if not capture_path:
    return False
  return Path(str(capture_path)).is_file()


def resolve_content_slide_builder(
  chart_data: Dict[str, Any],
  resolver: PPTXChartResolver,
) -> Tuple[ChartResolution, Type]:
  if should_render_chart_as_image(chart_data):
    resolution = ChartResolution(
      builder_class=PPTXImageChart,
      registry_key="image_capture",
      source="captured_image",
      chart_type=str(chart_data.get("chart_type") or "table"),
      chart_id=chart_data.get("chart_id"),
    )
    return resolution, PPTXImageChart

  resolution = resolver.resolve(chart_data)
  return resolution, resolution.builder_class
