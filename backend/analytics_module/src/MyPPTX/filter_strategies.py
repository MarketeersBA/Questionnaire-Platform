import logging
from enum import Enum
from typing import Dict, List, NamedTuple, Optional

logger = logging.getLogger(__name__)

class pptx_series_strategy(str, Enum):
    """
    Logic for how filter slices are visually represented in PowerPoint.
    """
    MULTI_SERIES = "multi_series"      # All slice values plotted on one chart (Comparison mode)
    SEPARATE_SLIDES = "separate_slides" # One slide generated per slice value (Deep-dive mode)
    FILTERED_SINGLE = "filtered_single" # Only the strictly filtered data is shown (Single view)

class DimensionStrategy(NamedTuple):
    """Configuration for how a specific respondent dimension behaves during export."""
    display_label: str
    strategy: pptx_series_strategy
    color_map_key: Optional[str] = None # Link to specific palette in chart_themes.json

# ── Dimension Strategy Mapping ────────────────────────────────────────
# Defines the machine-to-human mapping and the rendering logic for every
# respondent slice available in the platform.
FILTER_STRATEGY_MAP: Dict[str, DimensionStrategy] = {
    "gender": DimensionStrategy(
        display_label="By Gender",
        strategy=pptx_series_strategy.MULTI_SERIES,
        color_map_key="gender_colors"
    ),
    "age_group": DimensionStrategy(
        display_label="By Age Band",
        strategy=pptx_series_strategy.MULTI_SERIES,
        color_map_key="age_segment_palette"
    ),
    "sec_class": DimensionStrategy(
        display_label="By Socio-Economic Class",
        strategy=pptx_series_strategy.MULTI_SERIES,
        color_map_key="sec_palette"
    ),
    "region": DimensionStrategy(
        display_label="Regional Breakdown",
        strategy=pptx_series_strategy.SEPARATE_SLIDES,
        color_map_key="geo_colors"
    ),
    "brand_usage": DimensionStrategy(
        display_label="User Segments",
        strategy=pptx_series_strategy.MULTI_SERIES,
        color_map_key="usage_intensity"
    ),
    "wave": DimensionStrategy(
        display_label="Tracker Wave",
        strategy=pptx_series_strategy.MULTI_SERIES,
        color_map_key="time_series_shades"
    ),
    "total": DimensionStrategy(
        display_label="Total Market",
        strategy=pptx_series_strategy.FILTERED_SINGLE,
        color_map_key="default"
    )
}

def resolve_filter_strategy(dimension_key: str) -> DimensionStrategy:
    """
    Determines the visual architecture for a specific filter slice.
    Defaults to MULTI_SERIES if the machine key is unrecognized.
    """
    key = dimension_key.lower()
    if key in FILTER_STRATEGY_MAP:
        return FILTER_STRATEGY_MAP[key]
    
    logger.debug(f"[FilterStrategy] No specific strategy for {dimension_key}, defaulting to Comparison Mode.")
    return DimensionStrategy(
        display_label=dimension_key.capitalize(),
        strategy=pptx_series_strategy.MULTI_SERIES
    )

def calculate_required_slides(strategy: pptx_series_strategy, values: List[str]) -> int:
    """
    Calculates how many slides a single ChartDefinition will generate.
    """
    if strategy == pptx_series_strategy.SEPARATE_SLIDES:
        return len(values)
    return 1 # Multi-series or single view only take one slide
