"""
Filter Awareness — Phase 4, Task 3.
Enriches chart headlines with metadata from active data slices.
Ensures that filtered reports are self-documenting in the final exported file.
"""
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

class FilterAwareness:
    """
    Contextual labeling engine for sliced data.
    Automatically detects active filters and appends them as bracketed metadata.
    """

    @staticmethod
    def enrich_title(base_title: str, chart_data: Dict[str, Any], global_metadata: Optional[Dict[str, Any]] = None) -> str:
        """
        Analyzes the component-level and report-level filters to decorate the title.
        Example: 'Brand Loyalty' -> 'Brand Loyalty - [Males, 18-34]'
        """
        if not base_title:
            return ""

        # 1. Harvest Active Slices
        # We look for both chart-specific filters and global report filters
        local_filters = chart_data.get("filters", {})
        global_filters = (global_metadata or {}).get("active_filters", {})
        
        # Merge filters while prioritizing local overrides
        all_filters = {**global_filters, **local_filters}
        
        slices = []
        for key, val in all_filters.items():
            # Skip 'All' or empty values which convey no specific slice
            if val and str(val).lower() not in ["all", "none", "total"]:
                # Clean up labels (e.g. 'Gender: Male' -> 'Male')
                clean_val = str(val).replace("_", " ").title()
                slices.append(clean_val)

        if not slices:
            return base_title

        # 2. Format Metadata String
        # Using square brackets is standard in market research for 'Base descriptions'
        metadata_str = f" [{', '.join(slices)}]"
        
        # 3. Guard against redundant appending
        if any(s.lower() in base_title.lower() for s in slices):
            # If the title already mentions the slice, we skip the bracket to keep it clean
            return base_title
            
        return f"{base_title}{metadata_str}"

    @staticmethod
    def get_filter_description(chart_data: Dict[str, Any]) -> str:
        """Returns a standalone text block describing the filter context."""
        filters = chart_data.get("filters", {})
        if not filters:
            return "Sample: Total Representative Base"
        
        slices = [f"{k}: {v}" for k, v in filters.items() if v and str(v).lower() != "all"]
        if not slices:
            return "Sample: Total Representative Base"
            
        return f"Filter Applied: {', '.join(slices)}"
