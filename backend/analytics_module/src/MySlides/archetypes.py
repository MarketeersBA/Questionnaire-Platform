"""
Brand Archetype Manager for Focus Brand Scaling.
Differentiates between 'Our Brand' and competitors for tailored slide generation.
"""
import logging
from enum import Enum
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

class BrandArchetype(Enum):
    OWN_BRAND = "own_brand"
    MAIN_COMPETITOR = "main_competitor"
    MARKET_BENCHMARK = "benchmark"
    OTHER = "other"

class ArchetypeManager:
    """Classifies brands into strategic archetypes."""
    def __init__(self, project_inputs: dict):
        self.my_brand = project_inputs.get("my_brand", "").strip().lower()
        self.top_competitors = [c.strip().lower() for c in (project_inputs.get("top_competitors") or [])]
        self.merge_secondary = bool(project_inputs.get("merge_secondary_as_benchmark", False))

    def get_brand_archetype(self, brand: str) -> BrandArchetype:
        brand_clean = brand.strip().lower()
        if brand_clean == self.my_brand:
            return BrandArchetype.OWN_BRAND
        if brand_clean in self.top_competitors:
            return BrandArchetype.MAIN_COMPETITOR
        return BrandArchetype.OTHER

    def get_effective_brands_for_loop(self, brands: List[str]) -> List[Union[str, List[str]]]:
        """Combine secondary brands into a list of names if merging is enabled (Phase 3)."""
        if not self.merge_secondary:
            return brands
            
        final_list = []
        for brand in brands:
            arch = self.get_brand_archetype(brand)
            if arch != BrandArchetype.MARKET_BENCHMARK:
                final_list.append(brand)
        
        # Add the merged secondary list as a single 'benchmark' entry
        secondary = self.filter_brands_by_archetype(brands, BrandArchetype.MARKET_BENCHMARK)
        if secondary:
            final_list.append(secondary) # PivotStore handles lists as averages
            
        return final_list

    def get_report_fidelity(self, archetype: BrandArchetype) -> Dict[str, Any]:
        """Determine analytical depth for a given archetype (Phase 1)."""
        if archetype == BrandArchetype.OWN_BRAND:
            return {"fidelity": "high", "slides": 12, "detail": "deep_dive"}
        if archetype == BrandArchetype.MAIN_COMPETITOR:
            return {"fidelity": "standard", "slides": 6, "detail": "standard"}
        return {"fidelity": "overview", "slides": 2, "detail": "benchmark"}

    def is_section_supported_by_archetype(self, section: str, archetype: BrandArchetype) -> bool:
        """Filter specific deep-dive sections based on brand strategic priority (Phase 2)."""
        # Deep-dive SWOT or sensory analysis only for Our Brand
        deep_dive_sections = ["SWOT Analysis", "Sensory Attributes Deep-Dive", "Attribute Drivers"]
        if section in deep_dive_sections:
            return archetype == BrandArchetype.OWN_BRAND
        return True

    def get_archetype_theme(self, archetype: BrandArchetype) -> Dict[str, str]:
        """Determine color themes for the visual layers (Phase 4)."""
        if archetype == BrandArchetype.OWN_BRAND:
            return {"sc_theme": "corporate_primary", "mc_theme": "primary_highlight"}
        if archetype == BrandArchetype.MAIN_COMPETITOR:
            return {"sc_theme": "competitor_dark", "mc_theme": "competitor_contrast"}
        return {"sc_theme": "neutral_gray", "mc_theme": "benchmark_dots"}
