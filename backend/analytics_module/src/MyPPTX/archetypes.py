"""
Master Slide Registry — Phase 1, Task 1.
Rigorous mapping between frontend chart archetypes and template slide indices.
De-couples UI logic from PPTX structure.
"""
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

# The ARCHETYPE_MAP links frontend chart identifiers to specific slide indices 
# in the 'template.pptx' file. Each referenced slide must contain valid 
# placeholder charts of the corresponding type to ensure native interactivity.
ARCHETYPE_MAP = {
    # ── High-Fidelity Analysis Mappings ───────────────────────────────
    "brand_awareness":   {"index": 1,  "name": "Brand Awareness Grid"},
    "purchase_funnel":   {"index": 4,  "name": "Funnel Snapshot"},
    "market_position":   {"index": 17, "name": "Strategic Matrix"},
    "imagery_profile":   {"index": 27, "name": "Brand Imagery Profile"},
    "driver_analysis":   {"index": 14, "name": "Drivers & Barriers"},
    "nps_overview":      {"index": 61, "name": "Executive Promoter Score"},
    
    # ── Geometric Fallbacks (Based on 'chart_type' string) ─────────────
    "bar":               {"index": 21, "name": "Generic Clustered Bar"},
    "column":            {"index": 21, "name": "Generic Clustered Column"},
    "stacked_bar":       {"index": 54, "name": "Segmented Comparison"},
    "radar":             {"index": 27, "name": "Spider/Radar Plot"},
    "funnel":            {"index": 4,  "name": "Conversion Funnel"},
    "nps_gauge":         {"index": 61, "name": "Gauge Visual"},
    "line":              {"index": 47, "name": "Trend Analysis"},
    "table":             {"index": 6,  "name": "Data Matrix Table"},
    "scatter":           {"index": 14, "name": "Quadrant/Scatter"},
}

def resolve_archetype(chart_data: Dict[str, Any]) -> int:
    """
    Expert Selector: Determines the best archetype slide index.
    Prioritizes specific analysis IDs over generic geometric types.
    """
    chart_id = chart_data.get("chart_id", "").lower()
    chart_type = chart_data.get("chart_type", "").lower()
    
    # 1. Direct ID Resolve
    if chart_id in ARCHETYPE_MAP:
        logger.debug(f"[Archetype] Resolved {chart_id} to index {ARCHETYPE_MAP[chart_id]['index']}")
        return ARCHETYPE_MAP[chart_id]["index"]
        
    # 2. Geometric Resolve
    if chart_type in ARCHETYPE_MAP:
        logger.debug(f"[Archetype] Resolved type {chart_type} to index {ARCHETYPE_MAP[chart_type]['index']}")
        return ARCHETYPE_MAP[chart_type]["index"]
        
    # 3. Fuzzy Geometric Mappings
    if "bar" in chart_type:
        return ARCHETYPE_MAP["bar"]["index"]
    if "line" in chart_type:
        return ARCHETYPE_MAP["line"]["index"]
    if "grid" in chart_type or "table" in chart_type:
        return ARCHETYPE_MAP["table"]["index"]

    # 4. Global Fallback (Standard Bar chart on Slide 21)
    logger.warning(f"[Archetype] Fallback used for {chart_id}/{chart_type}")
    return ARCHETYPE_MAP["bar"]["index"]
