"""
Chart Styler — Phase 3, Task 2.
Programmatic styling engine that enforces the Executive Theme on Native Charts.
"""
import logging
from typing import Optional, Dict, Any
from pptx.util import Pt
from pptx.dml.color import RGBColor
from . import design_config

logger = logging.getLogger(__name__)

class ChartStyler:
    """
    Expert styling engine that transforms raw data series into 
    branded, executive-ready visualizations.
    """

    @staticmethod
    def apply_executive_style(chart, metadata: Optional[Dict[str, Any]] = None):
        """
        Applies complete visual identity to a native chart object.
        """
        # 1. Semantic Series Coloring
        ChartStyler._style_series(chart, metadata)

        # 2. Typography & Axis Hygiene
        ChartStyler._style_axes_and_legend(chart)

    @staticmethod
    def _style_series(chart, metadata: Optional[Dict[str, Any]]):
        """
        Overwrites default Excel colors with the corporate palette.
        Ensures consistent brand-to-color mapping.
        """
        try:
            # We target the first plot (most charts only have one)
            series_collection = chart.plots[0].series
            num_series = len(series_collection)
            
            # Fetch the optimized palette for this specific series count
            palette = design_config.get_color_palette(num_colors=num_series)
            if not palette:
                return

            # Semantic Brand Logic
            target_brands = metadata.get("brands", []) if metadata else []
            main_brand = target_brands[0].lower() if target_brands else ""

            for i, series in enumerate(series_collection):
                series_name = (series.name or "").lower()
                
                # Funnel Special Handling: Hide the centering padding
                if "_padding" in series_name:
                    series.format.fill.background() # No Fill
                    continue

                # Priority Mapping:

                # If this series represents the primary brand, assign index 0 (Navy)
                if main_brand and main_brand in series_name:
                    color = palette[0]
                else:
                    # Circular palette for competition
                    color = palette[i % len(palette)]
                
                # Apply solid fill
                fill = series.format.fill
                fill.solid()
                fill.fore_color.rgb = color
                
        except Exception as e:
            logger.warning(f"[Styler] Series coloring failed: {e}")

    @staticmethod
    def _style_axes_and_legend(chart):
        """
        Enforces corporate typography on all textual elements of the chart.
        """
        font_name = design_config.get_chart_font() or "Pangram"
        label_color = design_config.get_axis_label_color()
        label_size = design_config.get_axis_label_font_size()

        # 1. Axis Label Refinement
        for axis in [chart.category_axis, chart.value_axis]:
            if hasattr(axis, "has_tick_labels") and axis.has_tick_labels:
                font = axis.tick_labels.font
                font.name = font_name
                if label_color: 
                    font.color.rgb = label_color
                if label_size: 
                    font.size = Pt(label_size)

        # 2. Legend Aesthetic Polish
        if chart.has_legend:
            legend = chart.legend
            legend.font.name = font_name
            l_color = design_config.get_legend_color()
            if l_color: 
                legend.font.color.rgb = l_color
            
            l_size = design_config.get_legend_font_size()
            if l_size:
                legend.font.size = Pt(l_size)
            
            # Strategic Legend Placement (Bottom is default for Executive)
            pos_str = design_config.get_legend_position()
            if pos_str == "bottom":
                from pptx.enum.chart import XL_LEGEND_POSITION
                legend.position = XL_LEGEND_POSITION.BOTTOM
                legend.include_in_layout = False
