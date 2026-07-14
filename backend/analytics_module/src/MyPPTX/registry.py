import logging
from typing import Dict, Any, Optional, NamedTuple
from pptx.enum.chart import XL_CHART_TYPE
from backend.analytics_module.schemas.export import ChartType

logger = logging.getLogger(__name__)

class ChartSchema(NamedTuple):
    """Metadata defining the technical and data requirements for a native chart."""
    pptx_type: Optional[XL_CHART_TYPE]
    data_shape: str          # Description: '1D' (Categorical), '2D' (Matrix/CrossTab), 'XY' (Coordinates)
    excel_tab: str           # The name of the worksheet in the embedded Excel file
    is_custom: bool = False  # If True, requires specialized composer logic (e.g. Funnel/NPS)

# The registry defines the DNA of every chart type in the system.
# It ensures that when the AI sends a "radar" request, the engine knows 
# exactly which Excel tab to write to and which MS Office chart constant to use.
CHART_CONFIG_REGISTRY: Dict[ChartType, ChartSchema] = {
    # ── Categorical Primitives ────────────────────────────────────────
    ChartType.BAR: ChartSchema(
        pptx_type=XL_CHART_TYPE.BAR_CLUSTERED, 
        data_shape="1D", 
        excel_tab="Bar_Data"
    ),
    ChartType.COLUMN: ChartSchema(
        pptx_type=XL_CHART_TYPE.COLUMN_CLUSTERED, 
        data_shape="1D", 
        excel_tab="Column_Data"
    ),
    ChartType.STACKED_BAR: ChartSchema(
        pptx_type=XL_CHART_TYPE.BAR_STACKED, 
        data_shape="2D", 
        excel_tab="Stacked_Bar_Data"
    ),
    ChartType.STACKED_COLUMN: ChartSchema(
        pptx_type=XL_CHART_TYPE.COLUMN_STACKED, 
        data_shape="2D", 
        excel_tab="Stacked_Column_Data"
    ),
    
    # ── Proportional Charts ───────────────────────────────────────────
    ChartType.PIE: ChartSchema(
        pptx_type=XL_CHART_TYPE.PIE, 
        data_shape="1D", 
        excel_tab="Pie_Data"
    ),
    ChartType.DONUT: ChartSchema(
        pptx_type=XL_CHART_TYPE.DOUGHNUT, 
        data_shape="1D", 
        excel_tab="Donut_Data"
    ),
    
    # ── Trend & Relationship Charts ───────────────────────────────────
    ChartType.LINE: ChartSchema(
        pptx_type=XL_CHART_TYPE.LINE_MARKERS, 
        data_shape="2D", 
        excel_tab="Trend_Data"
    ),
    ChartType.SCATTER: ChartSchema(
        pptx_type=XL_CHART_TYPE.XY_SCATTER, 
        data_shape="XY", 
        excel_tab="Quadrant_Data"
    ),
    ChartType.RADAR: ChartSchema(
        pptx_type=XL_CHART_TYPE.RADAR_MARKERS, 
        data_shape="2D", 
        excel_tab="Attribute_Grid"
    ),
    
    # ── Specialized / Custom Components ──────────────────────────────
    ChartType.FUNNEL: ChartSchema(
        pptx_type=XL_CHART_TYPE.BAR_STACKED, 
        data_shape="1D", 
        excel_tab="Funnel_Calculations",
        is_custom=True
    ),
    ChartType.NPS_GAUGE: ChartSchema(
        pptx_type=None, 
        data_shape="1D", 
        excel_tab="NPS_Metric",
        is_custom=True
    ),
    ChartType.KPI_CARD: ChartSchema(
        pptx_type=None, 
        data_shape="1D", 
        excel_tab="KPI_Values",
        is_custom=True
    ),
    ChartType.TABLE: ChartSchema(
        pptx_type=None, 
        data_shape="2D", 
        excel_tab="Source_Table",
        is_custom=True
    ),
    ChartType.HEATMAP: ChartSchema(
        pptx_type=None, 
        data_shape="2D", 
        excel_tab="Heatmap_Matrix",
        is_custom=True
    ),
    ChartType.WATERFALL: ChartSchema(
        pptx_type=XL_CHART_TYPE.BAR_STACKED, 
        data_shape="1D", 
        excel_tab="Waterfall_Data",
        is_custom=True
    )
}

def get_chart_config(chart_type: ChartType) -> ChartSchema:
    """Safely retrieves the technical schema for a specific chart type."""
    if chart_type not in CHART_CONFIG_REGISTRY:
        logger.error(f"[Registry] Unregistered chart type encountered: {chart_type}")
        # Default fallback to a basic bar chart to prevent pipeline crash
        return CHART_CONFIG_REGISTRY[ChartType.BAR]
    return CHART_CONFIG_REGISTRY[chart_type]
