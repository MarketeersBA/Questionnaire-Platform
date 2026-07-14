import logging
import pandas as pd
from pptx.util import Inches
from pptx.enum.chart import XL_CHART_TYPE
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition, ChartType
from backend.analytics_module.src.MyPPTX.registry import get_chart_config

logger = logging.getLogger(__name__)

class TrendChartComposer(BaseChartComposer):
    """
    Primitive Engine for Line and Area visualizations.
    Optimized for Chronological Wave Tracking and Awareness Trends.
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        config = get_chart_config(chart_definition.chart_type)
        chart_data = self._prepare_category_data(data, config.excel_tab)
        
        left, top = Inches(1), Inches(1.5)
        width, height = Inches(8), Inches(4.5)
        
        chart_shape = self._add_native_chart(
            slide, config.pptx_type, left, top, width, height, chart_data
        )
        chart = chart_shape.chart

        self._refine_trend_layout(chart, chart_definition)
        return chart_shape

    def _refine_trend_layout(self, chart, definition: ChartDefinition):
        """
        Enforces smoothing and markers for trend readability.
        """
        plot = chart.plots[0]
        
        for series in plot.series:
            # Marker configuration
            series.smooth = True
            
            # Show markers only if series isn't extremely dense (>12 points)
            if len(series.values) <= 12:
                from pptx.enum.chart import XL_MARKER_STYLE
                series.marker.style = XL_MARKER_STYLE.CIRCLE
                series.marker.size = 5
            
            # Data labels for the most recent point (common executive request)
            if len(series.values) > 0:
                last_point = series.points[len(series.values)-1]
                last_point.has_data_label = True
                last_point.data_label.number_format = '0%' if definition.metric_format == "percentage" else '#,##0'

        # Axis Formatting
        val_ax = chart.value_axis
        if definition.metric_format == "percentage":
            val_ax.minimum_scale = 0.0
            val_ax.tick_labels.number_format = '0%'
        
        chart.has_legend = True
        chart.legend.include_in_layout = False
