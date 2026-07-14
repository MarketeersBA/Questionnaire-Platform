"""
Marketeers Brand Analyzer — Advanced Mathematical Engine (v2.0)

This module implements the 10-stage technical documentation for Brand Equity calculations.
Optimized for high performance using NumPy vectorization.
"""

import math
import numpy as np
import pandas as pd
from typing import List, Tuple, Any, Optional, Dict

# --- Fundamental Statistics (Vectorized) ---

def get_average(data: List[float]) -> float:
    return float(np.mean(data)) if data else 0.0

def get_variance(data: List[float]) -> float:
    return float(np.var(data, ddof=1)) if len(data) > 1 else 0.0

def get_stdev(data: List[float]) -> float:
    return float(np.std(data, ddof=1)) if len(data) > 1 else 0.0

def get_number_count(arr: List[int], number: int) -> int:
    return int(np.sum(np.array(arr) == number))

def get_correlation(utilities: np.ndarray, attribute_scores: np.ndarray) -> Tuple[float, float]:
    """
    [Stage 4] Pearson Correlations
    High-performance correlation between Utility (preference) and Attribute associations.
    Accepts NumPy arrays directly.
    """
    # Ensure inputs are float64 NumPy arrays
    y = np.asanyarray(utilities, dtype=np.float64)
    x = np.asanyarray(attribute_scores, dtype=np.float64)
    
    mask = ~np.isnan(x) & ~np.isnan(y)
    if not np.any(mask) or np.sum(mask) < 2:
        return 0.0, 0.0
    
    xi, yi = x[mask], y[mask]
    
    # Check for zero variance
    if np.std(xi) == 0 or np.std(yi) == 0:
        return 0.0, 0.0
        
    corr_matrix = np.corrcoef(xi, yi)
    pearson = float(corr_matrix[0, 1])
    cov_xy = float(np.cov(xi, yi)[0, 1])
    
    return cov_xy, pearson

# --- Array Reshaping (Stages 2 & 3) ---

def arr_one_d(ut_of_brand: List[List[float]], seg_respondent_count: int, seg_brand_count: int) -> List[float]:
    """
    [Stage 2] Flatten Utility to 1D
    Stacks respondent-brand utilities into a column-major vector.
    """
    arr = np.array(ut_of_brand)
    return arr.T.flatten().tolist()

def arr_one_i(ut_of_brand: List[List[int]], all_respondent_count: int) -> List[int]:
    """Legacy helper for row-bounded flattening."""
    arr = np.array(ut_of_brand)
    if all_respondent_count < arr.shape[0]:
        arr = arr[:all_respondent_count, :]
    return arr.T.flatten().tolist()

def arr_transform(scores: np.ndarray, seg_attr_count: int, seg_brand_count: int, seg_respondent_count: int) -> np.ndarray:
    """
    [Stage 3] Reshape Scores for Correlation
    Reshapes raw [Resp x (Attr*Brand)] grid into [ (Resp*Brand) x Attr ] format.
    Returns NumPy array.
    """
    raw_np = np.asanyarray(scores)
    # Reshape to 3D: [Resp, Attr, Brand]
    scores_3d = raw_np.reshape(seg_respondent_count, seg_attr_count, seg_brand_count)
    # Transpose to [Attr, Brand, Resp]
    swapped = scores_3d.transpose(1, 2, 0)
    # Flatten last two dimensions to get [Attr, (Brand*Resp)]
    transformed = swapped.reshape(seg_attr_count, seg_brand_count * seg_respondent_count).T
    return transformed

def arr_transform_new(scores: Any, seg_attr_count: int, seg_brand_count: int, seg_respondent_count: int) -> np.ndarray:
    return arr_transform(scores, seg_attr_count, seg_brand_count, seg_respondent_count)

# --- Correlations ---

def corr_calc(scores_transform: np.ndarray, ut_array: np.ndarray, seg_attr_count: int, seg_respondent_count: int, seg_brand_count: int) -> List[float]:
    """
    [Stage 5] Pearson Correlations via NumPy
    Optimized to compute correlations for all attributes in one batch.
    """
    scores_np = np.asanyarray(scores_transform, dtype=np.float64)
    ut_np = np.asanyarray(ut_array, dtype=np.float64)
    
    # Batch Correlation using NumPy
    # Stack utility as first row, then all attribute columns
    full_matrix = np.vstack([ut_np, scores_np.T])
    corr_matrix = np.corrcoef(full_matrix)
    
    # First row contains correlations of Utility with all Attributes (skip index 0 self-corr)
    # Fill NAs with 0
    results = np.nan_to_num(corr_matrix[0, 1:]).tolist()
    return results

def corr_per_brand(scores: Any, ut_of_brand: Any, seg_attr_count: int, seg_brand_count: int, seg_respondent_count: int) -> List[List[float]]:
    """
    Calculates Pearson correlation per brand and per attribute. [Required for Excel Sheet 7]
    Vectorized per brand.
    """
    scores_np = np.asanyarray(scores, dtype=np.float64).reshape(seg_respondent_count, seg_attr_count, seg_brand_count)
    utility_np = np.asanyarray(ut_of_brand, dtype=np.float64)
    
    out = np.zeros((seg_attr_count, seg_brand_count))
    for b in range(seg_brand_count):
        u_col = utility_np[:, b]
        # Attributes for this brand
        attr_batch = scores_np[:, :, b].T # [Attr, Resp]
        
        # Corrcoef for this brand's utility vs its attribute scores
        full_matrix = np.vstack([u_col, attr_batch])
        brand_corr = np.corrcoef(full_matrix)
        out[:, b] = np.nan_to_num(brand_corr[0, 1:])
        
    return out.tolist()

def wt_t_calc(corr: List[float], seg_attr_count: int, seg_respondent_count: int) -> List[float]:
    r = np.array(corr)
    n = seg_respondent_count
    denom = np.sqrt(np.maximum(0.0001, 1.0 - r**2))
    t_vals = r * np.sqrt((n - 2)) / denom
    mean_t = np.mean(t_vals)
    std_t = np.std(t_vals, ddof=1)
    if std_t < 0.001: return [100.0] * seg_attr_count
    weighted = 100.0 + (t_vals - mean_t) / (std_t / 5.0)
    return weighted.tolist()

# --- Expected Value Engine (Stages 6 - 10) ---

def get_expected_attribute_score(attribute_prob: List[float], brand_prob: List[float], seg_attr_count: int, seg_brand_count: int, total_checks: float) -> List[List[float]]:
    attr_arr = np.array(attribute_prob).reshape(-1, 1)
    brand_arr = np.array(brand_prob).reshape(1, -1)
    expected = (attr_arr @ brand_arr) * total_checks
    return expected.tolist()

def get_expected_attribute_share_from_check(check_frequencies: List[List[float]], expected_scores: List[List[float]], seg_attr_count: int, seg_brand_count: int) -> List[List[float]]:
    return (np.array(check_frequencies) - np.array(expected_scores)).tolist()

def get_expected_attribute_share_from_scalar(scalar_frequencies: List[List[float]], expected_scores: List[List[float]], seg_attr_count: int, seg_brand_count: int) -> List[List[float]]:
    return (np.array(scalar_frequencies) - np.array(expected_scores)).tolist()

def get_normalize_expected_attribute_share(gap_matrix: List[List[float]], seg_attr_count: int, seg_brand_count: int) -> List[List[float]]:
    arr = np.array(gap_matrix)
    shift = abs(np.min(arr))
    return (arr + shift).tolist()

# --- Final Aggregates ---

def calc_cbi(normalized_gap: List[List[float]], frequencies_pct: List[List[float]], wt_t: List[float], seg_attr_count: int, seg_brand_count: int) -> List[float]:
    gaps, freqs = np.array(normalized_gap), np.array(frequencies_pct)
    impact = gaps * freqs * np.array(wt_t).reshape(-1, 1)
    brand_sums = impact.sum(axis=0) / seg_attr_count
    avg_impact = np.mean(brand_sums)
    if avg_impact == 0: return [100.0] * seg_brand_count
    return (brand_sums * 100.0 / avg_impact).tolist()

# --- Strategic Positioning ---

def split_row_from_2d(arr: List[List[float]], index: int) -> List[float]:
    return list(arr[index])

def pop_pod_str_unass(attribute_indexes: List[int], brand_indexes: List[int], gap_matrix: List[List[float]], attributes: List[str], brand_names: List[str], seg_attr_count: int, seg_brand_count: int) -> pd.DataFrame:
    gaps = np.array(gap_matrix)
    stdev = np.std(gaps)
    cols = ["#", "Attribute"] + [brand_names[i] for i in brand_indexes]
    rows = []
    for i in range(seg_attr_count):
        row_gaps = gaps[i]
        labels = [""] * seg_brand_count
        for j in range(seg_brand_count):
            g = row_gaps[j]
            if g < -stdev: labels[j] = "Unassoc"
            elif g > stdev:
                peer_gaps = np.delete(row_gaps, j)
                if np.any(peer_gaps > stdev):
                    strongest_peer = np.max(peer_gaps)
                    labels[j] = "POP" if abs(g - strongest_peer) < (stdev / 2) else ("Strong" if g < strongest_peer else "POD")
                else: labels[j] = "POD"
        rows.append([i + 1, attributes[attribute_indexes[i]]] + labels)
    return pd.DataFrame(rows, columns=cols)

class StrategicIntelligence:
    """
    [PHASE 7] Strategic Interpretation Guide.
    Systematic mapping of data findings to actionable marketing strategies.
    """
    
    @staticmethod
    def get_cbi_status(score: float) -> Tuple[str, str]:
        """Maps CBI score to equity status and primary strategic action."""
        if score > 120:
            return "Dominant Equity", "Invest in maintaining leadership and defending major PODs."
        elif score >= 100:
            return "Above Average", "Strategic advantage present; optimize secondary attributes."
        elif score >= 80:
            return "Below Average", "Structural weakness detected; analyze gaps vs category leaders."
        else:
            return "Equity Deficit", "Critical repositioning required; brand value is below functional benchmarks."

    @staticmethod
    def classify_positioning_finding(finding: str, is_important: bool = False) -> str:
        """Provides context for POP/POD/Unassociated classifications."""
        if finding == "POD":
            return "Competitive Moat: Protect and amplify this attribute in all communication."
        elif finding == "POP":
            return "Table Stakes: Maintain presence to remain in the consideration set."
        elif finding == "Unassoc":
            if is_important:
                return "Critical Brand Gap: You are unassociated with a key preference driver."
            return "Perceptual Gap: Decision needed: invest to build or pivot to existing strengths."
        elif finding == "Strong":
            return "Emerging Strength: Opportunity to convert into a distinctive POD."
        return "Passive Association."

    @staticmethod
    def analyze_opportunity_quadrant(importance: float, frequency: float, brand: str) -> Optional[Dict[str, str]]:
        """
        Determines if an attribute-brand pair is an Opportunity, Waste, or Strength.
        (Quadrant Analysis logic)
        """
        # Thresholds for quadrant logic (Internal heuristics)
        HIGH_IMP = 110.0 # Weighted T baseline
        LOW_FREQ = 20.0  # Freq % baseline
        
        if importance > HIGH_IMP and frequency < LOW_FREQ:
            return {
                "type": "Priority Opportunity",
                "finding": "High-impact attribute where brand is underperforming.",
                "action": "Investment Priority: High ROI if association is strengthened."
            }
        elif importance < 90 and frequency > 40:
            return {
                "type": "Potential Inefficiency",
                "finding": "Well-known for a low-impact driver.",
                "action": "Maintenance Mode: Consider shifting budget to high-importance drivers."
            }
        return None

# --- Legacy Compatibility Shims ---

def all_in_one(step_three: List[List[float]], seg_attr_count: int, seg_brand_count: int) -> List[float]:
    return np.array(step_three).flatten().tolist()

def count_occurrences(arr: List[Any], num: Any) -> int:
    return int(np.sum(np.array(arr) == num))

def get_summation(arr: List[float]) -> float:
    return float(np.sum(arr))

def get_different_nums(data: List[int], without: int, without1: int) -> List[str]:
    exclude = {without, without1}
    seen = set()
    return [str(x) for x in data if x not in exclude and not (x in seen or seen.add(x))]

