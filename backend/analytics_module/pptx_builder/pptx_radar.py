import logging
from typing import Dict, Any, List
from pptx.slide import Slide
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_DATA_LABEL_POSITION
from pptx.util import Pt
from .base_builder import BaseChartBuilder
from .builder_render_status import BuilderEmptyDataError

logger = logging.getLogger(__name__)

class PPTXRadar(BaseChartBuilder):
    """
    Builder for Native Radar (Spider) Charts.
    Used for multi-brand attribute profile comparisons.
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        domain = data_payload.get("domain", [0, 10])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Missing labels/datasets for radar chart.")

        # 1. Populate Radar Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        for ds in datasets:
            # We filter out benchmark datasets from radar if too crowded, 
            # or include them with special styling.
            chart_data_obj.add_series(ds.get("label", ""), ds.get("data", []))

        # 2. Add Radar Chart
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.RADAR,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 3. Apply Premium Styling
        self._style_radar(chart, domain)
        self._style_series(chart, datasets)
        self._style_legend(chart)

    def _style_radar(self, chart: Any, domain: List[float]):
        """Styles the radar web and axes."""
        v_axis = chart.value_axis
        v_axis.minimum_scale = domain[0]
        v_axis.maximum_scale = domain[1]
        v_axis.major_unit = (domain[1] - domain[0]) / 5
        
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        
        # Radar charts have a 'radar_axis' for categories
        # But in pptx they are handled via cat_axis
        cat_axis = chart.category_axis
        cat_axis.tick_labels.font.size = Pt(10)
        cat_axis.tick_labels.font.name = self.theme.FONT_BOLD

    def _style_series(self, chart: Any, datasets: List[dict]):
        """Applies theme colors and transparency to radar areas."""
        for i, series in enumerate(chart.series):
            # Radar lines
            color = self.theme.get_color(i)
            series.format.line.color.rgb = color
            series.format.line.width = Pt(2)
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.ABOVE,
                number_format="0.0",
                font_size_pt=8,
            )
            
            # Area Fill (Subtle transparency if supported, or just light solid)
            # Area fill in Radar is part of the series format
            # fill = series.format.fill
            # fill.solid()
            # fill.fore_color.rgb = color
            # fill.fore_color.brightness = 0.5 # Lighten for the 'web' fill

    def _style_legend(self, chart: Any):
        chart.has_legend = True
        legend = chart.legend
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.size = Pt(10)
        legend.font.name = self.theme.FONT_MEDIUM
