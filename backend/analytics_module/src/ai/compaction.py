import pandas as pd
import numpy as np
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

class DataCompactor:
    """
    Semantic Data Compactor.
    Transforms raw metrics into statistical "Signals" (Outliers/Deltas).
    """

    @staticmethod
    def calculate_significance(df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates Z-scores for numeric values in a DataFrame to detect outliers.
        Z = (x - mean) / std
        """
        numeric_df = df.select_dtypes(include=[np.number])
        if numeric_df.empty:
            return pd.DataFrame()
            
        # Global stats across all brands/attributes in this slice
        # Using a flattened context to find relative outperformance
        values = numeric_df.values.flatten()
        values = values[~np.isnan(values)]
        
        if len(values) < 5: # Not enough data for statistical significance
            return pd.DataFrame()
            
        mean = np.mean(values)
        std = np.std(values)
        
        if std == 0:
            return pd.DataFrame()
            
        z_scores = (numeric_df - mean) / std
        return z_scores

    @classmethod
    def compact_dataframe(cls, 
                          df: pd.DataFrame, 
                          budget_chars: int, 
                          min_z_threshold: float = 1.0) -> str:
        """
        Converts a DataFrame into a high-density "Signal" summary.
        Filters out points near the average (Noise) and focuses on Outliers.
        """
        if df.empty:
            return "(Empty Data)"

        z_scores = cls.calculate_significance(df)
        
        # Define high-impact buckets
        anchors = [] # Positive outliers (Strength)
        risks = []   # Negative outliers (Weakness)
        averages = [] # Middle ground (Context)

        # ADAPTIVE THRESHOLD:
        # If budget is extremely tight, increase the threshold to only show EXTREME outliers
        actual_threshold = min_z_threshold
        if budget_chars < 1000:
            actual_threshold = 1.5
        if budget_chars < 500:
            actual_threshold = 2.0

        for col in df.columns:
            for idx in df.index:
                val = df.loc[idx, col]
                if pd.isna(val): continue
                
                z = z_scores.loc[idx, col] if not z_scores.empty and (idx, col) in z_scores.index else 0
                
                entry = f"{idx} -> {col}: {val}"
                if isinstance(val, (int, float)) and val <= 1.0: # Percentage
                    entry = f"{idx} -> {col}: {val*100:.1f}%"
                
                if z >= actual_threshold:
                    anchors.append(f"🟢 [ANCHOR] {entry} (Sigma: {z:.1f})")
                elif z <= -actual_threshold:
                    risks.append(f"🔴 [RISK] {entry} (Sigma: {z:.1f})")
                else:
                    averages.append(f"⚪ {entry}")

        # Assemble based on priority (Anchors > Risks > Averages)
        # We fill the budget until full
        output_lines = []
        
        # 1. Strategic Anchors
        if anchors:
            output_lines.append("### STRATEGIC ANCHORS (High Performance)")
            output_lines.extend(anchors)
        
        # 2. Critical Risks
        if risks:
            if output_lines: output_lines.append("")
            output_lines.append("### CRITICAL RISKS (Underperformance)")
            output_lines.extend(risks)
            
        # 3. Market Averages (only if space permits)
        if averages and len("\n".join(output_lines)) < (budget_chars * 0.6):
            if output_lines: output_lines.append("")
            output_lines.append("### MARKET NOISE (Reference Context)")
            output_lines.extend(averages)

        result = "\n".join(output_lines)
        
        if len(result) > budget_chars:
            # Final truncation with ellipsis
            return result[:budget_chars-3] + "..."
            
        return result

    @classmethod
    def compact_dict(cls, data: Dict[str, Any], budget_chars: int) -> str:
        """Handles nested dictionary payloads (common in survey data)."""
        parts = []
        # Distribute budget across top-level keys
        sub_budget = budget_chars // max(len(data), 1)
        
        for k, v in data.items():
            if isinstance(v, pd.DataFrame):
                parts.append(f"[{k.upper()}]\n{cls.compact_dataframe(v, sub_budget)}")
            elif isinstance(v, list):
                # Sample the list if needed
                items = [str(x) for x in v if x][:5]
                parts.append(f"[{k.upper()}] (Sample size: {len(v)})\n- " + "\n- ".join(items))
            else:
                parts.append(f"{k}: {str(v)[:100]}")
        
        return "\n\n".join(parts)[:budget_chars]

def compact_data(data: Any, budget_chars: int) -> str:
    """Universal Entry Point for Context Compaction."""
    if data is None:
        return "(No data)"
    if isinstance(data, pd.DataFrame):
        return DataCompactor.compact_dataframe(data, budget_chars)
    if isinstance(data, dict):
        return DataCompactor.compact_dict(data, budget_chars)
    return str(data)[:budget_chars]
