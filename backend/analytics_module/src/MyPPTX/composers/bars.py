import logging
import pandas as pd
from pptx.util import Inches
from pptx.enum.chart import XL_CHART_TYPE, XL_DATA_LABEL_POSITION
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition, ChartType
from backend.analytics_module.src.MyPPTX.registry import get_chart_config

logger = logging.getLogger(__name__)

class BarChartComposer(BaseChartComposer):
    """
    Primitive Engine for Bar and Column visualizations.
    Handles Single-Series, Paired-Series, and all Stacked variants.
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        """
        Implementation of the Bar/Column drawing logic.
        """
        # 1. Resolve technical constants from Registry
        config = get_chart_config(chart_definition.chart_type)
        chart_type_const = config.pptx_type
        
        # 2. Data Preparation
        chart_data = self._prepare_category_data(data, config.excel_tab)
        
        # 3. Placement (Defaulting to standard 70% of slide width, centered)
        left, top = Inches(1), Inches(1.5)
        width, height = Inches(8), Inches(4.5)
        
        # 4. Native Creation
        chart_shape = self._add_native_chart(
            slide, chart_type_const, left, top, width, height, chart_data
        )
        chart = chart_shape.chart

        # 5. Domain-Specific Refinement
        self._refine_bar_layout(chart, chart_definition)
        
        return chart_shape

    def _refine_bar_layout(self, chart, definition: ChartDefinition):
        """
        Applies Bar-specific tweaks like Data Label positioning and Axis formatting.
        """
        plot = chart.plots[0]
        plot.has_data_labels = True
        
        # Data Label Styling based on Metric Type
        for series in plot.series:
            labels = series.data_labels
            labels.font.size = Inches(0.15)
            
            if definition.metric_format == "percentage":
                labels.number_format = '0%'
            elif definition.metric_format == "currency":
                labels.number_format = '"$"#,##0'
            else:
                labels.number_format = '#,##0'

        # Legend visibility for Multi-Series
        if len(plot.series) > 1:
            chart.has_legend = True
        else:
            chart.has_legend = False

        # Category Axis hygiene
        ax = chart.category_axis
        ax.has_major_gridlines = False
        
        # Value Axis formatting
        val_ax = chart.value_axis
        if definition.metric_format == "percentage":
            val_ax.tick_labels.number_format = '0%'
