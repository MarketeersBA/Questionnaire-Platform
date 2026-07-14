import logging
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Union

logger = logging.getLogger(__name__)

class ChartDataTransformer:
    """
    Expert utility for transforming various frontend JSON data structures
    into normalized Pandas DataFrames ready for PPTX population.
    """
    
    @staticmethod
    def transform(data: Any, chart_type: str = "bar") -> Optional[pd.DataFrame]:
        """
        Main routing method for data transformation.
        """
        if not data:
            return None
            
        try:
            if chart_type in ["bar", "column", "pie", "donut"]:
                return ChartDataTransformer._to_standard_df(data)
            elif chart_type in ["stacked_bar", "stacked_column", "line"]:
                return ChartDataTransformer._to_matrix_df(data)
            elif chart_type in ["scatter", "bubble", "quadrant", "drivers"]:
                return ChartDataTransformer._to_xy_df(data)
            elif chart_type == "table":
                return ChartDataTransformer._to_standard_df(data) # Tables are usually flat rows
            
            # Fallback
            return ChartDataTransformer._to_standard_df(data)
        except Exception as e:
            logger.error(f"[Transformer] Failed to transform {chart_type} data: {e}")
            return None

    @staticmethod
    def _to_standard_df(data: Any) -> pd.DataFrame:
        """
        Converts flat arrays of dicts to a 1D DataFrame (Category vs Value).
        Example: [{"category": "Brand A", "value": 45}, ...]
        """
        if not isinstance(data, list):
            # If it's a single dict, wrap it
            data = [data]
            
        df = pd.DataFrame(data)
        
        # 1. Identify Category Column
        cat_col = None
        for col in ["category", "name", "label", "Attribute", "brand_name"]:
            if col in df.columns:
                cat_col = col
                break
        
        # 2. Identify Value Column
        val_cols = [c for c in df.columns if c not in [cat_col] and pd.api.types.is_numeric_dtype(df[c])]
        
        if cat_col:
            df.set_index(cat_col, inplace=True)
            
        return df

    @staticmethod
    def _to_matrix_df(data: Any) -> pd.DataFrame:
        """
        Converts nested data or tidy data to a Pivot Matrix (Categories in Index, Series in Columns).
        Example 1 (Tidy): [{"category": "A", "series": "S1", "value": 10}, ...]
        Example 2 (Nested): [{"category": "A", "S1": 10, "S2": 20}, ...]
        """
        df = pd.DataFrame(data)
        
        # If it's already in wide format (Category + Multiple Series as columns)
        if "category" in df.columns and len(df.columns) > 2:
            return df.set_index("category")
            
        # If it's in Tidy format, pivot it
        if all(c in df.columns for c in ["category", "series", "value"]):
            return df.pivot(index="category", columns="series", values="value")
            
        return df.set_index(df.columns[0]) if not df.empty else df

    @staticmethod
    def _to_xy_df(data: Any) -> pd.DataFrame:
        """
        Prepares data for Scatter/Driver charts (X, Y, Label).
        The resulting DF index will be the labels.
        """
        df = pd.DataFrame(data)
        
        # Standardize keys
        mapping = {
            "x_val": "x", "y_val": "y",
            "impact": "x", "performance": "y",
            "importance": "x", "satisfaction": "y"
        }
        df.rename(columns=mapping, inplace=True)
        
        # Set Label as index
        for col in ["name", "label", "attribute", "text"]:
            if col in df.columns:
                df.set_index(col, inplace=True)
                break
                
        return df

    @staticmethod
    def normalize_percentages(df: pd.DataFrame) -> pd.DataFrame:
        """
        Ensures percentage data is in 0.0-1.0 range for PPTX (which uses NumberFormat).
        """
        # Detect if values are > 1 (meaning they are likely 0-100)
        if not df.empty and df.select_dtypes(include=[np.number]).max().max() > 1.05:
            return df / 100.0
        return df
