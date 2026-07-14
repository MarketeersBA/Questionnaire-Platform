"""
Chart Injector — Phase 2, Task 2.
Technological bridge between Pandas matrices and Native PowerPoint Excel blobs.
Ensures charts remain 100% interactive and editable.
"""
import logging
import pandas as pd
from typing import Optional, Any, Dict
from pptx.chart.data import CategoryChartData, XyChartData
from .mapping import ShapeMapper

logger = logging.getLogger(__name__)

class ChartInjector:
    """
    Expert engine for native data injection. 
    Maintains the technical bond between PPTX shapes and their embedded Excel workbooks.
    """

    @staticmethod
    def inject(slide, data: pd.DataFrame, chart_key: Optional[str] = None):
        """
        Main entry point for chart data replacement.
        Automatically detects chart type (Categorical vs XY) and applies the correct builder.
        """
        if data is None or data.empty:
            return False

        # 1. Discovery Phase
        chart_shape = ChartInjector._find_chart(slide, chart_key)
        if not chart_shape:
            logger.warning(f"[Injector] No chart found on slide targeting key: {chart_key}")
            return False

        chart = chart_shape.chart
        
        # 2. Logic Branching by Chart Type
        try:
            # We determine the builder based on the existing placeholder chart type
            # xlChartType enumeration is used for robust detection
            if ChartInjector._is_xy_chart(chart.chart_type):
                return ChartInjector._inject_xy(chart, data)
            else:
                return ChartInjector._inject_category(chart, data)
        except Exception as e:
            logger.error(f"[Injector] Critical failure during injection: {e}", exc_info=True)
            return False

    @staticmethod
    def _inject_category(chart, data: pd.DataFrame):
        """Builder for Bar, Column, Line, Area, and Radar charts."""
        chart_data = CategoryChartData()
        chart_data.categories = [str(c) for c in data.index]
        
        for col in data.columns:
            series_name = str(col) if col else ""
            # Ensure values are strictly numeric for the Excel bridge
            values = [float(v) if pd.notnull(v) else 0.0 for v in data[col]]
            chart_data.add_series(series_name, values)
            
        chart.replace_data(chart_data)
        return True

    @staticmethod
    def _inject_xy(chart, data: pd.DataFrame):
        """Builder for Scatter and Bubble charts (Drivers)."""
        chart_data = XyChartData()
        
        # Expectation: 
        # For a single series scatter: index=Label, Col1=X, Col2=Y
        # If multiple columns: Each column might represent a different series (complex)
        # We simplify to a Single Series with Data Labels for most Survey use cases.
        series = chart_data.add_series("Survey Drivers")
        
        # X is typically first column, Y is second
        x_col = data.columns[0]
        y_col = data.columns[1] if len(data.columns) > 1 else data.columns[0]
        
        for label, row in data.iterrows():
            x = float(row[x_col]) if pd.notnull(row[x_col]) else 0.0
            y = float(row[y_col]) if pd.notnull(row[y_col]) else 0.0
            series.add_data_point(x, y, label=str(label))
            
        chart.replace_data(chart_data)
        return True

    @staticmethod
    def _find_chart(slide, key: Optional[str]):
        """Intelligent Discovery: Finds the best chart shape on the slide."""
        if key:
            shape = ShapeMapper.find_first_by_key(slide, key)
            if shape and shape.has_chart:
                return shape
                
        # Primary Fallback: The largest chart on the slide (usually the main one)
        charts = [s for s in slide.shapes if s.has_chart]
        if not charts:
            return None
            
        return sorted(charts, key=lambda s: s.width * s.height, reverse=True)[0]

    @staticmethod
    def _is_xy_chart(chart_type) -> bool:
        """Determines if the chart uses XY coordinates instead of Categories."""
        from pptx.enum.chart import XL_CHART_TYPE
        xy_types = {
            XL_CHART_TYPE.XY_SCATTER, 
            XL_CHART_TYPE.XY_SCATTER_LINES, 
            XL_CHART_TYPE.XY_SCATTER_LINES_NO_MARKERS,
            XL_CHART_TYPE.XY_SCATTER_SMOOTH,
            XL_CHART_TYPE.XY_SCATTER_SMOOTH_NO_MARKERS,
            XL_CHART_TYPE.BUBBLE,
            XL_CHART_TYPE.BUBBLE_3DEFFECT
        }
        return chart_type in xy_types
