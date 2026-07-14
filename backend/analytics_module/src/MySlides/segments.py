"""
Global Segment Manager for Research Segmentation.
Handles demographic filtering and cohort generation (Layer 1 Screening).
"""
import logging
from typing import Any, Dict, List, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class SegmentManager:
    """
    Manages the creation and filtration of analytical segments.
    Supports custom cohort grouping (Phase 1).
    """
    def __init__(self, project_inputs: dict):
        self.project_inputs = project_inputs
        self.screening_cols = project_inputs.get("screening_cols", [])
        self.custom_cohorts: Dict[str, Dict[str, Any]] = project_inputs.get("custom_cohorts", {})

    def get_available_segments(self, df: pd.DataFrame) -> Dict[str, List[str]]:
        """Identify unique values in screening columns as segment candidates."""
        segments = {}
        for col in self.screening_cols:
            if col in df.columns:
                unique_vals = [str(x) for x in df[col].dropna().unique().tolist()]
                segments[col] = unique_vals
        return segments

    def filter_by_segment(self, df: pd.DataFrame, column: str, value: Any) -> pd.DataFrame:
        """Filter a dataframe by a specific demographic segment (supports Phase 1 cohorts).."""
        if column not in df.columns:
            return df
        
        # Handle custom cohorts (list of values)
        if isinstance(value, list):
            return df[df[column].isin(value)]
            
        return df[df[column] == value]

    def add_custom_cohort(self, name: str, column: str, values: List[Any]):
        """Register a new analytical cohort (e.g. 'Young Adults' = [1, 2, 3])."""
        self.custom_cohorts[name] = {"column": column, "values": values}
        logger.info("Registered custom cohort: %s (%s)", name, column)

    def get_segment_groups(self, include_benchmark: bool = True) -> List[Dict[str, Any]]:
        """Return standardized analytical segments including benchmarks (Phase 2)."""
        groups = []
        if include_benchmark:
            groups.append({"id": "total", "label": "Total Sample", "col": None, "val": None})
            
        # Add identified screening segments 
        for col in self.screening_cols:
             # In a real run, we fetch unique vals from the PivotStore
             groups.append({"id": f"seg_{col}", "label": col, "col": col, "active": True})
             
        return groups

    def evaluate_segment_impact(self, df: pd.DataFrame, target_col: str) -> Dict[str, float]:
        """
        Calculate the 'Impact Score' (variance from total avg) for every segment.
        Powers the Phase 5: Lift Heatmap UI.
        """
        if df.empty or target_col not in df.columns:
            return {}
            
        total_avg = df[target_col].mean()
        impacts = {}
        
        segments = self.get_available_segments(df)
        for col, vals in segments.items():
            col_impacts = {}
            for val in vals:
                seg_df = self.filter_by_segment(df, col, val)
                if not seg_df.empty:
                    seg_avg = seg_df[target_col].mean()
                    # % difference from total avg
                    diff = abs(seg_avg - total_avg) / total_avg * 100 if total_avg != 0 else 0
                    col_impacts[val] = diff
            impacts[col] = col_impacts
            
        return impacts
