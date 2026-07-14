import logging
import pandas as pd
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from .base_composer import BaseChartComposer
from backend.analytics_module.schemas.export import ChartDefinition

logger = logging.getLogger(__name__)

class TableComposer(BaseChartComposer):
    """
    Advanced Engine: Data Grids & Heatmaps.
    Renders native tables with executive zebra-striping and 
    5-scale conditional highlighting (Blue -> White -> Orange).
    """

    def compose(self, slide, chart_definition: ChartDefinition, data: pd.DataFrame):
        rows, cols = data.shape
        # Account for Header
        table_rows = rows + 1
        table_cols = cols + 1 # Include Index
        
        left, top = Inches(1), Inches(1.5)
        width, height = Inches(8), Inches(4)
        
        table_shape = slide.shapes.add_table(table_rows, table_cols, left, top, width, height)
        table = table_shape.table

        # 1. Populate Header
        self._write_cell(table.cell(0, 0), "", bold=True, bg_color=RGBColor(0, 0, 128))
        for c, col in enumerate(data.columns):
            self._write_cell(table.cell(0, c+1), str(col), bold=True, bg_color=RGBColor(0, 0, 128), text_color=RGBColor(255, 255, 255))

        # 2. Populate Data with Style
        is_heatmap = (chart_definition.chart_type == "heatmap")
        min_val, max_val = self._get_data_bounds(data) if is_heatmap else (0, 0)

        for r, (idx, row) in enumerate(data.iterrows()):
            # Index Cell
            self._write_cell(table.cell(r+1, 0), str(idx), bold=True, bg_color=RGBColor(240, 240, 245))
            
            for c, val in enumerate(row):
                bg_color = None
                text_color = None
                
                if is_heatmap:
                    bg_color = self._get_heatmap_color(val, min_val, max_val)
                    # Contrast check: if bg is dark blue or dark orange, make text white
                    if bg_color.r < 100 or bg_color.r > 200: # Simple heuristic
                        text_color = RGBColor(255, 255, 255)
                elif r % 2 == 0:
                    bg_color = RGBColor(250, 250, 252) # Zebra stripe

                formatted_val = self._format_value(val, chart_definition.metric_format)
                self._write_cell(table.cell(r+1, c+1), formatted_val, bg_color=bg_color, text_color=text_color)

        return table_shape

    def _write_cell(self, cell, text, bold=False, bg_color=None, text_color=None):
        tf = cell.text_frame
        tf.text = text
        p = tf.paragraphs[0]
        p.alignment = PP_ALIGN.CENTER
        p.font.size = Pt(10)
        p.font.name = self.branding.font_family
        p.font.bold = bold
        
        if text_color:
            p.font.color.rgb = text_color
        
        if bg_color:
            cell.fill.solid()
            cell.fill.fore_color.rgb = bg_color

    def _get_data_bounds(self, data):
        numeric_data = data.apply(pd.to_numeric, errors='coerce')
        return numeric_data.min().min(), numeric_data.max().max()

    def _get_heatmap_color(self, val, min_v, max_v):
        """
        Maps a value to a 5-stop Color Scale:
        Deep Blue (Low) -> Light Blue -> White (Mid) -> Light Orange -> Deep Orange (High)
        """
        try:
            v = float(val)
        except:
            return RGBColor(255, 255, 255)

        if max_v == min_v: return RGBColor(255, 255, 255)
        
        norm = (v - min_v) / (max_v - min_v)
        
        # Color Stop Definitions
        COLD = (0, 0, 139)   # Dark Blue
        NEUTRAL = (255, 255, 255) # White
        HOT = (255, 140, 0)  # Dark Orange
        
        if norm < 0.5:
            # Interpolate Blue to White
            local_norm = norm * 2
            r = int(COLD[0] + (NEUTRAL[0] - COLD[0]) * local_norm)
            g = int(COLD[1] + (NEUTRAL[1] - COLD[1]) * local_norm)
            b = int(COLD[2] + (NEUTRAL[2] - COLD[2]) * local_norm)
        else:
            # Interpolate White to Orange
            local_norm = (norm - 0.5) * 2
            r = int(NEUTRAL[0] + (HOT[0] - NEUTRAL[0]) * local_norm)
            g = int(NEUTRAL[1] + (HOT[1] - NEUTRAL[1]) * local_norm)
            b = int(NEUTRAL[2] + (HOT[2] - NEUTRAL[2]) * local_norm)
            
        return RGBColor(r, g, b)

    def _format_value(self, val, fmt):
        if fmt == "percentage":
            try: return f"{float(val):.0%}"
            except: pass
        return str(val)
