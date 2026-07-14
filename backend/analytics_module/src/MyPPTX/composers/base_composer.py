import logging
import pandas as pd
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from pptx.chart.data import CategoryChartData, XyChartData
from backend.analytics_module.src.MyPPTX.styler import ChartStyler
from backend.analytics_module.schemas.export import ChartDefinition, BrandingConfig

logger = logging.getLogger(__name__)

class BaseChartComposer(ABC):
    """
    Abstract Base Class for all Native PPTX Chart Composers.
    Handles the orchestration of data injection and executive styling.
    """

    def __init__(self, branding: BrandingConfig):
        self.branding = branding

    @abstractmethod
    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        """
        Must be implemented by subclasses to draw the specific chart type.
        """
        pass

    def _add_native_chart(self, slide, chart_type, x, y, cx, cy, chart_data):
        """
        Adds a native chart to the slide and immediately applies executive styling.
        """
        chart_shape = slide.shapes.add_chart(
            chart_type, x, y, cx, cy, chart_data
        )
        chart = chart_shape.chart
        
        # Apply the executive visual identity
        self._apply_styling(chart)
        
        return chart_shape

    def _apply_styling(self, chart):
        """
        Delegates styling to the ChartStyler, enforcing the executive theme.
        """
        # We can pass the branding config to the styler if we update it, 
        # for now we use the existing static styler which pulls from themes.json
        ChartStyler.apply_executive_style(chart)
        
        # Additional Branding Overrides (Explicit Font/Color from BrandingConfig)
        self._apply_branding_overrides(chart)

    def _apply_branding_overrides(self, chart):
        """
        Applies explicit overrides from the ReportExportSchema (e.g. font family).
        """
        from pptx.util import Pt
        from pptx.dml.color import RGBColor
        
        font_name = self.branding.font_family
        
        # Legend Override
        if chart.has_legend:
            chart.legend.font.name = font_name
            
        # Axes Override
        for axis in [chart.category_axis, chart.value_axis]:
            if hasattr(axis, "has_tick_labels") and axis.has_tick_labels:
                axis.tick_labels.font.name = font_name

    def _prepare_category_data(self, data: pd.DataFrame, excel_tab_name: str) -> CategoryChartData:
        """
        Standardizes the conversion of a DataFrame into CategoryChartData.
        Ensures numeric integrity for the embedded Excel workbook.
        """
        chart_data = CategoryChartData()
        # In python-pptx, the categories are the X-axis labels
        chart_data.categories = [str(c) for c in data.index]
        
        for col in data.columns:
            series_name = str(col)
            # Ensure values are float/int to prevent Excel 'Text as Number' errors
            values = []
            for v in data[col]:
                try:
                    val = float(v) if pd.notnull(v) else 0.0
                    values.append(val)
                except (ValueError, TypeError):
                    values.append(0.0)
            
            chart_data.add_series(series_name, values)
            
        return chart_data
