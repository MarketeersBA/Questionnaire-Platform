"""
Series Alignment — Phase 2, Task 3.
Ensures logical ordering and structural integrity for complex multi-series charts.
Focuses on Stacked Bars, 100% Stacked Bars, and Multi-Line Trends.
"""
import logging
import pandas as pd
from typing import Optional, List

logger = logging.getLogger(__name__)

class SeriesAligner:
    """
    Expert utility for balancing and sorting data matrices.
    Ensures the 'Legend' (Columns) and 'Axis' (Index) items are 
    aligned deterministically for a professional analytical feel.
    """

    @staticmethod
    def align(df: pd.DataFrame, chart_type: str = "bar", brands: Optional[List[str]] = None) -> pd.DataFrame:
        """
        Refines the 2D matrix before it hits the Chart Injector.
        - Sanitizes category labels.
        - Reorders series for brand priority.
        - Balances multi-series alignment.
        """
        if df is None or df.empty:
            return df

        # 1. Semantic Pruning
        # Removes 'Zombie' categories (Other, N/A) that clutter executive views.
        df = SeriesAligner._prune_noise(df)

        # 2. Brand Priority Alignment
        if brands:
            df = SeriesAligner.enforce_brand_priority(df, brands)

        # 3. Priority Sorting (Categories)
        # For Stacked Bar/Column: Sort Categories by Total Magnitude for a 'Pareto' effect.
        if "stacked" in chart_type:
            df = SeriesAligner._sort_by_magnitude(df)
        else:
            # For standard bars: Sort by primary value (usually target brand)
            if len(df.columns) > 0:
                df = df.sort_values(df.columns[0], ascending=False)

        # 4. 100% Stacked Logic (Normalization)
        if "100" in chart_type:
            df = SeriesAligner._normalize_to_100(df)

        return df

    @staticmethod
    def apply_filter_context(df: pd.DataFrame, dimension_label: str) -> pd.DataFrame:
        """
        Implementation of the "Filter as Legend" strategy.
        Prefixes columns with the Dimension label to create a dashboard-like
        interactivity in the native PowerPoint legend.
        """
        if df is None or df.empty:
            return df
            
        # Example: columns ['Male', 'Female'] become ['Gender: Male', 'Gender: Female']
        new_cols = {col: f"{dimension_label}: {col}" for col in df.columns if ":" not in str(col)}
        return df.rename(columns=new_cols)

    @staticmethod
    def _prune_noise(df: pd.DataFrame) -> pd.DataFrame:
        """Removes research artifacts and low-value categories."""
        noise_keywords = ["other", "none", "n/a", "أخرى", "specify", "refused", "unknown"]
        # Use case-insensitive contains to match 'Other (Specify)' etc.
        mask = [not any(kw in str(val).lower() for kw in noise_keywords) for val in df.index]
        return df[mask]

    @staticmethod
    def _sort_by_magnitude(df: pd.DataFrame) -> pd.DataFrame:
        """Sorts categories by the sum of all visible series."""
        try:
            temp_total = df.sum(axis=1)
            sorted_index = temp_total.sort_values(ascending=False).index
            return df.reindex(sorted_index)
        except Exception:
            return df

    @staticmethod
    def _normalize_to_100(df: pd.DataFrame) -> pd.DataFrame:
        """Converts columns to relative percentages of the row total."""
        try:
            row_totals = df.sum(axis=1).replace(0, 1)
            return df.div(row_totals, axis=0) * 100.0
        except Exception:
            return df
            
    @staticmethod
    def enforce_brand_priority(df: pd.DataFrame, brands: List[str]) -> pd.DataFrame:
        """
        Ensures the 'Legend' ordering follows the strategic priority.
        Target brand always comes first, followed by key competitors.
        """
        current_cols = df.columns.tolist()
        ordered_cols = []
        
        # 1. Place known priority brands first
        for brand in brands:
            brand_matches = [c for c in current_cols if brand.lower() in str(c).lower()]
            for match in brand_matches:
                if match not in ordered_cols:
                    ordered_cols.append(match)
        
        # 2. Append remaining columns
        for col in current_cols:
            if col not in ordered_cols:
                ordered_cols.append(col)
                
        return df.reindex(columns=ordered_cols)

