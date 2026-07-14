"""
Purchase Funnel Logic — Phase 4, Task 1.
Translates conversion step data into a centered-stacked-bar matrix.
This provides a native, editable 'Funnel' look without using complex 3D objects.
"""
import logging
import pandas as pd
from typing import Dict, Any, List

logger = logging.getLogger(__name__)

class FunnelMapper:
    """
    Expert mapper for conversion data.
    Implements the 'Invisble Padding' strategy for a balanced funnel visual.
    """

    # Defined order of purchase funnel stages (Strategic Priority)
    STAGE_ORDER = [
        "awareness", "unaided awareness", "aided awareness",
        "consideration", "ever used", "usage", "regular usage",
        "p3m usage", "p1m usage", "loyalty", "most often"
    ]

    @staticmethod
    def map_data(df: pd.DataFrame) -> pd.DataFrame:
        """
        Transforms a standard 1-column Series into a 2-column matrix:
        [Invisible Padding, Actual Magnitude].
        This matrix, when plotted as a Stacked Bar, creates a centered Funnel.
        """
        if df.empty:
            return df

        # 1. Normalize Category Order (Funnel must flow downward)
        df = FunnelMapper._sort_funnel_stages(df)

        # 2. Extract the primary value column
        # If there are multiple series (e.g. Brands), we take the first one or sum them.
        # Generally, Funnels are shown for a single brand at a time.
        val_col = df.columns[0]
        
        # 3. Calculate Centering Padding
        # Padding = (Max_Value - Current_Value) / 2
        max_val = df[val_col].max()
        
        funnel_df = pd.DataFrame(index=df.index)
        funnel_df["_padding"] = (max_val - df[val_col]) / 2.0
        funnel_df["Conversion %"] = df[val_col]

        return funnel_df

    @staticmethod
    def _sort_funnel_stages(df: pd.DataFrame) -> pd.DataFrame:
        """Ensures the categories follow the awareness-to-loyalty hierarchy."""
        def get_rank(label: str) -> int:
            label_lower = str(label).lower()
            for i, stage in enumerate(FunnelMapper.STAGE_ORDER):
                if stage in label_lower:
                    return i
            return 99 # Unknown stages go to the end

        # Create a temporary rank column for deterministic sorting
        ranks = [get_rank(idx) for idx in df.index]
        df = df.copy()
        df["__rank__"] = ranks
        df = df.sort_values("__rank__").drop(columns=["__rank__"])
        return df
