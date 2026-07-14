import logging
from typing import Dict, Any, List
from pptx.slide import Slide
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_TICK_MARK, XL_DATA_LABEL_POSITION
from pptx.util import Pt, Inches
from pptx.dml.color import RGBColor
from .base_builder import BaseChartBuilder
from .builder_render_status import BuilderEmptyDataError

logger = logging.getLogger(__name__)

class PPTXSnakeLine(BaseChartBuilder):
    """
    Builder for the Purchase Funnel (Snake Line).
    Features:
    - LINE_MARKERS for multi-stage conversion tracking
    - Percentage-based Y-axis (0-100%)
    - Distinctive brand-colored markers with high-contrast data labels
    - Funnel-stage optimized category labelling (X-axis)
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Snake line requires labels and datasets.")

        # 1. Populate Funnel Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        for ds in datasets:
            chart_data_obj.add_series(ds.get("label", ""), ds.get("data", []))

        # 2. Add Chart Shape
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.LINE_MARKERS,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 3. Apply Premium Funnel Styling
        self._style_axes(chart)
        self._style_series(chart, datasets)
        self._style_legend(chart)

    def _style_axes(self, chart: Any):
        """Optimizes axes for percentage-based conversion funnels."""
        # Value Axis (Y) - The Conversion %
        v_axis = chart.value_axis
        v_axis.minimum_scale = 0
        v_axis.maximum_scale = 100 
        v_axis.major_unit = 20
        v_axis.has_major_gridlines = True
        v_axis.major_gridlines.format.line.color.rgb = self.theme.get_rgb_by_name("brand_light_gray")
        
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        # Add '%' to Y-axis labels
        v_axis.tick_labels.number_format = "0\"%\""
        
        # Category Axis (X) - Funnel Stages
        c_axis = chart.category_axis
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR

    def _style_series(self, chart: Any, datasets: list):
        """Applies brand-coded markers and line paths."""
        for i, series in enumerate(chart.series):
            brand_name = datasets[i].get("label", "Brand")
            color = self._apply_brand_colors(brand_name)
            
            # Line Path
            line = series.format.line
            line.color.rgb = color
            line.width = Pt(2.25)
            
            # Marker Design
            series.marker.style = 5 # Diamond for funnels (symbolizing 'conversion points')
            series.marker.size = 9
            series.marker.format.fill.solid()
            series.marker.format.fill.fore_color.rgb = color
            
            # Data Labels (Show % at each stage)
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.ABOVE,
                number_format="0\"%\"",
                font_size_pt=10,
                font_color=color,
            )

    def _style_legend(self, chart: Any):
        chart.has_legend = True
        legend = chart.legend
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.size = Pt(10)
        legend.font.name = self.theme.FONT_MEDIUM
        legend.include_in_layout = False
