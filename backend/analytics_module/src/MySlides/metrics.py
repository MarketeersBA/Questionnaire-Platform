import numpy as np
import logging
from typing import Dict, Any, List
from backend.analytics_module.src.MySlides.pivot_store import PivotStore

logger = logging.getLogger(__name__)

class DerivedMetricsEngine:
    """
    Phase 2: Computes all derived metrics (NPS, Top 2 Box, funnel ratios, importance correlation).
    Mutates PivotStore.computed_metrics in place. Does not return a new object.
    """

    def compute(self, store: PivotStore) -> None:
        try:
            self._compute_total_awareness(store)
            self._compute_funnel_ratios(store)
            self._compute_top_2_box(store)
            self._compute_nps(store)
            self._compute_bpi(store)
            self._compute_importance_scores(store)
            self._compute_comparative_matrix(store)
            self._compute_scatter_quadrants(store)
        except Exception as e:
            logger.exception("DerivedMetricsEngine computation failed")

    def _compute_comparative_matrix(self, store: PivotStore) -> None:
        """
        Phase 2: Computes a comprehensive brand comparison matrix.
        Calculates T2B and Mean for all attributes per brand.
        """
        metrics_df = store.get("metrics_long_table")
        if metrics_df is None or metrics_df.empty:
            return

        # Ensure correct column names from RecordFactory
        # metrics_df has [response_id, brand, attribute, raw_value]
        try:
            # 1. Calculate Mean per (Brand, Attribute)
            means = metrics_df.groupby(["brand", "attribute"])["raw_value"].mean().unstack(level=0)
            
            # 2. Calculate T2B (4,5 on 1-5 scale) per (Brand, Attribute)
            # We assume a 1-5 scale for standard evaluation
            t2b_mask = metrics_df["raw_value"].isin([4, 5])
            t2b_counts = metrics_df[t2b_mask].groupby(["brand", "attribute"]).size()
            totals = metrics_df.groupby(["brand", "attribute"]).size()
            t2b_pct = (t2b_counts / totals * 100).unstack(level=0).fillna(0)

            store.computed_metrics["comparative_matrix"] = {
                "means": means.to_dict(),
                "t2b": t2b_pct.to_dict(),
                "attributes": list(means.index),
                "brands": list(means.columns)
            }
        except Exception as e:
            logger.warning(f"Comparative matrix calculation failed: {e}")

    def _compute_total_awareness(self, store: PivotStore) -> None:
        """2a. Total Awareness per brand."""
        awareness_dict = {}
        for q_id, req in store.raw_answers.items():
            if not isinstance(req, dict):
                continue
                
            # Use safe get with defaults to prevent attribute errors
            q_type = req.get("question_type")
            data_list = req.get("data", [])
            
            if not isinstance(data_list, list):
                continue

            # Find the brand awareness block based on type or data schema
            is_funnel = (q_type == "funnel")
            has_tom = len(data_list) > 0 and isinstance(data_list[0], dict) and "tom_pct" in data_list[0]
            
            if is_funnel or has_tom:
                for brand_obj in data_list:
                    if not isinstance(brand_obj, dict):
                        continue
                    b_id = brand_obj.get("brand_id")
                    if b_id:
                        tom = float(brand_obj.get("tom_pct") or 0.0)
                        unaided = float(brand_obj.get("unaided_pct") or 0.0)
                        aided = float(brand_obj.get("aided_pct") or 0.0)
                        awareness_dict[b_id] = tom + unaided + aided
        
        # Merge directly if provided globally
        for brand in store.brands:
            if not isinstance(brand, dict):
                continue
            b_id = brand.get("brand_id")
            if b_id in awareness_dict:
                store.computed_metrics["total_awareness"][b_id] = awareness_dict[b_id]


    def _safe_divide(self, num: float, den: float) -> Any:
        return num / den if den and den > 0 else None

    def _compute_funnel_ratios(self, store: PivotStore) -> None:
        """2b. Purchase Funnel Ratios per brand."""
        ratios = store.computed_metrics["funnel_ratios"]
        avgs = { "attractiveness_ratio": [], "conversion_ratio": [], "loyalty_ratio": [], "repurchase_ratio": [] }

        # Extract funnel data from raw mapping if present
        for q_id, req in store.raw_answers.items():
            if req.get("question_type") == "funnel_stages" or any("past_year" in k for k in req):
                for b_data in req.get("data", []):
                    b_id = b_data.get("brand_id")
                    if not b_id:
                        continue
                        
                    ta = store.computed_metrics["total_awareness"].get(b_id, b_data.get("total_awareness"))
                    py = b_data.get("past_year_pct")
                    p3m = b_data.get("past_3months_pct")
                    mou = b_data.get("mou_pct")
                    
                    if ta is None or py is None or p3m is None or mou is None:
                        continue

                    attr_ratio = self._safe_divide(py, ta)
                    conv_ratio = self._safe_divide(p3m, py)
                    loyl_ratio = self._safe_divide(mou, py)
                    repu_ratio = self._safe_divide(mou, p3m)

                    ratios[b_id] = {
                        "attractiveness_ratio": attr_ratio,
                        "conversion_ratio": conv_ratio,
                        "loyalty_ratio": loyl_ratio,
                        "repurchase_ratio": repu_ratio
                    }

                    for k, v in ratios[b_id].items():
                        if v is not None:
                            avgs[k].append(v)
                            
        for k, v_list in avgs.items():
            if v_list:
                store.computed_metrics["funnel_ratio_averages"][k] = sum(v_list) / len(v_list)
            else:
                store.computed_metrics["funnel_ratio_averages"][k] = None

    def _compute_top_2_box(self, store: PivotStore) -> None:
        """2c. Top 2 Box for every scale question."""
        for q_id, req in store.raw_answers.items():
            if req.get("question_type") == "Scale":
                data_list = req.get("data", [])
                if len(data_list) >= 5:
                    # Index 3 and 4 are top 2 box (0-indexed)
                    try:
                        computed_t2b = float(data_list[3].get("value", 0)) + float(data_list[4].get("value", 0))
                        store.computed_metrics["top_2_box"][q_id] = computed_t2b
                        
                        supplied_t2b = req.get("top_2_box_pct")
                        if supplied_t2b is not None:
                            if abs(supplied_t2b - computed_t2b) > 0.02:
                                store.validation_log.append({
                                    "slide_number": None,
                                    "event_type": "T2B_MISMATCH",
                                    "message": f"T2B for {q_id} overwritten from {supplied_t2b} to {computed_t2b}",
                                    "severity": "WARNING"
                                })
                    except (IndexError, TypeError, ValueError):
                        pass

    def _compute_nps(self, store: PivotStore) -> None:
        """2d. NPS per brand/product."""
        for q_id, req in store.raw_answers.items():
            if req.get("is_nps"):
                for b_data in req.get("data", []):
                    b_id = b_data.get("brand_id") or req.get("brand_id")
                    if b_id:
                        promoters = b_data.get("promoters_pct", 0)
                        rejectors = b_data.get("rejectors_pct", 0)
                        nps_val = round((promoters - rejectors) * 100)
                        
                        if -100 <= nps_val <= 100:
                            store.computed_metrics["nps_scores"][b_id] = nps_val
                        else:
                            store.computed_metrics["nps_scores"][b_id] = None
                            store.validation_log.append({
                                "slide_number": None,
                                "event_type": "NPS_OUT_OF_BOUNDS",
                                "message": f"NPS {nps_val} for {b_id} is out of bounds",
                                "severity": "ERROR"
                            })

    def _compute_bpi(self, store: PivotStore) -> None:
        """2e. Brand Power Index (BPI) per brand."""
        for q_id, req in store.raw_answers.items():
            if req.get("is_bpi_source"):
                weights = req.get("importance_weights", {})
                for b_id, attribute_scores in req.get("brand_scores", {}).items():
                    total_weight = 0
                    total_score = 0
                    for attr, score in attribute_scores.items():
                        w = weights.get(attr, 1.0)
                        total_score += float(score) * w
                        total_weight += w
                    
                    if total_weight > 0:
                        store.computed_metrics["bpi_scores"][b_id] = total_score / total_weight

    def _compute_importance_scores(self, store: PivotStore) -> None:
        """2f. Importance Scores via Pearson Correlation."""
        has_respondent_data = "respondent_level_data" in store.raw_answers
        
        if not has_respondent_data:
            store.computed_metrics["importance_scores_available"] = False
            store.validation_log.append({
                "slide_number": 36,
                "event_type": "MISSING_CORRELATION_DATA",
                "message": "Importance scores defaulted to equal weights — respondent-level data not provided.",
                "severity": "WARNING"
            })
            return
            
        data = store.raw_answers["respondent_level_data"]
        overall = data.get("overall_satisfaction", [])
        if not overall or len(overall) < 10:
            return

        for criteria, scores in data.get("attributes", {}).items():
            try:
                corr = np.corrcoef(scores, overall)[0, 1]
                if not np.isnan(corr):
                    store.computed_metrics["importance_scores"][criteria] = abs(corr)
            except Exception:
                pass

    def _compute_scatter_quadrants(self, store: PivotStore) -> None:
        """2g. Scatter Quadrant Assignment."""
        importance_dict = store.computed_metrics.get("importance_scores", {})
        performance_dict = store.computed_metrics.get("brand_performance", {})
        
        if not importance_dict or not performance_dict:
            return

        importance_vals = list(importance_dict.values())
        perf_vals = list(performance_dict.values())
        
        med_imp = np.median(importance_vals) if importance_vals else 0.5
        med_perf = np.median(perf_vals) if perf_vals else 5.0
        
        q_dict = store.computed_metrics["scatter_quadrants"]
        
        for criteria, imp_score in importance_dict.items():
            perf_score = performance_dict.get(criteria, 0)
            
            if imp_score >= med_imp and perf_score >= med_perf:
                q_dict[criteria] = "maintain"
                store.computed_metrics["areas_to_maintain"].append(criteria)
            elif imp_score >= med_imp and perf_score < med_perf:
                q_dict[criteria] = "improve"
                store.computed_metrics["areas_to_improve"].append(criteria)
            elif imp_score < med_imp and perf_score >= med_perf:
                q_dict[criteria] = "overkill"
            else:
                q_dict[criteria] = "low_priority"

    @staticmethod
    def detect_stat_anomalies(data: Any) -> List[str]:
        """
        Phase 5: Statistical Anomaly Detection.
        Identifies segments or attributes with Z-scores > 2.0 (95% confidence).
        """
        import pandas as pd
        if not isinstance(data, pd.DataFrame) or data.empty:
            return []

        anomalies = []
        try:
            # Only numeric columns
            numeric_df = data.select_dtypes(include=[np.number])
            if numeric_df.empty:
                return []

            # Flatten and calculate global mean/std for the slide context
            vals = numeric_df.values.flatten()
            vals = vals[~np.isnan(vals)]
            if len(vals) < 3:
                return []
                
            mean = np.mean(vals)
            std = np.std(vals)

            if std == 0:
                return []

            for col in numeric_df.columns:
                for idx, val in numeric_df[col].items():
                    if np.isnan(val): continue
                    z = (val - mean) / std
                    if abs(z) > 2.0:
                        label = f"{col} ({idx})" if len(numeric_df.columns) > 1 else f"{idx}"
                        anomalies.append(f"{label} [Z:{z:.1f}]")
        except Exception as e:
            logger.warning(f"Stat anomaly detection failed: {e}")
            
        return list(set(anomalies))[:5] # Top 5 unique anomalies

# Alias for backward compatibility with narrator.py
MetricsEngine = DerivedMetricsEngine
