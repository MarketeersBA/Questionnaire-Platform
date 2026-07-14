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

class PPTXWaterfallBar(BaseChartBuilder):
    """
    Builder for Waterfall-style Awareness Charts.
    Unlike a 100% stacked bar, this visualizes the 'cascade' of awareness
    from Top-of-Mind (TOM) through Total Unaided to Total Aided.
    """

    def render(self, slide: Slide, chart_data: Dict[str, Any]) -> None:
        data_payload = chart_data.get("data", {})
        labels = data_payload.get("labels", [])
        datasets = data_payload.get("datasets", [])
        
        if not labels or not datasets:
            raise BuilderEmptyDataError("Waterfall awareness requires labels and datasets.")

        # 1. Transform Segments to Cumulative Waterfall Data
        # Input usually: [TOM, Other_Unaided, Aided]
        # Waterfall should show: [TOM, Total Unaided, Total Awareness]
        
        tom_vals = next((ds["data"] for ds in datasets if ds["label"] == "TOM"), [])
        other_vals = next((ds["data"] for ds in datasets if ds["label"] == "Other_Unaided"), [])
        aided_vals = next((ds["data"] for ds in datasets if ds["label"] == "Aided"), [])
        
        if not tom_vals:
            # Fallback to index-based if labels mismatch
            tom_vals = datasets[0]["data"]
            other_vals = datasets[1]["data"] if len(datasets) > 1 else [0]*len(tom_vals)
            aided_vals = datasets[2]["data"] if len(datasets) > 2 else [0]*len(tom_vals)

        total_unaided = [t + o for t, o in zip(tom_vals, other_vals)]
        total_aware = [u + a for u, a in zip(total_unaided, aided_vals)]

        # 2. Populate Chart Data
        chart_data_obj = ChartData()
        chart_data_obj.categories = labels
        chart_data_obj.add_series("Total Awareness", [v for v in total_aware])
        chart_data_obj.add_series("Total Unaided", [v for v in total_unaided])
        chart_data_obj.add_series("Top-of-Mind (TOM)", [v for v in tom_vals])

        # 3. Add Clustered Bar Chart (Waterfall effect via overlapping or clustering)
        # For High-Fidelity, we use CLUSTERED_BAR and let them overlap or just cluster.
        chart_shape = slide.shapes.add_chart(
            XL_CHART_TYPE.BAR_CLUSTERED,
            self.layout.CHART_LEFT, self.layout.CHART_TOP,
            self.layout.CHART_WIDTH, self.layout.CHART_HEIGHT,
            chart_data_obj
        )
        chart = chart_shape.chart
        
        # 4. Premium Styling
        self._style_axes(chart)
        self._style_waterfall_series(chart)
        self._style_legend(chart)

    def _style_axes(self, chart: Any):
        c_axis = chart.category_axis
        c_axis.reverse_order = True
        c_axis.tick_labels.font.name = self.theme.FONT_BOLD
        c_axis.tick_labels.font.size = Pt(10)
        
        v_axis = chart.value_axis
        v_axis.maximum_scale = 1.0
        v_axis.tick_labels.number_format = "0%"
        v_axis.has_major_gridlines = False

    def _style_waterfall_series(self, chart: Any):
        """Applies nested waterfall colors (Deep -> Mid -> Light)."""
        # Series 0: Total Awareness (Backmost/Lightest)
        # Series 1: Total Unaided (Middle)
        # Series 2: TOM (Frontmost/Darkest)
        
        colors = [
            self.theme.get_rgb_by_name("brand_light_gray"),
            self.theme.get_rgb_by_name("brand_3_blue"),
            self.theme.get_rgb_by_name("brand_navy")
        ]
        
        # Overlap to create the waterfall effect (100% overlap)
        plot = chart.plots[0]
        plot.overlap = 100
        plot.gap_width = 80
        
        for i, series in enumerate(chart.series):
            color = colors[i] if i < len(colors) else self.theme.get_color(i)
            fill = series.format.fill
            fill.solid()
            fill.fore_color.rgb = color
            
            # Labels only on the TOM and Total Awareness
            if i == 0 or i == 2:
                self.apply_series_data_labels(
                    series,
                    position=XL_DATA_LABEL_POSITION.OUTSIDE_END,
                    number_format="0%",
                    font_size_pt=9,
                )

    def _style_legend(self, chart: Any):
        chart.has_legend = True
        legend = chart.legend
        legend.position = XL_LEGEND_POSITION.BOTTOM
        legend.font.size = Pt(10)
