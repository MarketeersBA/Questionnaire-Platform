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

class PPTXBrandComparison(BaseChartBuilder):
    """
    Builder for Side-by-Side Brand Comparisons (Purchase Intent vs Overall Likeness).
    Features:
    - Paired clustered columns for multi-metric benchmarking
    - Dual-tone blue palette for 'Metric A' vs 'Metric B' differentiation
    - Coordinated data labels for precision comparison
    - Normalized 0-100 scale support
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        brands = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not brands or not datasets:
            raise BuilderEmptyDataError("Brand comparison requires labels and datasets.")

        # 1. Prepare Chart Data (Typically 2 Series: PI and OL)
        chart_data_obj = ChartData()
        chart_data_obj.categories = brands
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
        
        # 3. Apply Professional Styling
        self._style_axes(chart)
        self._style_paired_series(chart, datasets)
        self._style_legend(chart)
        
        # 4. Spacing Optimization
        plot = chart.plots[0]
        plot.gap_width = 150 # Leave enough room between brand clusters
        plot.overlap = 0 # No overlap for side-by-side clarity

    def _style_axes(self, chart: Any):
        """Standardizes axes for score/percentage comparisons."""
        v_axis = chart.value_axis
        # Standardized to 100 for percentage-based intent or score normalized
        v_axis.minimum_scale = 0
        v_axis.maximum_scale = 100 
        v_axis.has_major_gridlines = True
        v_axis.major_gridlines.format.line.color.rgb = self.theme.get_rgb_by_name("brand_light_gray")
        
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        
        c_axis = chart.category_axis
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR

    def _style_paired_series(self, chart: Any, datasets: list):
        """Applied dual-tone branding for PI vs OL comparison."""
        
        # Dual-tone Blue Palette
        # We use the primary brand Navy for the 'Anchor' metric (Like Overall Likeness)
        # And a lighter, yet professional Blue for the 'Variable' metric (Like Purchase Intent)
        palette = [
            self.theme.get_rgb_by_name("brand_3_blue"), # PI (Metric A)
            self.theme.get_rgb_by_name("brand_navy"),   # OL (Metric B)
        ]
        
        for i, series in enumerate(chart.series):
            color = palette[i] if i < len(palette) else self.theme.get_color(i)
            
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = color
            
            # Data Labels
            self.apply_series_data_labels(
                series,
                position=XL_DATA_LABEL_POSITION.OUTSIDE_END,
                number_format="0.0",
                font_size_pt=9,
            )

    def _style_legend(self, chart: Any):
        chart.has_legend = True
        legend = chart.legend
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.name = self.theme.FONT_MEDIUM
        legend.font.size = Pt(10)
        legend.include_in_layout = False
