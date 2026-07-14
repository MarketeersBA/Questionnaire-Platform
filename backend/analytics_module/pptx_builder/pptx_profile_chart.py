import logging
from typing import Dict, Any, List
from pptx.slide import Slide
from pptx.chart.data import ChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_TICK_MARK, XL_MARKER_STYLE
from pptx.util import Pt
from pptx.enum.text import PP_ALIGN
from pptx.dml.color import RGBColor
from .base_builder import BaseChartBuilder
from .builder_render_status import BuilderEmptyDataError
from .chart_builder_runtime import ensure_chart_legend, set_marker_style

logger = logging.getLogger(__name__)

class PPTXProfileChart(BaseChartBuilder):
    """
    Builder for the 'Brand Performance Profile' (Snake Chart).
    Features:
    - Native Line with Markers
    - Specialty styling for 'Overall' benchmark (Dashed)
    - Automated brand color assignment
    - Synchronized Y-axis (0-10 scale standard)
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Insufficient data for profile chart.")

        # 1. Prepare Chart Data
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
        
        # 3. Apply High-Fidelity Styling
        self._style_axes(chart)
        self._style_series(chart, datasets)
        self._style_legend(chart)

    def _style_axes(self, chart: Any):
        """Standardizes axis appearance for premium analytical look."""
        # Value Axis (Y-Axis)
        v_axis = chart.value_axis
        v_axis.has_major_gridlines = True
        v_axis.major_gridlines.format.line.color.rgb = self.theme.get_rgb_by_name("brand_light_gray")
        v_axis.major_gridlines.format.line.width = Pt(0.5)
        
        # Force 0-10 scale for Snake Charts (Unless data exceeds it)
        v_axis.minimum_scale = 0
        v_axis.maximum_scale = 10 
        v_axis.minor_tick_mark = XL_TICK_MARK.NONE
        
        v_axis.tick_labels.font.name = self.theme.FONT_LIGHT
        v_axis.tick_labels.font.size = Pt(9)
        v_axis.tick_labels.font.color.rgb = self.theme.SUBTITLE_COLOR
        
        # Category Axis (X-Axis)
        c_axis = chart.category_axis
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.size = Pt(10)
        c_axis.tick_labels.font.color.rgb = self.theme.TEXT_COLOR

    def _style_series(self, chart: Any, datasets: list):
        """Applies colors and dash patterns to lines."""
        from pptx.enum.dml import MSO_LINE
        
        for i, series in enumerate(chart.series):
            ds_meta = datasets[i]
            is_benchmark = ds_meta.get("brand") == "Overall" or ds_meta.get("is_benchmark", False)
            
            # Line Styling
            line = series.format.line
            if is_benchmark:
                line.color.rgb = self.theme.SUBTITLE_COLOR
                line.dash_style = MSO_LINE.DASH # Dashed for Overall
                line.width = Pt(1.5)
                set_marker_style(series.marker, XL_MARKER_STYLE.NONE)
            else:
                brand_name = ds_meta.get("brand", "Competitor")
                line.color.rgb = self._apply_brand_colors(brand_name)
                line.width = Pt(2.5)
                set_marker_style(series.marker, XL_MARKER_STYLE.CIRCLE)
                series.marker.size = 7
                series.marker.format.fill.solid()
                series.marker.format.fill.fore_color.rgb = RGBColor(255, 255, 255)
                series.marker.format.line.color.rgb = self._apply_brand_colors(brand_name)
                series.marker.format.line.width = Pt(1.5)

    def _style_legend(self, chart: Any):
        """Positions the legend at the bottom with theme fonts."""
        legend = ensure_chart_legend(chart, XL_LEGEND_POSITION.BOTTOM)
        legend.include_in_layout = False
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.name = self.theme.FONT_MEDIUM
        legend.font.size = Pt(10)
        legend.font.color.rgb = self.theme.TEXT_COLOR
