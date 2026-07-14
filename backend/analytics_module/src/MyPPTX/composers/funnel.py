import logging
import pandas as pd
from pptx.util import Inches
from pptx.enum.chart import XL_CHART_TYPE, XL_DATA_LABEL_POSITION
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition, ChartType
from backend.analytics_module.src.MyPPTX.registry import get_chart_config

logger = logging.getLogger(__name__)

class FunnelChartComposer(BaseChartComposer):
    """
    Advanced Marketing Engine: Purchase Funnel.
    Uses the "Centered-Stack" transformation to simulate a funnel natively.
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        config = get_chart_config(chart_definition.chart_type)
        
        # 1. Funnel Math: Calculate Centering Padding
        # Assuming data[0] is the primary metric (e.g. Awareness %)
        metric_col = data.columns[0]
        max_val = data[metric_col].max()
        
        # Build Centered DataFrame
        # Series 1: Invisible Padding | Series 2: Actual Value | Series 3: Invisible Padding
        funnel_df = pd.DataFrame(index=data.index)
        funnel_df["_padding"] = (max_val - data[metric_col]) / 2
        funnel_df["Value"] = data[metric_col]
        
        chart_data = self._prepare_category_data(funnel_df, "Funnel_Logic")
        
        left, top = Inches(2), Inches(1.5)
        width, height = Inches(6), Inches(4.5)
        
        chart_shape = self._add_native_chart(
            slide, XL_CHART_TYPE.BAR_STACKED, left, top, width, height, chart_data
        )
        chart = chart_shape.chart

        self._refine_funnel_layout(chart)
        return chart_shape

    def _refine_funnel_layout(self, chart):
        """
        Specialized Styling to hide padding and center the funnel.
        """
        plot = chart.plots[0]
        
        # 1. Hide Padding Series (First series in the stack)
        padding_series = plot.series[0]
        padding_series.format.fill.background() # No Fill
        padding_series.format.line.dash_style = None # No Border
        
        # 2. Style Value Series
        value_series = plot.series[1]
        value_series.has_data_labels = True
        value_series.data_labels.position = XL_DATA_LABEL_POSITION.CENTER
        value_series.data_labels.number_format = '0%'
        
        # 3. Clean Axis
        chart.value_axis.visible = False
        chart.category_axis.tick_labels.font.size = Inches(0.15)
        chart.has_legend = False
