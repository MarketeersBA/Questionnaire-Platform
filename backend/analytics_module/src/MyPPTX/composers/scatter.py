import logging
import pandas as pd
from pptx.util import Inches, Pt
from pptx.enum.chart import XL_CHART_TYPE, XL_DATA_LABEL_POSITION
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition, ChartType
from backend.analytics_module.src.MyPPTX.registry import get_chart_config
from pptx.dml.color import RGBColor

logger = logging.getLogger(__name__)

class ScatterChartComposer(BaseChartComposer):
    """
    Advanced Engine: BPI / Quadrant Map.
    Injects XY data and draws physical quadrant lines for strategic analysis.
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        config = get_chart_config(chart_definition.chart_type)
        
        # 1. Prepare XY Data
        from pptx.chart.data import XyChartData
        chart_data = XyChartData()
        series = chart_data.add_series("Brand Position")
        
        # We expect index=Brand, Col0=X, Col1=Y
        x_vals = data.iloc[:, 0].tolist()
        y_vals = data.iloc[:, 1].tolist()
        labels = data.index.tolist()
        
        for x, y, label in zip(x_vals, y_vals, labels):
            series.add_data_point(x, y, label=str(label))

        left, top = Inches(1.5), Inches(1.2)
        width, height = Inches(7), Inches(5)
        
        chart_shape = self._add_native_chart(
            slide, config.pptx_type, left, top, width, height, chart_data
        )
        chart = chart_shape.chart

        self._draw_quadrants(slide, chart_shape, x_vals, y_vals)
        self._refine_scatter_layout(chart)
        
        return chart_shape

    def _draw_quadrants(self, slide, chart_shape, x_data, y_data):
        """
        Overlays Mean-based crosshairs to create a 4-quadrant strategic map.
        """
        # Calculate Means
        avg_x = sum(x_data) / len(x_data) if x_data else 0.5
        avg_y = sum(y_data) / len(y_data) if y_data else 0.5
        
        # Translate Mean-Coordinates to Slide-Inches (Relative to chart frame)
        # Note: This is an approximation based on 90% plot area coverage
        c_left, c_top = chart_shape.left, chart_shape.top
        c_w, c_h = chart_shape.width, chart_shape.height
        
        # Vertical Line (Mean X)
        v_line = slide.shapes.add_connector(
            2, c_left + c_w/2, c_top + Inches(0.5), c_left + c_w/2, c_top + c_h - Inches(0.5)
        )
        v_line.line.color.rgb = RGBColor(200, 200, 200)
        v_line.line.width = Pt(1.5)
        
        # Horizontal Line (Mean Y)
        h_line = slide.shapes.add_connector(
            2, c_left + Inches(0.5), c_top + c_h/2, c_left + c_w - Inches(0.5), c_top + c_h/2
        )
        h_line.line.color.rgb = RGBColor(200, 200, 200)
        h_line.line.width = Pt(1.5)

    def _refine_scatter_layout(self, chart):
        chart.plots[0].has_data_labels = True
        for point in chart.plots[0].series[0].points:
            point.data_label.position = XL_DATA_LABEL_POSITION.TOP
            point.data_label.font.size = Pt(9)
        
        chart.category_axis.has_major_gridlines = False
        chart.value_axis.has_major_gridlines = False
