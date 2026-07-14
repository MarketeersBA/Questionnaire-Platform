"""
Axis & Legend Polish — Phase 3, Task 3.
Final refinement layer for numeric formatting and scale calibration.
"""
import logging
from typing import Optional
from pptx.util import Pt
from . import design_config

logger = logging.getLogger(__name__)

class AxisStyler:
    """
    Expert utility for polishing chart axes, data labels, and numeric scales.
    Ensures that research data is presented with methodological precision.
    """

    # Systematic Number Formats for different analytical optics
    FORMAT_MAP = {
        "percentage": "0%",
        "percentage_precise": "0.0%",
        "currency": "$#,##0",
        "integer": "#,##0",
        "decimal": "0.00",
        "scientific": "0.00E+00"
    }

    @staticmethod
    def apply_polish(chart, metric_type: Optional[str] = "percentage"):
        """
        Choreographs the final numeric and typographic sweep of the chart.
        """
        # 1. Resolve Semantic Format
        fmt = AxisStyler.FORMAT_MAP.get(metric_type.lower(), "0%") if metric_type else "0%"

        # 2. Value Axis Refinement
        AxisStyler._polish_value_axis(chart, fmt, metric_type)

        # 3. Data Label Refinement
        AxisStyler._polish_data_labels(chart, fmt)

    @staticmethod
    def _polish_value_axis(chart, fmt: str, metric_type: Optional[str]):
        """Calibrates the Y-Axis (Value Axis) for readability."""
        try:
            axis = chart.value_axis
            axis.tick_labels.number_format = fmt
            
            # Smart Scaling:
            # For percentages, we enforce a strict 0-100% (0.0-1.0) range 
            # to avoid the chart 'lying' with truncated scales.
            if metric_type and "percent" in metric_type.lower():
                axis.minimum_scale = 0.0
                # We add 10% breathing room if the max value is close to 1
                axis.maximum_scale = 1.05 
                
        except Exception as e:
            logger.debug(f"[AxisStyler] Value axis polish skipped: {e}")

    @staticmethod
    def _polish_data_labels(chart, fmt: str):
        """Standardizes the font and format of numbers inside the chart area."""
        font_name = design_config.get_chart_font() or "Pangram"
        
        for plot in chart.plots:
            # We ensure data labels are active for high-fidelity executive review
            plot.has_data_labels = True
            
            for series in plot.series:
                labels = series.data_labels
                labels.number_format = fmt
                
                # Apply Corporate Typography to the labels themselves
                font = labels.font
                font.name = font_name
                font.size = Pt(10) # Optimized size for executive slides
                font.bold = False
