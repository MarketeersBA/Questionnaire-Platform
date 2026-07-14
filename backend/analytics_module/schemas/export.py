from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum

class ChartType(str, Enum):
    BAR = "bar"
    COLUMN = "column"
    STACKED_BAR = "stacked_bar"
    STACKED_COLUMN = "stacked_column"
    PIE = "pie"
    DONUT = "donut"
    LINE = "line"
    AREA = "area"
    SCATTER = "scatter"
    BUBBLE = "bubble"
    RADAR = "radar"
    FUNNEL = "funnel"
    NPS_GAUGE = "nps_gauge"
    TABLE = "table"
    KPI_CARD = "kpi_card"
    HEATMAP = "heatmap"
    WATERFALL = "waterfall"

class SlideType(str, Enum):
    COVER = "cover"
    SECTION_DIVIDER = "section_divider"
    SINGLE_CHART = "single_chart"
    DUAL_CHART = "dual_chart"
    CHART_WITH_KPI = "chart_with_kpi"
    FULL_TABLE = "full_table"
    NPS_PAGE = "nps_page"
    CROSSTAB_PAGE = "crosstab_page"
    APPENDIX = "appendix"
    CLOSING = "closing"

class FilterDimension(BaseModel):
    dimension_key: str
    display_label: str
    selected_values: List[str] = Field(default_factory=list)

class ChartDefinition(BaseModel):
    chart_id: str
    chart_title: str
    chart_type: ChartType
    subtitle: Optional[str] = None
    insight: Optional[str] = None
    base_n: Optional[int] = None
    data_summary: Optional[Dict[str, Any]] = None
    filter_awareness: bool = True
    metric_format: str = "percentage"  # percentage, currency, integer
    
class SlideDefinition(BaseModel):
    slide_type: SlideType
    section_title: str
    charts: List[ChartDefinition]
    insight_summary: Optional[str] = None
    order_index: int

class BrandingConfig(BaseModel):
    primary_color: str = "#000080"  # Default Navy
    secondary_color: str = "#50C878" # Default Emerald
    accent_color: str = "#FF1493"    # Default Pink
    font_family: str = "Pangram"
    logo_path: Optional[str] = None
    theme_variant: str = "LIGHT"  # LIGHT, DARK, BRAND

class ReportExportSchema(BaseModel):
    survey_id: str
    report_title: str
    wave_name: Optional[str] = "Main Wave"
    total_n: int
    brand_list: List[str]
    client_brand: str
    slides: List[SlideDefinition]
    global_filters: List[FilterDimension] = Field(default_factory=list)
    branding: BrandingConfig = Field(default_factory=BrandingConfig)
    export_at: Optional[str] = None
