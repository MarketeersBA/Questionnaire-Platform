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

class PPTXHorizontalBar(BaseChartBuilder):
    """
    Builder for Horizontal Bar Charts (Product Preference / Purchase Intent).
    Features:
    - Native BAR_CLUSTERED rendering
    - Automatic value-based sorting (Top-Down)
    - Dynamic label placement with percentage formatting
    - Axis-inverted layout for professional analytical display
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        
        # Robust Mapping: Handle List-of-Dicts or Matrix
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
            raise BuilderEmptyDataError("Missing labels/datasets for horizontal bar chart.")

        # 1. Processing: Sort by the first series value (Standard for Preference charts)
        # Note: We zip and sort to keep labels matched with multiple series data
        if datasets and len(datasets[0].get("data", [])) == len(labels):
            zipped = list(zip(labels, *[ds.get("data", []) for ds in datasets]))
            # Sort by values of the first series descending
            zipped.sort(key=lambda x: x[1], reverse=True)
            
            # Unzip
            labels = [x[0] for x in zipped]
            sorted_datasets_data = list(zip(*[x[1:] for x in zipped]))
            for i, data_tuple in enumerate(sorted_datasets_data):
                datasets[i]["data"] = list(data_tuple)

        # 2. Populate Chart Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        for ds in datasets:
            chart_data_obj.add_series(ds.get("label", ""), ds.get("data", []))

        # 3. Add Chart Shape
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.BAR_CLUSTERED,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 4. Premium Formatting
        self._style_axes(chart)
        self._style_series(chart, datasets)
        self._style_legend(chart)

    def _style_axes(self, chart: Any):
        """Standardizes horizontal axis logic."""
        # Category Axis (Y in horizontal charts)
        c_axis = chart.category_axis
        # CRITICAL: Invert categories to show highest at the top
        c_axis.reverse_order = True
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR
        
        # Value Axis (X in horizontal charts)
        v_axis = chart.value_axis
        v_axis.minimum_scale = 0
        # Allow auto-scaling for % usually, but lock if it's 0-100 data
        v_axis.has_major_gridlines = True
        v_axis.major_gridlines.format.line.color.rgb = self.theme.get_rgb_by_name("brand_light_gray")
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT

    def _style_series(self, chart: Any, datasets: list):
        """Applies brand colors and percentage labels."""
        for i, series in enumerate(chart.series):
            brand_name = datasets[i].get("label", "Brand")
            color = self._apply_brand_colors(brand_name)
            
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = color
            
            # Data Labels
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.OUTSIDE_END,
                number_format="0.0\"%\"",
                font_size_pt=10,
            )

    def _style_legend(self, chart: Any):
        # Hide legend if only one series (typical for simple preference)
        if len(chart.series) <= 1:
            chart.has_legend = False
        else:
            legend = chart.legend
            if legend:
                legend.position = XL_LEGEND_POSITION.BOTTOM
                legend.font.size = Pt(10)
                legend.font.name = self.theme.FONT_MEDIUM
                legend.include_in_layout = False
