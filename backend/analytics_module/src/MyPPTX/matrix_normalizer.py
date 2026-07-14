"""
Matrix Normalizer — Phase 2, Task 1.
Systematic engine for reshaping nested AI results into strict 2D matrices.
"""
import logging
import pandas as pd
import numpy as np
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

class MatrixNormalizer:
    """
    Expert utility for transforming multidimensional frontend data 
    into normalized matrices ready for native PowerPoint population.
    """
    
    @staticmethod
    def normalize(data: Any) -> Optional[pd.DataFrame]:
        """
        Normalizes incoming JSON data into a clean 2D DataFrame.
        Detects structure (Tidy vs Wide vs Nested) and reshapes accordingly.
        """
        if data is None:
            return None

        try:
            # 1. Handle Deep Nested Results (e.g. Cross-tabs)
            # Format: { "Brand A": { "Quality": 90, "Price": 70 }, "Brand B": { ... } }
            if isinstance(data, dict) and not all(isinstance(v, (int, float)) for v in data.values()):
                return MatrixNormalizer._from_nested_dict(data)

            # 2. Raw List Processing
            df = pd.DataFrame(data)
            if df.empty:
                return df

            # 3. Geometric Reshaping (Tidy to Wide)
            # If the data is 'Tidy' (Category, Series, Value columns), we MUST pivot it.
            if all(c in df.columns for c in ["category", "series", "value"]):
                return df.pivot(index="category", columns="series", values="value")

            # 4. Standard Label Discovery
            # Set the 'Identity' column as the index
            identity_candidates = ["category", "name", "label", "attribute", "main_att", "brand"]
            for col in identity_candidates:
                if col in df.columns:
                    df.set_index(col, inplace=True)
                    break
            
            # 5. Type Enforcement
            return MatrixNormalizer._clean_types(df)

        except Exception as e:
            logger.error(f"[Normalizer] Matrix failed to solidify: {e}", exc_info=True)
            return None

    @staticmethod
    def _from_nested_dict(data: Dict[str, Any]) -> pd.DataFrame:
        """
        Converts nested dictionaries into a Cross-Tab matrix.
        Rows = Attributes, Columns = Brands (or Series).
        """
        # Pandas handles dict-of-dicts naturally by alignment
        df = pd.DataFrame(data)
        return MatrixNormalizer._clean_types(df)

    @staticmethod
    def _clean_types(df: pd.DataFrame) -> pd.DataFrame:
        """
        Standardizes numeric columns and handles NaN values for PPTX stability.
        """
        # Ensure all potential value columns are numeric
        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Fill NaNs with 0 to prevent PPTX chart breakage
        return df.fillna(0.0)

    @staticmethod
    def scale_percentages(df: pd.DataFrame) -> pd.DataFrame:
        """
        Systematic Scaling: Ensures data is in the [0.0 - 1.0] range for 
        PowerPoint's internal NumberFormat system if percentages are detected.
        """
        if df.empty: return df
        
        # Strategy: If any value is > 1.05, assume 0-100 scale and divide.
        numeric_df = df.select_dtypes(include=[np.number])
        if not numeric_df.empty and numeric_df.max().max() > 1.05:
            return df / 100.0
        return df
