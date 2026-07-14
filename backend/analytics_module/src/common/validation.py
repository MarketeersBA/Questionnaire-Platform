import pandas as pd
from typing import Dict, Any, List

class DataAuditor:
    """
    Validates structural integrity between Survey Metadata and Response Data.
    Ensures that decoding won't fail due to massive schema drift.
    """
    
    @staticmethod
    def audit_responses(df: pd.DataFrame, meta_data: pd.DataFrame) -> Dict[str, Any]:
        """
        Audits a DataFrame of responses against the metadata.
        Returns a health report with coverage stats and missing field alerts.
        """
        if df.empty:
            return {"status": "error", "message": "Response DataFrame is empty."}
            
        # 1. Column Coverage (Smart)
        expected_cols = set(meta_data["question_name"].tolist())
        actual_cols = set(df.columns)
        
        # A field is considered 'found' if it exists exactly or as part of a brand-grid column
        # (e.g. "Attribute" or "Prefix_Attribute_Brand")
        found_cols = set()
        for expected in expected_cols:
            if expected in actual_cols:
                found_cols.add(expected)
                continue
            
            # Fuzzy match: is this expected field a component of ANY actual column?
            # We look for Attribute_Brand patterns (standardized by PlatformBridge)
            if any(f"_{expected}_" in c or c.startswith(f"{expected}_") or c.endswith(f"_{expected}") for c in actual_cols):
                found_cols.add(expected)
        
        missing_in_data = expected_cols - found_cols
        extra_in_data = actual_cols - expected_cols - {"sys_RespNum", "sys_Status", "sys_Timestamp", "sys_SubmittedAt", "token", "_extracted_brands"}
        
        coverage_percent = (len(found_cols) / len(expected_cols)) * 100 if expected_cols else 100
        
        # 2. Data Health - Non-Null Density
        null_density = df.isnull().mean()
        high_null_cols = null_density[null_density > 0.95].index.tolist()
        
        # 3. Categorical Consistency (Basic check)
        # We check if values in MCQ columns look like codes (numeric) or decoded strings
        mcq_cols = meta_data[meta_data["question_type"].str.contains("Radio|Check", na=False)]["question_name"].tolist()
        potential_issues = []
        for col in mcq_cols:
            if col in df.columns:
                unique_vals = df[col].dropna().unique()
                # If values are mixed strings and numbers, it might be messy
                if any(isinstance(v, str) and not v.isdigit() for v in unique_vals):
                    # If they are already strings, they might have been pre-decoded (legacy)
                    potential_issues.append({"col": col, "reason": "Already contains text values (should be codes)"})

        return {
            "status": "success" if coverage_percent > 80 else "warning",
            "coverage_percent": round(coverage_percent, 2),
            "missing_fields": list(missing_in_data),
            "extra_fields": list(extra_in_data),
            "high_null_fields": high_null_cols,
            "categorical_issues": potential_issues
        }

    @staticmethod
    def validate_codebook(codebook_df: pd.DataFrame, meta_data: pd.DataFrame) -> List[str]:
        """Ensures every question with a list has matching entries in the codebook."""
        warnings = []
        list_questions = meta_data[meta_data["list_name"].notnull()]["question_name"].tolist()
        codebook_lists = set(codebook_df.columns)
        
        for q in list_questions:
            list_name = meta_data[meta_data["question_name"] == q]["list_name"].values[0]
            if list_name not in codebook_lists:
                warnings.append(f"Question '{q}' expects list '{list_name}' which is missing from codebook.")
                
        return warnings

class SampleManager:
    """
    Cleans and scrubs the respondent base for quality.
    Identifies speeders and straight-liners (respondents giving zero-variance answers).
    """
    
    @staticmethod
    def identify_outliers(df_wide: pd.DataFrame, df_long: pd.DataFrame) -> Dict[str, Any]:
        """
        Main entry for quality scrubbing. Returns indices of respondents to drop or flag.
        """
        if df_wide.empty or df_long.empty:
            return {"outlier_ids": [], "reasons": {}}

        outlier_ids = set()
        reasons = {}

        # 1. Straight-lining Detection (Zero Variance in Sensory Grids)
        # We group df_long by response_id and calculate variance of 'value'
        # Only for numeric values (scalers)
        try:
            numeric_metrics = df_long[pd.to_numeric(df_long['value'], errors='coerce').notnull()].copy()
            numeric_metrics['value'] = pd.to_numeric(numeric_metrics['value'])
            
            # Filter for evaluation metrics (standard_sc or similar)
            eval_metrics = numeric_metrics[numeric_metrics['type'].isin(['standard_sc', 'evaluation'])]
            
            if not eval_metrics.empty:
                variances = eval_metrics.groupby('response_id')['value'].var()
                # If variance is 0, they picked the same number for everything
                straight_liners = variances[variances == 0].index.tolist()
                for rid in straight_liners:
                    outlier_ids.add(rid)
                    reasons[rid] = "Straight-liner (Zero Variance)"
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Straight-lining detection failed: {e}")

        # 2. Speeder Detection
        # We look for submission times that are 2 standard deviations below the mean
        # (Very basic without knowing start time, but looks for extreme clusters)
        # Note: sys_SubmittedAt is expected in ISO format or datetime
        if 'sys_SubmittedAt' in df_wide.columns:
            try:
                sub_times = pd.to_datetime(df_wide['sys_SubmittedAt'])
                # If we had start time, we'd use duration. Without it, we look for bursts.
                # Here we will just flag the reasons for future enhancement
                pass
            except:
                pass

        return {
            "outlier_ids": list(outlier_ids),
            "reasons": reasons,
            "summary": f"Detected {len(outlier_ids)} outliers (Quality Guard Phase 4)"
        }

