import logging
from typing import Dict, Any
from pptx.slide import Slide
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_DATA_LABEL_POSITION
from pptx.util import Pt
from pptx.dml.color import RGBColor
from .base_builder import BaseChartBuilder
from .builder_render_status import BuilderEmptyDataError

logger = logging.getLogger(__name__)

class PPTXStackedBar(BaseChartBuilder):
    """
    Builder for 100% Stacked Bar Charts (Awareness Waterfall / Sentiment Split).
    Features:
    - BAR_STACKED_100 native rendering
    - Strategic 'Awareness Gradient' coloring
    - In-segment data labels with white-out contrast
    - Total-normalized axis logic
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Missing labels/datasets for stacked bar chart.")

        # 1. Populate 100% Stacked Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        for ds in datasets:
            chart_data_obj.add_series(ds.get("label", ""), ds.get("data", []))

        # 2. Add Chart Shape
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.BAR_STACKED_100,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 3. Apply Premium Styling
        self._style_axes(chart)
        self._style_series_gradient(chart, datasets)
        self._style_legend(chart)
        
        # 4. Spacing Optimization
        plot = chart.plots[0]
        plot.gap_width = 80 # Tighter bars for awareness waterfall look

    def _style_axes(self, chart: Any):
        """Clean axes for stacked percentages."""
        # Category Axis (Y)
        c_axis = chart.category_axis
        c_axis.reverse_order = True
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR
        
        # Value Axis (X)
        v_axis = chart.value_axis
        v_axis.maximum_scale = 1.0 # 100%
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        v_axis.has_major_gridlines = False # Less clutter

    def _style_series_gradient(self, chart: Any, datasets: list):
        """Applies a logical color gradient for awareness segments."""
        
        # Define Awareness Palette (Deep to Light)
        palette = [
            self.theme.get_rgb_by_name("brand_navy"),     # TOM (Strongest)
            self.theme.get_rgb_by_name("brand_2_blue"),   # Other Unaided
            self.theme.get_rgb_by_name("brand_3_blue"),   # Aided
            self.theme.get_rgb_by_name("brand_light_gray") # Not Aware (if present)
        ]
        
        for i, series in enumerate(chart.series):
            # Select color from palette or theme fallback
            color = palette[i] if i < len(palette) else self.theme.get_color(i)
            
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = color
            
            # Data Labels INSIDE segments
            label_color = RGBColor(255, 255, 255) if i < 2 else self.theme.TEXT_COLOR
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.CENTER,
                number_format="0%",
                font_size_pt=9,
                font_color=label_color,
            )

    def _style_legend(self, chart: Any):
        chart.has_legend = True
        legend = chart.legend
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.size = Pt(10)
        legend.font.name = self.theme.FONT_MEDIUM
        legend.include_in_layout = False
