import logging
import pandas as pd
from pptx.util import Inches
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition, ChartType
from backend.analytics_module.src.MyPPTX.registry import get_chart_config

logger = logging.getLogger(__name__)

class ProportionChartComposer(BaseChartComposer):
    """
    Primitive Engine for Pie and Donut visualizations.
    Manages Legend placement and Donut hole dimensions.
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        config = get_chart_config(chart_definition.chart_type)
        chart_data = self._prepare_category_data(data, config.excel_tab)
        
        # Pies/Donuts usually look better centered and slightly smaller
        left, top = Inches(2), Inches(1.5)
        width, height = Inches(6), Inches(4)
        
        chart_shape = self._add_native_chart(
            slide, config.pptx_type, left, top, width, height, chart_data
        )
        chart = chart_shape.chart

        self._refine_proportion_layout(chart, chart_definition)
        return chart_shape

    def _refine_proportion_layout(self, chart, definition: ChartDefinition):
        """
        Specialized Proportional settings.
        """
        plot = chart.plots[0]
        plot.has_data_labels = True
        
        # Donut Hole Size (55% is the executive standard)
        if hasattr(plot, 'doughnut_hole_size'):
            plot.doughnut_hole_size = 55

        # Legend Configuration
        chart.has_legend = True
        chart.legend.position = XL_LEGEND_POSITION.RIGHT
        
        # Data Label Styling (Category + Percentage)
        for series in plot.series:
            for point in series.points:
                label = point.data_label
                label.has_category_name = True
                label.has_percentage = True
                label.number_format = '0%'
                label.font.size = Inches(0.12)
