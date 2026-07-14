import logging
from typing import Dict, Any, List
from pptx.slide import Slide
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_DATA_LABEL_POSITION
from pptx.util import Pt
from pptx.dml.color import RGBColor
from .base_builder import BaseChartBuilder
from .builder_render_status import BuilderEmptyDataError

logger = logging.getLogger(__name__)

class PPTXFunnel(BaseChartBuilder):
    """
    Builder for Stepped Funnel Charts.
    Implements a centered funnel using stacked bars with transparent spacers.
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Missing labels/datasets for funnel chart.")

        # 1. Take the first dataset (Funnel usually shows one brand or target)
        ds = datasets[0]
        original_data = ds.get("data", [])
        
        # 2. Calculate Spacers for Centering
        max_val = max(original_data) if original_data else 1.0
        spacers = [(max_val - v) / 2 for v in original_data]

        # 3. Populate Stacked Data [Spacer, Value]
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        chart_data_obj.add_series("Spacer", spacers)
        chart_data_obj.add_series(ds.get("label", "Funnel"), original_data)

        # 4. Add Stacked Bar Chart
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.BAR_STACKED,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 5. Apply Funnel Styling
        self._style_funnel(chart)

    def _style_funnel(self, chart: Any):
        # Category Axis (Y)
        c_axis = chart.category_axis
        c_axis.reverse_order = True
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.size = Pt(11)
        
        # Value Axis (X) - Hidden
        v_axis = chart.value_axis
        v_axis.visible = False
        
        # Plot optimization
        plot = chart.plots[0]
        plot.gap_width = 40 # Thick bars for funnel look
        
        # Series 0: Spacer (Transparent)
        spacer_series = chart.series[0]
        spacer_series.format.fill.background() # Fully transparent
        
        # Series 1: Funnel Data
        data_series = chart.series[1]
        fill = data_series.format.fill
        fill.solid()
        fill.fore_color.rgb = self.theme.PRIMARY_BRAND
        
        # Data Labels centered on the bar
        self.apply_series_data_labels(
            data_series,
            position=XL_DATA_LABEL_POSITION.CENTER,
            number_format="0%",
            font_size_pt=12,
            font_color=RGBColor(255, 255, 255),
        )

        # Hide Legend (Funnel is self-explanatory)
        chart.has_legend = False
