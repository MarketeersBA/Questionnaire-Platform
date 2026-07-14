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

class PPTXGroupedBar(BaseChartBuilder):
    """
    Builder for Grouped Column Charts (Overall Averages).
    Features:
    - Native COLUMN_CLUSTERED rendering
    - Brand-synchronized series colors
    - Precision data labels with premium typography
    - Optimized spacing (Gap Width) for modern executive look
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        
        # Robust Mapping
        if isinstance(data_payload, list):
            labels = [str(item.get("category", "Item")) for item in data_payload]
            datasets = [{
                "label": "VALUE",
                "data": [item.get("value", 0) for item in data_payload]
            }]
        else:
            labels = data_payload.get("labels", [])
            datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Missing labels/datasets for grouped bar chart.")

        # 1. Populate Chart Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        for ds in datasets:
            chart_data_obj.add_series(ds.get("label", ""), ds.get("data", []))

        # 2. Add Chart Shape
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.COLUMN_CLUSTERED,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 3. Apply Premium Styling
        self._style_axes(chart)
        self._style_series(chart, datasets)
        self._style_legend(chart)
        
        # 4. Global Chart Formatting
        # Adjust gap width (space between groups) to 150% (Standard is 150, but 100-120 looks more premium)
        plot = chart.plots[0]
        plot.gap_width = 120 # % width of a single bar

    def _style_axes(self, chart: Any):
        """Clean, minimal axis design."""
        # Value Axis (Y)
        v_axis = chart.value_axis
        v_axis.has_major_gridlines = True
        v_axis.major_gridlines.format.line.color.rgb = self.theme.get_rgb_by_name("brand_light_gray")
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        
        # Bound to 0-10 for averages (Standard Research)
        v_axis.minimum_scale = 0
        v_axis.maximum_scale = 10
        
        # Category Axis (X)
        c_axis = chart.category_axis
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.name = self.theme.FONT_MEDIUM
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR

    def _style_series(self, chart: Any, datasets: list):
        """Applies brand colors and enables data labels."""
        for i, series in enumerate(chart.series):
            brand_name = datasets[i].get("label", "Brand")
            series_color = self._apply_brand_colors(brand_name)
            
            # Bar Fill
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = series_color
            
            # Data Labels (The numbers on top of bars)
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.OUTSIDE_END,
                number_format="0.0",
                font_size_pt=9,
            )

    def _style_legend(self, chart: Any):
        legend = chart.legend
        if legend:
            legend.position = XL_LEGEND_POSITION.BOTTOM
            legend.font.size = Pt(10)
            legend.font.name = self.theme.FONT_MEDIUM
            legend.include_in_layout = False
