"""
Pivot Table and Data Normalization utilities.
Replaces the legacy ssi3PivotMaker.
"""
import pandas as pd
import re
from typing import List, Optional

def normalize_one_hot_to_rows(
    df: pd.DataFrame, 
    brand_after_s_us: Optional[List[str]] = None, 
    brand_after_dot: Optional[List[str]] = None
) -> pd.DataFrame:
    """
    Transforms wide-format survey data into long-format (brand-centric).
    Example: 'Attitude_Nike' -> brand='Nike', value=...
    """
    if df.empty:
        return df

    results = []
    
    # 1. Process brand_after_s_us (prefix_brand)
    if brand_after_s_us:
        for prefix in brand_after_s_us:
            # Pattern: prefix_brand
            cols = [c for c in df.columns if c.startswith(f"{prefix}_")]
            if not cols: continue
            
            for col in cols:
                brand = col.split('_', 1)[1]
                temp = df[[col]].rename(columns={col: prefix})
                temp['brand'] = brand
                results.append(temp)

    # 2. Process brand_after_dot (prefix.brand)
    if brand_after_dot:
        for prefix in brand_after_dot:
            cols = [c for c in df.columns if c.startswith(f"{prefix}.")]
            if not cols: continue
            
            for col in cols:
                brand = col.split('.', 1)[1]
                temp = df[[col]].rename(columns={col: prefix})
                temp['brand'] = brand
                results.append(temp)

    if not results:
        return df

    # Combine all melted pieces
    # This is a simplified version of the legacy mixer
    combined = pd.concat(results, axis=0, ignore_index=True)
    return combined
