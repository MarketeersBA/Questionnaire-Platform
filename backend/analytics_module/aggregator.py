"""
ReportAggregator — Phase B of the Pipeline Restructuring.

Pure computation engine. Takes a SurveyData container and produces
chart-ready JSON dicts. No PPTX, no templates, no side effects.

Each method returns a self-describing dict:
    { "chart_id": str, "chart_type": str, "title": str, "data": Any }

The frontend ChartRenderer reads these directly.
"""
from __future__ import annotations

import logging
import math
import re
from functools import cached_property
from collections import Counter
from typing import Any, Dict, List, Optional, Set, TypedDict

import numpy as np
import pandas as pd

from backend.analytics_module.ingestor import SurveyData
from backend.analytics_module.nps_metric_detection import recommend_nps_row_mask
from backend.analytics_module.purchase_intent_detection import (
    build_pi_diagnostics,
    compute_pi_t2b_by_brand,
    filter_purchase_intent_rows,
    purchase_intent_row_mask,
)
from backend.analytics_module.src.BrandAnalyzer import calculations2 as ba_calc
from backend.models import AttributeSignal
from backend.utils.module_answer_aliases import (
    DEFAULT_STAGE_ROLES,
    question_ids_for_role_lookup,
)

logger = logging.getLogger(__name__)


class NpsBrandMetrics(TypedDict):
    """Per-brand NPS computation result shared by gauge charts and brand cards."""

    nps: int
    promoters_pct: float
    passives_pct: float
    detractors_pct: float
    base_n: int


class ReportAggregator:
    """
    Stateless computation engine.
    Each method is pure: (SurveyData, config) → chart dict.
    """

    def __init__(self, data: SurveyData, my_brand: str, competitor_brands: Optional[List[str]] = None, group_by: Optional[str] = None, blueprint: Optional[Dict[str, Any]] = None, attribute_registry: Optional[List[Dict[str, Any]]] = None, research_type: str = "standard"):
        self.data = data
        self.my_brand = my_brand
        self.research_type = research_type
        self.brands = data.brands
        self.n = data.response_count
        self.group_by = group_by
        self.blueprint = blueprint or {}
        self.attribute_registry = attribute_registry or []

        # Identify top competitor (highest overall mean score)
        if competitor_brands:
            self.competitor_brands = competitor_brands
        else:
            self.competitor_brands = [b for b in self.brands if b != my_brand]

        self.top_competitor = self._detect_top_competitor()
        
        # Pre-compute brand counts (N) for all charts to use
        self.brand_counts = self.data.evaluations.groupby("brand")["response_id"].nunique().to_dict()

    def _stage_roles(self) -> Dict[str, str]:
        return self.data.stage_roles or dict(DEFAULT_STAGE_ROLES)

    def _awareness_keys(self) -> Dict[str, str]:
        return self.data.awareness_keys or {
            "tom": "pf_q1",
            "other_unaided": "pf_q2",
            "aided": "pf_q3",
        }

    def _question_ids_for_stage(self, role: str) -> List[str]:
        return question_ids_for_role_lookup(
            {"stage_roles": self._stage_roles(), "awareness_keys": self._awareness_keys()},
            role,
            bucket="stage",
        )

    def _question_ids_for_awareness(self, role: str) -> List[str]:
        return question_ids_for_role_lookup(
            {"stage_roles": self._stage_roles(), "awareness_keys": self._awareness_keys()},
            role,
            bucket="awareness",
        )

    # ──────────────────────────────────────────────────────────────────────
    #  Master dispatcher
    # ──────────────────────────────────────────────────────────────────────

    def compute_all(self) -> List[Dict[str, Any]]:
        """Run all chart computations and return a flat list of chart dicts."""
        charts: List[Dict[str, Any]] = []

        is_taste_test = str(self.research_type).lower() == "taste_test"

        # Order matters — this is the presentation sequence
        safe_runners = [
            ("criteria_table", self.criteria_table),
            ("brand_profile_analytics", self.brand_profile_analytics),
            ("likeness_profile_chart", self.likeness_profile_chart), # NEW: 3rd Chart in Criteria Analysis
            ("key_preference_drivers", self.key_preference_drivers),
            ("driver_ranking", self.driver_ranking_chart),
            ("importance_combined", self.importance_combined),
            ("product_preference", self.product_preference),
            ("overall_averages", self.overall_averages),
            ("demographic_sub_averages", self.demographic_sub_averages),
            ("purchase_funnel", self.purchase_funnel_chart),
            ("overall_switch", self.overall_switch),
            ("switch_per_brand", self.switch_per_brand),
            ("attribute_radar", self.attribute_radar),
            ("sigma_intent", self.enhanced_sigma_intent_analysis),
            ("market_position_sigma", self.market_position_sigma), # Task 1.1: Strategic Positioning Sigma
            ("audience_affinity", self.audience_affinity_index),   # Task 1.2: Audience Affinity Index
            ("positioning_matrix", self.competitive_position_matrix), # Task 1.3: Competitive Matrix
            ("purchase_intent", self.purchase_intent),
            ("brand_awareness", self.brand_awareness_stacked),
            ("brand_analyzer_cbi", self.brand_analyzer_cbi),
            ("brand_analyzer_perception", self.brand_analyzer_perception),
            ("brand_analyzer_views", self.brand_analyzer_split_views), # Specific views for PPTX/Detailed Analysis
            ("purchase_funnel_ratio_cards", self.purchase_funnel_ratio_cards),
            ("purchase_funnel_reference_table", self.purchase_funnel_reference_table),
            ("nps_recommend", self.nps_recommend),
            ("price_sensitivity", self.price_sensitivity),
        ]

        if is_taste_test:
            # Narrative constraint: Hide Overall and Radar charts from Taste Test reports
            to_hide = {"overall_averages", "attribute_radar"}
            safe_runners = [r for r in safe_runners if r[0] not in to_hide]
            logger.info("Research mode 'taste_test' detected. Pruning %s charts from pipeline.", to_hide)


        for chart_id, runner in safe_runners:
            try:
                result = runner()
                if isinstance(result, list):
                    charts.extend(
                        item for item in result
                        if isinstance(item, dict) and item.get("data")
                    )
                elif isinstance(result, dict) and result.get("data"):
                    charts.append(result)
                
                # Special Handle: Brand Comparison (PI vs OL) 
                # We inject it after purchase_intent logic if both are available
                if chart_id == "purchase_intent":
                    comp = self.brand_comparison_pi_ol()
                    if comp and comp.get("data"):
                        charts.append(comp)
                        
            except Exception as e:
                logger.warning("Chart computation '%s' failed: %s", chart_id, e, exc_info=True)

        # Multi-output charts
        try:
            charts.extend(self.brand_cards())
        except Exception as e:
            logger.warning("brand_cards failed: %s", e)

        try:
            charts.extend(self.open_end_clouds())
        except Exception as e:
            logger.warning("open_end_clouds failed: %s", e)

        logger.info("ReportAggregator: Produced %d charts for %d brands", len(charts), len(self.brands))
        return charts

    def get_available_filters(self) -> Dict[str, List[str]]:
        """
        Dynamically extracts available demographic filter values from the dataset.
        Enables the frontend to build high-fidelity filtering UI.
        """
        filters = {}
        if self.data.demographics is None or self.data.demographics.empty:
            return filters
            
        # Extract unique values for each demographic field
        for field_name in self.data.demographics["field"].unique():
            values = self.data.demographics[self.data.demographics["field"] == field_name]["value"].dropna().unique().tolist()
            if values:
                # Ensure all values are strings for JSON compatibility
                filters[str(field_name)] = sorted([str(v) for v in values])
        
        return filters

    # ──────────────────────────────────────────────────────────────────────
    #  1. Criteria Table — Overall
    # ──────────────────────────────────────────────────────────────────────

    def criteria_table(self) -> Dict[str, Any]:
        """
        Table: Dynamic Multi-Brand Comparison.
        Returns T2B% for all brands and significance drivers.
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        # 1. T2B = Top 2 Box (values 4 and 5 on a 1-5 scale)
        max_val = df["value"].max()
        t2b_threshold = max_val - 1 

        df = df.copy()
        df["is_t2b"] = df["value"] >= t2b_threshold

        t2b_pct = df.groupby(["brand", "attribute"])["is_t2b"].mean() * 100
        
        # 2. Significance: correlation of each attribute with "General" overall rating
        significance = self._compute_significance(df)

        attributes = [a for a in df["attribute"].unique() if a != "General"]
        available_brands = sorted(self.brands)

        rows = []
        for attr in sorted(attributes):
            # Compute T2B for every brand
            brand_scores = {b: round(float(t2b_pct.get((b, attr), 0)), 1) for b in available_brands}
            sig = significance.get(attr, 0)

            # Legacy Diffs (defaulting to primary brand vs top competitor)
            our = brand_scores.get(self.my_brand, 0)
            comp = brand_scores.get(self.top_competitor, 0) if self.top_competitor else 0

            rows.append({
                "criteria_name": attr,
                "significance": round(float(sig), 3),
                "brand_scores": brand_scores,
                "our_brand_t2b": our,   # Legacy support for older frontend/pptx
                "competitor_t2b": comp, # Legacy support
                "diff": round(float(our - comp), 1),
            })

        # 2.5 Compute N per brand for statistical significance testing
        brand_ns = {b: int(self.brand_counts.get(b, 0)) for b in available_brands}

        # 3. Sort by significance descending (Drivers of likeness)
        rows.sort(key=lambda x: x["significance"], reverse=True)

        return {
            "chart_id": "criteria_table",
            "chart_type": "criteria_table",
            "title": "Criteria — Overall",
            "subtitle": "Drivers of Likeness vs Competitive Performance",
            "data": {
                 "columns": ["Criteria", "Importance"] + [f"{b} T2B%" for b in available_brands] + ["Diff", "Sig."],
                "brands": available_brands,
                "brand_ns": brand_ns,
                "my_brand": self.my_brand,
                "top_competitor": self.top_competitor,
                "rows": [[r["criteria_name"], r["significance"]] + [r["brand_scores"].get(b, 0) for b in available_brands] + [r["diff"]] for r in rows],
                "raw": rows,
            },
            "brands": available_brands,
            "base_n": self.n,
        }

    # ──────────────────────────────────────────────────────────────────────
    #  2. Brand Profile Analytics (Snake Chart)
    # ──────────────────────────────────────────────────────────────────────

    def brand_profile_analytics(self) -> Dict[str, Any]:
        """
        Calculates means for ALL brands across all attributes + Overall benchmark.
        Filters for "Main" metrics (the 1-10 scale questions) to ensure sub-metrics
        (e.g. 1-5 scales) do not pollute the Snake Chart averages.
        """
        df = self.data.scale_evaluations
        if df.empty:
            logger.warning("Profile Chart: Dataframe is empty.")
            return {}

        # 1. Filter for 'Main Questions' only (1-10 Scale questions)
        # We target records where the 'metric' is the primary descriptor of the 'attribute'
        # Or where the value scale indicates the primary 10-point question.
        main_df = df[df["metric"].str.lower() == df["attribute"].str.lower()]

        # Fallback A: some submission shapes leave `metric` blank for the
        # primary/overall question instead of mirroring the attribute name —
        # treat a blank metric as "this is the main question" too.
        if main_df.empty:
            main_df = df[df["metric"].astype(str).str.strip() == ""]

        # Fallback B: still nothing matched. Averaging every sub-metric
        # together here would silently mix different scales/questions into
        # one meaningless number (e.g. a 1-5 sub-attribute blended with a
        # 1-10 overall score) — exactly what this filter exists to prevent.
        # Instead, deterministically pick ONE representative metric per
        # attribute (the first one recorded) so the chart still renders
        # with a single coherent scale per attribute rather than staying
        # empty or silently corrupting the averages.
        if main_df.empty:
            first_metric_per_attr = df.groupby("attribute")["metric"].transform("first")
            main_df = df[df["metric"] == first_metric_per_attr]
            logger.info(
                "Profile Chart: no exact metric==attribute or blank-metric match; "
                "falling back to first metric per attribute."
            )

        df = main_df.copy()


        # 1. Attributes order (General last)
        raw_attrs = df["attribute"].unique().tolist()
        attrs = sorted([a for a in raw_attrs if "general" not in str(a).lower()])
        gen_attrs = sorted([a for a in raw_attrs if "general" in str(a).lower()])
        attrs.extend(gen_attrs)

        # 2. Compute means matrix
        matrix = df.groupby(["brand", "attribute"])["value"].mean().unstack(level=0)
        overall_means = df.groupby("attribute")["value"].mean()

        # 3. Build datasets with Vectorized Lookups
        available_brands = sorted(matrix.columns.tolist())
        datasets = []
        
        # Helper to get value with NaN handling
        def get_val(s, key):
            v = s.get(key, 0)
            return round(float(v), 2) if not pd.isna(v) else 0

        # Overall Benchmark
        datasets.append({
            "label": f"OVERALL (N={self.n})",
            "brand": "Overall",
            "data": [get_val(overall_means, a) for a in attrs],
            "is_benchmark": True
        })

        for brand in available_brands:
            n = self.brand_counts.get(brand, 0)
            brand_data = [get_val(matrix[brand], a) for a in attrs]
            datasets.append({
                "label": f"{str(brand).upper()} (N={n})",
                "brand": brand,
                "data": brand_data,
            })

        logger.info("Profile Chart Debug: Produced %d datasets (including Overall) for brands %s", len(datasets), available_brands)

        return {
            "chart_id": "brand_profile_snake",
            "chart_type": "profile_chart",
            "title": "Brand Performance Profile",
            "subtitle": "Attribute comparison via primary likeness questions (Snake Chart)",
            "data": {
                "labels": attrs,
                "datasets": datasets,
            },
            "brands": ["Overall"] + available_brands,
            "base_n": self.n,
        }

    def likeness_profile_chart(self) -> Dict[str, Any]:
        """
        Likeness Profile Chart (Semantic Differential):
        Calculates means for SUB-ATTRIBUTES (descriptor questions scaled 1-5).
        Retrieves left/right boundaries from survey blueprint (CustomSubAttributes).
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        # 1. Prepare Metric-to-Attribute Mapping (Registry-Driven)
        # We iterate through the registry to define the strict sequence and mapping
        target_metrics = []
        metric_metadata = {}
        
        # Build a lookup of all available metrics in the dataset
        available_metrics = df["metric"].unique().tolist()
        qm = self.data.question_map
        
        # Map each registry entry to EXACTLY ONE metric in the data
        for entry in self.attribute_registry:
            main_label = entry.get("main_att", "").strip()
            supp_label = entry.get("supp_att", "").strip()
            en_text = entry.get("en_text", "").strip()
            source = entry.get("source", "library")
            
            matched_metric = None
            norm_registry_text = self._norm_text(en_text) if source == "library" else ""
            
            # --- Rule A: Library Match (Identity Mapping with Placeholder Resolution) ---
            if source == "library" and norm_registry_text:
                for m in available_metrics:
                    m_df = df[df["metric"] == m]
                    q_id = m_df["question_id"].iloc[0]
                    q_text = str(qm.get(q_id, {}).get("text", m)).strip()
                    
                    if self._norm_text(q_text) == norm_registry_text:
                        matched_metric = m
                        break
            
            # --- Rule B: Custom Match (Exact Label Identity) ---
            elif source == "custom" and supp_label:
                supp_lower = supp_label.lower().strip()
                for m in available_metrics:
                    if str(m).lower().strip() == supp_lower:
                        matched_metric = m
                        break
            
            # --- Rule C: Fuzzy Fallback (Restricted to 5-point scale and sub-string search) ---
            if not matched_metric:
                for m in available_metrics:
                    m_df = df[df["metric"] == m]
                    q_id = m_df["question_id"].iloc[0]
                    q_text = str(qm.get(q_id, {}).get("text", m)).strip().lower()
                    m_text = str(m).lower().strip()
                    s_lower = supp_label.lower().strip()
                    
                    if (s_lower in q_text) or (s_lower in m_text):
                        mean_val = m_df["value"].mean()
                        if mean_val <= 6.0: 
                            matched_metric = m
                            break

            if matched_metric:
                if matched_metric not in target_metrics:
                    logger.info("[LikenessFilter] Valid Identification: (%s %s) -> %s", main_label, supp_label, matched_metric)
                    target_metrics.append(matched_metric)
                    metric_metadata[matched_metric] = {
                        "short_name": f"({main_label} {supp_label})",
                        "left": entry.get("min_label", "Poor"),
                        "right": entry.get("max_label", "Excellent"),
                    }

        # --- Aggregator now strictly filters based on the discovered map ---
        if not target_metrics:
            logger.warning("[LikenessFilter] No metrics from registry were found in response data.")
            return {}

        sub_df = df[df["metric"].isin(target_metrics)].copy()
        
        # Enforce strict domain limit to avoid means exceeding max visual range
        sub_df = sub_df[(sub_df["value"] >= 1) & (sub_df["value"] <= 5)]
        
        metrics = target_metrics

        # 3. Aggregations (Matrix of means per brand/metric)
        matrix = sub_df.groupby(["brand", "metric"])["value"].mean().unstack(level=0)
        overall_means = sub_df.groupby("metric")["value"].mean()
        
        def get_val(s, key):
            v = s.get(key, 0)
            return round(float(v), 2) if not pd.isna(v) else 0

        # 4. Map Metrics to Boundaries and Labels (Ordered as per Registry)
        left_labels = []
        right_labels = []
        final_metrics = [] # Display names
        
        # We MUST use target_metrics to preserve registry order
        ordered_metrics = [m for m in target_metrics if m in matrix.index]

        for m in ordered_metrics:
            meta = metric_metadata.get(m, {})
            left_labels.append(meta.get("left", "Poor"))
            right_labels.append(meta.get("right", "Excellent"))
            final_metrics.append(meta.get("short_name", str(m)))

        # 5. Build datasets
        available_brands = sorted(matrix.columns.tolist())
        datasets = []
        
        datasets.append({
            "label": f"OVERALL (N={self.n})",
            "brand": "Overall",
            "data": [get_val(overall_means, m) for m in ordered_metrics],
            "is_benchmark": True
        })

        for brand in available_brands:
            n = self.brand_counts.get(brand, 0)
            datasets.append({
                "label": f"{str(brand).upper()} (N={n})",
                "brand": brand,
                "data": [get_val(matrix[brand], m) for m in ordered_metrics],
            })

        return {
            "chart_id": "likeness_profile_chart",
            "chart_type": "likeness_profile",
            "title": "Likeness Profile Chart",
            "subtitle": "Attribute comparison via primary likeness questions (Snake Chart)",
            "data": {
                "metrics": final_metrics,
                "labels_left": left_labels,
                "labels_right": right_labels,
                "datasets": datasets,
            },
            "brands": ["Overall"] + available_brands,
            "base_n": self.n,
            "section": "Criteria Analysis"
        }



    def product_preference(self) -> Dict[str, Any]:
        """Horizontal bar: T2B percentage per brand from preference votes."""
        prefs = self.data.preferences
        if prefs.empty:
            return {}

        counts = prefs["preference"].value_counts()
        total = counts.sum()
        
        bars = []
        for brand in self.brands:
            pct = (counts.get(brand, 0) / total * 100) if total > 0 else 0
            bars.append({"label": brand, "value": round(pct, 1)})

        # Sort: my_brand first
        bars.sort(key=lambda x: x["label"] != self.my_brand)

        return {
            "chart_id": "product_preference",
            "chart_type": "horizontal_bar",
            "title": "Product Preference",
            "subtitle": "Overall preference distribution",
            "data": {
                "labels": [b["label"] for b in bars],
                "datasets": [{"label": "Preference %", "data": [b["value"] for b in bars]}],
            },
            "footnote": f"Base: N={self.n}",
            "brands": self.brands,
            "base_n": self.n,
        }

    # ──────────────────────────────────────────────────────────────────────
    #  3. Overall Averages — grouped bar chart
    # ──────────────────────────────────────────────────────────────────────

    def overall_averages(self) -> Dict[str, Any]:
        """
        Grouped bars: mean score per attribute, grouped by brand.
        N=10: We prioritize the top 10 attributes by Significance (Correlation to Overall Rating).
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        # 1. Selection & Sorting: Identify Top 10 Drivers (X-axis labels)
        sig_map = self._compute_significance(df)
        overall_markers = {"general", "overall", "likeness", "total", "global", "essence"}
        
        # Filter markers and sort by correlation (significance)
        # We take the TOP 10 descending, then reverse so "Most Important" is on the right.
        sorted_attrs = sorted(
            [a for a in sig_map.keys() if not any(m in str(a).lower() for m in overall_markers)],
            key=lambda a: sig_map.get(a, 0),
            reverse=True
        )[:10]
        sorted_attrs.reverse() 

        if not sorted_attrs:
            # Fallback to alpha-sorted attributes if no significance found
            sorted_attrs = sorted([a for a in df["attribute"].unique() if not any(m in str(a).lower() for m in overall_markers)])[:10]
            sorted_attrs.reverse() # Most important (alphabetically or otherwise) to the right

        # 2. Vectorized Mean Calculation
        # We group by attribute and brand to get the matrix
        means = df.groupby(["attribute", "brand"])["value"].mean()
        
        # 3. Build Datasets (Grouped by Brand)
        display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]
        
        datasets = []
        for brand in display_brands:
            # Ensure brand exists in data
            if brand not in df["brand"].unique():
                continue
                
            brand_values = [round(float(means.get((attr, brand), 0)), 2) for attr in sorted_attrs]
            datasets.append({
                "label": brand,
                "data": brand_values
            })

        return {
            "chart_id": "overall_averages",
            "chart_type": "grouped_bar",
            "title": "Overall Averages",
            "subtitle": f"Top {len(sorted_attrs)} Performance Drivers — Mean Score Comparison",
            "data": {
                "labels": sorted_attrs,
                "datasets": datasets
            },
            "brands": display_brands,
            "base_n": self.n,
            "section": "Criteria Analysis"
        }

    # ──────────────────────────────────────────────────────────────────────
    #  4. Purchase Funnel
    # ──────────────────────────────────────────────────────────────────────

    def purchase_funnel_chart(self) -> Dict[str, Any]:
        """
        Interactive multi-series snake line chart logic
        Total Awareness -> Consideration -> Bought 12M -> Bought 3M -> MOU
        """
        base = self._build_purchase_funnel_stage_base()
        if not base:
            return {}

        stage_sequence = [
            ("total_awareness", "Total Awareness"),
            ("consideration", "Consideration"),
            ("bought_12m", "Bought 12M"),
            ("bought_3m", "Bought 3M"),
            ("mou", "MOU"),
        ]

        rows = base.get("rows") or []
        datasets = []
        for row in rows:
            brand = str(row.get("brand", "")).strip()
            if not brand:
                continue
            stages = row.get("stages") or {}
            datasets.append({
                "label": brand,
                "brand": brand,
                "data": [float(stages.get(stage_key, 0) or 0) for stage_key, _ in stage_sequence],
            })

        if not datasets:
            return {}

        return {
            "chart_id": "purchase_funnel",
            "chart_type": "snake_line",
            "title": "Purchase Funnel",
            "subtitle": "Total Awareness to MOU progression by brand",
            "data": {
                "labels": [label for _, label in stage_sequence],
                "datasets": datasets,
            },
            "brands": [d["brand"] for d in datasets],
            "base_n": int(base.get("base_n", self.n) or 0),
            "metadata": {
                **(base.get("metadata") or {}),
                "source_base": "_build_purchase_funnel_stage_base",
                "stage_sequence": [stage_key for stage_key, _ in stage_sequence],
                "value_scale": "ratio_0_to_1",
                "line_interpolation": "linear_no_smoothing",
            },
        }

    def brand_awareness_stacked(self) -> Dict[str, Any]:
        """
        Build per-brand awareness using an exclusive waterfall:
          TOM -> Other_Unaided -> Aided -> Not_Aware

        Input contract comes from SurveyData phase-1 lock:
          - brand_master_list
          - brand_alias_map (variant -> canonical)
          - awareness_keys (tom/other_unaided/aided)
          - purchase_funnel rows [response_id, question, value]
        """
        pf_df = self.data.purchase_funnel
        if pf_df.empty:
            return {}

        master_brands = self._resolve_master_brands_for_awareness()
        if not master_brands:
            return {}

        tom_ids = self._question_ids_for_awareness("tom")
        other_ids = self._question_ids_for_awareness("other_unaided")
        aided_ids = self._question_ids_for_awareness("aided")
        awareness_qids = list(dict.fromkeys(tom_ids + other_ids + aided_ids))

        pf_subset = pf_df[pf_df["question"].isin(awareness_qids)].copy()
        if pf_subset.empty:
            return {}

        respondent_ids = sorted(pf_subset["response_id"].dropna().unique().tolist())
        total_respondents = len(respondent_ids) or int(self.data.response_count or 0)
        if total_respondents <= 0:
            return {}

        # Display canonical label map: lower-token -> original canonical label.
        canonical_display = {self._norm_brand_token(b): b for b in master_brands if isinstance(b, str) and b.strip()}
        alias_map = self.data.brand_alias_map or {}

        counts = {
            brand: {"TOM": 0, "Other_Unaided": 0, "Aided": 0, "Not_Aware": 0}
            for brand in master_brands
        }

        # Iterate respondent-by-respondent for strict exclusivity.
        for resp_id in respondent_ids:
            resp_df = pf_subset[pf_subset["response_id"] == resp_id]
            if resp_df.empty:
                continue

            tom_mentions: Set[str] = set()
            other_mentions_raw: Set[str] = set()
            aided_mentions_raw: Set[str] = set()

            for _, row in resp_df.iterrows():
                q = row.get("question")
                raw_vals = self._coerce_answer_values(row.get("value"))
                canonical_vals = self._canonicalize_mentions(raw_vals, alias_map, canonical_display)

                if q in tom_ids:
                    tom_mentions.update(canonical_vals)
                elif q in other_ids:
                    other_mentions_raw.update(canonical_vals)
                elif q in aided_ids:
                    aided_mentions_raw.update(canonical_vals)

            # Exclusive waterfall application.
            other_mentions = other_mentions_raw - tom_mentions
            aided_mentions = aided_mentions_raw - tom_mentions - other_mentions

            for brand in master_brands:
                if brand in tom_mentions:
                    counts[brand]["TOM"] += 1
                elif brand in other_mentions:
                    counts[brand]["Other_Unaided"] += 1
                elif brand in aided_mentions:
                    counts[brand]["Aided"] += 1
                else:
                    counts[brand]["Not_Aware"] += 1

        aggregated_rows = []
        for brand in master_brands:
            tom_pct = counts[brand]["TOM"] / total_respondents
            other_pct = counts[brand]["Other_Unaided"] / total_respondents
            aided_pct = counts[brand]["Aided"] / total_respondents
            not_aware_pct = counts[brand]["Not_Aware"] / total_respondents
            total_awareness_pct = tom_pct + other_pct + aided_pct

            aggregated_rows.append({
                "brand": brand,
                "tom_pct": round(float(tom_pct), 6),
                "other_unaided_pct": round(float(other_pct), 6),
                "aided_pct": round(float(aided_pct), 6),
                "not_aware_pct": round(float(not_aware_pct), 6),
                "total_awareness_pct": round(float(total_awareness_pct), 6),
            })

        # Stable deterministic ordering (single sort pass):
        # total awareness desc, then brand asc.
        aggregated_rows.sort(
            key=lambda r: (-r["total_awareness_pct"], str(r["brand"]).casefold())
        )

        # Phase 3: dual outputs from the SAME sorted aggregated frame.
        awareness_objects = [
            {
                "brand": row["brand"],
                "tom_pct": row["tom_pct"],
                "other_unaided_pct": row["other_unaided_pct"],
                "aided_pct": row["aided_pct"],
                "total_awareness_pct": row["total_awareness_pct"],
            }
            for row in aggregated_rows
        ]

        labels = [r["brand"] for r in aggregated_rows]
        tom_series = [r["tom_pct"] for r in aggregated_rows]
        other_series = [r["other_unaided_pct"] for r in aggregated_rows]
        aided_series = [r["aided_pct"] for r in aggregated_rows]

        return {
            "chart_id": "brand_awareness",
            "chart_type": "stacked_bar",
            "title": "Brand Awareness",
            "subtitle": "Exclusive waterfall awareness by brand",
            "data": {
                "labels": labels,
                "datasets": [
                    {"label": "TOM", "data": tom_series},
                    {"label": "Other_Unaided", "data": other_series},
                    {"label": "Aided", "data": aided_series},
                ],
                # Full sorted base rows for advanced consumers (debug/table parity).
                "rows": aggregated_rows,
                # Strict requested object contract from the same base rows.
                "objects": awareness_objects,
            },
            "brands": labels,
            "base_n": total_respondents,
            "metadata": {
                "awareness_keys": self.data.awareness_keys,
                "master_brand_source": "brand_master_list",
                "alias_mode": "explicit_alias_map_or_identity",
                "waterfall": ["TOM", "Other_Unaided", "Aided", "Not_Aware"],
                "series_order": ["TOM", "Other_Unaided", "Aided"],
                "series_colors": {
                    "TOM": "#0B1F4D",            # dark navy
                    "Other_Unaided": "#1D4ED8",  # dark blue
                    "Aided": "#93C5FD",          # light blue
                },
                "sort": "total_awareness_pct_desc_then_brand_asc",
                # Optional frontend contract: hide segment labels below 3% by default.
                "label_threshold_pct": 0.03,
            },
        }

    def _build_purchase_funnel_stage_base(self) -> Dict[str, Any]:
        """
        Canonical, reusable funnel base for new PF headline charts.

        Produces per-brand:
          - Stage percentages (0..1): total_awareness, consideration, bought_12m, bought_3m, mou
          - Strict ratios (0..1): attractive, conversion, loyalty, commitment

        Deterministic ordering:
          1) my_brand first (if present)
          2) total_awareness desc
          3) brand name asc
        """
        cache = getattr(self, "_purchase_funnel_stage_base_cache", None)
        if cache is not None:
            return cache

        pf_df = self.data.purchase_funnel
        if pf_df.empty:
            self._purchase_funnel_stage_base_cache = {}
            return {}

        master_brands = self._resolve_master_brands_for_awareness()
        if not master_brands:
            self._purchase_funnel_stage_base_cache = {}
            return {}

        stage_question_keys = self._stage_roles()
        relevant_questions: List[str] = []
        for role in stage_question_keys:
            relevant_questions.extend(self._question_ids_for_stage(role))
        relevant_questions = list(dict.fromkeys(relevant_questions))
        pf_subset = pf_df[pf_df["question"].isin(relevant_questions)].copy()

        respondent_ids = sorted(pf_df["response_id"].dropna().unique().tolist())
        total_respondents = len(respondent_ids) or int(self.data.response_count or 0)
        if total_respondents <= 0:
            self._purchase_funnel_stage_base_cache = {}
            return {}

        # Reuse canonical BA source for total_awareness consistency.
        awareness = self.brand_awareness_stacked()
        awareness_objects = (((awareness or {}).get("data") or {}).get("objects") or [])
        awareness_lookup = {
            str(row.get("brand")): float(row.get("total_awareness_pct", 0) or 0)
            for row in awareness_objects if isinstance(row, dict)
        }

        canonical_display = {
            self._norm_brand_token(b): b
            for b in master_brands
            if isinstance(b, str) and b.strip()
        }
        alias_map = self.data.brand_alias_map or {}

        stage_counts = {
            brand: {
                "consideration": 0,
                "bought_12m": 0,
                "bought_3m": 0,
                "mou": 0,
            }
            for brand in master_brands
        }

        # Build per-respondent mention sets per stage.
        for resp_id in respondent_ids:
            resp_rows = pf_subset[pf_subset["response_id"] == resp_id]
            if resp_rows.empty:
                continue

            per_stage_mentions: Dict[str, Set[str]] = {
                "consideration": set(),
                "bought_12m": set(),
                "bought_3m": set(),
                "mou": set(),
            }

            for _, row in resp_rows.iterrows():
                q = str(row.get("question") or "")
                raw_vals = self._coerce_answer_values(row.get("value"))
                canonical_vals = self._canonicalize_mentions(raw_vals, alias_map, canonical_display)

                for stage_name in stage_question_keys:
                    if q in self._question_ids_for_stage(stage_name):
                        per_stage_mentions[stage_name].update(canonical_vals)
                        break

            for brand in master_brands:
                if brand in per_stage_mentions["consideration"]:
                    stage_counts[brand]["consideration"] += 1
                if brand in per_stage_mentions["bought_12m"]:
                    stage_counts[brand]["bought_12m"] += 1
                if brand in per_stage_mentions["bought_3m"]:
                    stage_counts[brand]["bought_3m"] += 1
                if brand in per_stage_mentions["mou"]:
                    stage_counts[brand]["mou"] += 1

        rows: List[Dict[str, Any]] = []
        non_monotonic_brands: List[str] = []
        for brand in master_brands:
            total_awareness = float(awareness_lookup.get(brand, 0))
            consideration = stage_counts[brand]["consideration"] / total_respondents
            bought_12m = stage_counts[brand]["bought_12m"] / total_respondents
            bought_3m = stage_counts[brand]["bought_3m"] / total_respondents
            mou = stage_counts[brand]["mou"] / total_respondents

            stage_path = [total_awareness, consideration, bought_12m, bought_3m, mou]
            if any(stage_path[i + 1] > stage_path[i] for i in range(len(stage_path) - 1)):
                non_monotonic_brands.append(brand)

            attractive = self._safe_ratio(consideration, total_awareness)
            conversion = self._safe_ratio(bought_12m, consideration)
            loyalty = self._safe_ratio(bought_3m, bought_12m)
            commitment = self._safe_ratio(mou, bought_3m)

            rows.append({
                "brand": brand,
                "stages": {
                    "total_awareness": round(total_awareness, 6),
                    "consideration": round(consideration, 6),
                    "bought_12m": round(bought_12m, 6),
                    "bought_3m": round(bought_3m, 6),
                    "mou": round(mou, 6),
                },
                "ratios": {
                    "attractive": round(attractive, 6),
                    "conversion": round(conversion, 6),
                    "loyalty": round(loyalty, 6),
                    "commitment": round(commitment, 6),
                },
            })

        # Deterministic ordering with my_brand pinning.
        my_brand_key = str(self.my_brand or "").casefold().strip()

        def _sort_key(row: Dict[str, Any]):
            brand_name = str(row.get("brand", ""))
            is_not_my_brand = 0 if brand_name.casefold() == my_brand_key and my_brand_key else 1
            total_aw = float((row.get("stages") or {}).get("total_awareness", 0) or 0)
            return (is_not_my_brand, -total_aw, brand_name.casefold())

        rows.sort(key=_sort_key)

        result = {
            "base_n": total_respondents,
            "stage_labels": ["total_awareness", "consideration", "bought_12m", "bought_3m", "mou"],
            "ratio_labels": ["attractive", "conversion", "loyalty", "commitment"],
            "brands": [row["brand"] for row in rows],
            "rows": rows,
            "lookup": {row["brand"]: row for row in rows},
            "metadata": {
                "ratio_mode": "strict_stage_funnel",
                "denominator_safe": True,
                "stage_questions": stage_question_keys,
                "awareness_keys": self.data.awareness_keys,
                "total_awareness_source": "brand_awareness_stacked.data.objects",
                "ordering": "my_brand_first_then_total_awareness_desc_then_brand_asc",
                "non_monotonic_brands": non_monotonic_brands,
                "render_policy": "show_values_as_is_no_smoothing",
            },
        }
        self._purchase_funnel_stage_base_cache = result
        return result

    def purchase_funnel_ratio_cards(self) -> Dict[str, Any]:
        """
        Per-brand funnel ratio cards:
          - Stage bars (top-to-bottom visual order)
          - Inter-stage ratio labels as standalone rows
        """
        base = self._build_purchase_funnel_stage_base()
        if not base:
            return {}

        rows = base.get("rows") or []
        if not rows:
            return {}

        stage_bar_rows = [
            ("mou", "MOU"),
            ("bought_3m", "Bought 3M"),
            ("bought_12m", "Bought 12M"),
            ("consideration", "Consideration"),
            ("total_awareness", "Total Awareness"),
        ]
        ratio_label_rows = [
            ("commitment", "Commitment Ratio"),
            ("loyalty", "Loyalty Ratio"),
            ("conversion", "Conversion Ratio"),
            ("attractive", "Attractive Ratio"),
        ]

        brand_cards: List[Dict[str, Any]] = []
        for row in rows:
            brand = str(row.get("brand", "")).strip()
            if not brand:
                continue

            stages = row.get("stages") or {}
            ratios = row.get("ratios") or {}

            stage_bars = []
            for stage_key, stage_label in stage_bar_rows:
                val = float(stages.get(stage_key, 0) or 0)
                stage_bars.append({
                    "stage_key": stage_key,
                    "label": stage_label,
                    "value": round(val, 6),  # 0..1
                })

            ratio_labels = []
            for ratio_key, ratio_label in ratio_label_rows:
                val = float(ratios.get(ratio_key, 0) or 0)
                ratio_labels.append({
                    "ratio_key": ratio_key,
                    "label": ratio_label,
                    "value": round(val, 6),  # 0..1
                    "text": f"{round(val * 100)}%",
                })

            # Explicit display sequence for frontend renderer.
            display_sequence = [
                {"type": "stage", "key": "mou"},
                {"type": "ratio", "key": "commitment"},
                {"type": "stage", "key": "bought_3m"},
                {"type": "ratio", "key": "loyalty"},
                {"type": "stage", "key": "bought_12m"},
                {"type": "ratio", "key": "conversion"},
                {"type": "stage", "key": "consideration"},
                {"type": "ratio", "key": "attractive"},
                {"type": "stage", "key": "total_awareness"},
            ]

            brand_cards.append({
                "brand": brand,
                "stage_bars": stage_bars,
                "ratio_labels": ratio_labels,
                "display_sequence": display_sequence,
                # Flat objects for convenience/selective consumers
                "stages": {
                    "total_awareness": float(stages.get("total_awareness", 0) or 0),
                    "consideration": float(stages.get("consideration", 0) or 0),
                    "bought_12m": float(stages.get("bought_12m", 0) or 0),
                    "bought_3m": float(stages.get("bought_3m", 0) or 0),
                    "mou": float(stages.get("mou", 0) or 0),
                },
                "ratios": {
                    "attractive": float(ratios.get("attractive", 0) or 0),
                    "conversion": float(ratios.get("conversion", 0) or 0),
                    "loyalty": float(ratios.get("loyalty", 0) or 0),
                    "commitment": float(ratios.get("commitment", 0) or 0),
                },
            })

        if not brand_cards:
            return {}

        return {
            "chart_id": "purchase_funnel_ratio_cards",
            "chart_type": "funnel_ratio_cards",
            "title": "Purchase Funnel — Ratio Cards",
            "subtitle": "Stage bars with inter-stage conversion ratios",
            "data": {
                "brand_cards": brand_cards,
            },
            "brands": [card["brand"] for card in brand_cards],
            "base_n": int(base.get("base_n", self.n) or 0),
            "metadata": {
                **(base.get("metadata") or {}),
                "source_base": "_build_purchase_funnel_stage_base",
                "visible_brand_options": [1, 2, 3, "all"],
                "default_visible_brands": 1,
                "layout": {
                    "stage_order_top_to_bottom": ["mou", "bought_3m", "bought_12m", "consideration", "total_awareness"],
                    "ratio_order_between_stages": ["commitment", "loyalty", "conversion", "attractive"],
                },
                "value_scale": "ratio_0_to_1",
                "render_policy": "show_values_as_is_no_smoothing",
            },
        }

    def purchase_funnel_reference_table(self) -> Dict[str, Any]:
        """
        Matrix of all funnel metrics for comparison against a reference.
        Rows match the specific sequence: MOU, Commitment, Bought 3M, Loyalty, 
        Bought 12M, Conversion, Consideration, Attractive, Total Awareness.
        """
        base = self._build_purchase_funnel_stage_base()
        if not base:
            return {}

        rows_data = base.get("rows") or []
        if not rows_data:
            return {}

        # 1. Define Row Hierarchy (Display Order requested by USER)
        # Mapping (key, label, source_category)
        row_definitions = [
            ("mou", "MOU", "stages"),
            ("commitment", "Commitment Ratio", "ratios"),
            ("bought_3m", "Bought 3M", "stages"),
            ("loyalty", "Loyalty Ratio", "ratios"),
            ("bought_12m", "Bought 12M", "stages"),
            ("conversion", "Conversion Ratio", "ratios"),
            ("consideration", "Consideration", "stages"),
            ("attractive", "Attractive Ratio", "ratios"),
            ("total_awareness", "Total Awareness", "stages"),
        ]

        available_brands = base.get("brands", [])
        
        # 2. Compute "Overall Average" for each row across all funnel-tracked brands
        averages = {}
        for key, _, cat in row_definitions:
            vals = []
            for r in rows_data:
                v = (r.get(cat) or {}).get(key, 0)
                vals.append(float(v))
            averages[key] = round(float(np.mean(vals)), 6) if vals else 0

        # 3. Structure return payload with per-brand metrics
        brand_data = {}
        for r in rows_data:
            brand = r["brand"]
            metrics = {}
            for key, _, cat in row_definitions:
                metrics[key] = r.get(cat, {}).get(key, 0)
            brand_data[brand] = metrics

        return {
            "chart_id": "purchase_funnel_reference_table",
            "chart_type": "reference_table",
            "title": "Reference Table",
            "subtitle": "Purchase Funnel Benchmark Comparison",
            "data": {
                "row_definitions": [{"key": k, "label": l} for k, l, _ in row_definitions],
                "brands": available_brands,
                "brand_data": brand_data,
                "averages": averages,
                "my_brand": self.my_brand,
            },
            "brands": available_brands,
            "base_n": int(base.get("base_n", self.n) or 0),
        }

    # ──────────────────────────────────────────────────────────────────────
    #  5. Brand Profile Cards
    # ──────────────────────────────────────────────────────────────────────

    def _build_brand_card_profile(
        self,
        *,
        brand: str,
        brand_df: pd.DataFrame,
        scale_max: float,
        nps_by_brand: Dict[str, NpsBrandMetrics],
    ) -> Dict[str, Any]:
        """Assemble ordered scorecard profile metrics for a single brand."""
        t2b_threshold = scale_max - 1
        overall_t2b = (brand_df["value"] >= t2b_threshold).mean() * 100

        profile: Dict[str, Any] = {
            "Brand": brand,
            "Overall Score": round(float(brand_df["value"].mean()), 2),
            "T2B %": round(float(overall_t2b), 1),
        }
        if brand in nps_by_brand:
            profile["NPS"] = nps_by_brand[brand]["nps"]
        profile["Evaluations"] = len(brand_df)
        return profile

    def brand_cards(self) -> List[Dict[str, Any]]:
        """One scorecard per brand with key performance metrics."""
        df = self.data.scale_evaluations
        if df.empty:
            return []

        nps_by_brand = self._compute_nps_by_brand()
        scale_max = df["value"].max()
        cards = []
        for brand in self.brands:
            brand_df = df[df["brand"] == brand]
            if brand_df.empty:
                continue

            # Per-attribute breakdown (top 3 strengths)
            attr_means = brand_df.groupby("attribute")["value"].mean().sort_values(ascending=False)
            top_attrs = attr_means.head(3)
            strengths = [{"attribute": attr, "score": round(float(score), 2)} for attr, score in top_attrs.items()]

            profile = self._build_brand_card_profile(
                brand=brand,
                brand_df=brand_df,
                scale_max=scale_max,
                nps_by_brand=nps_by_brand,
            )

            card_data: Dict[str, Any] = {"profile": profile, "strengths": strengths}
            if brand in nps_by_brand:
                card_data["nps"] = dict(nps_by_brand[brand])

            cards.append({
                "chart_id": f"brand_card_{brand.replace(' ', '_').lower()}",
                "chart_type": "scorecard",
                "title": f"{brand}",
                "data": card_data,
                "brands": [brand],
                "base_n": self.n,
            })

        return cards

    # ──────────────────────────────────────────────────────────────────────
    #  6. Attribute Radar
    # ──────────────────────────────────────────────────────────────────────

    def attribute_radar(self) -> Dict[str, Any]:
        """
        Spider/Radar chart: ENHANCED.
        Calculates category benchmarks, detects domain, and adds analysis.
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        # 1. Attributes selection (Filter out noise and overall markers)
        noise_markers = {"general", "overall", "likeness", "total", "global"}
        attributes = sorted([
            a for a in df["attribute"].unique() 
            if str(a).lower().strip() not in noise_markers
        ])
        
        if len(attributes) < 3:
            # Fallback: if we filtered too much, try to keep everything except "General"
            attributes = sorted([a for a in df["attribute"].unique() if str(a).lower().strip() != "general"])
            if len(attributes) < 3:
                return {}

        # 2. Domain Recognition (for Chart Rendering)
        actual_max = df["value"].max()
        if actual_max > 15: max_domain = 100
        elif actual_max > 6: max_domain = 10
        else: max_domain = 5

        # 3. Computations
        all_means = df.groupby(["attribute", "brand"])["value"].mean()
        category_means = df.groupby("attribute")["value"].mean()
        
        display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]
        datasets = []

        # CATEGORY GHOST LAYER: Gray benchmark for comparison
        datasets.append({
            "label": "CATEGORY AVG",
            "brand": "Category",
            "data": [round(float(category_means.get(attr, 0)), 2) for attr in attributes],
            "is_benchmark": True
        })

        # TARGET BRAND & COMPETITOR PATHS
        for brand in display_brands:
            brand_evals = df[df["brand"] == brand]
            if brand_evals.empty: continue
            
            values = [round(float(all_means.get((attr, brand), 0)), 2) for attr in attributes]
            n_count = self.brand_counts.get(brand, 0)
            
            datasets.append({
                "label": f"{str(brand).upper()} (N={n_count})",
                "brand": brand,
                "data": values,
                "is_primary": (brand == self.my_brand)
            })

        # 4. Advanced Neural Insight Analysis (Competitive Gap Detection)
        insight_msg = ""
        my_scores = {attr: all_means.get((attr, self.my_brand), 0) for attr in attributes}
        gaps_to_category = {attr: my_scores[attr] - category_means.get(attr, 0) for attr in attributes}
        
        if self.my_brand in df["brand"].unique():
            # Identify absolute strengths and weaknesses
            strengths = [attr for attr, gap in gaps_to_category.items() if gap > 0.1]
            weaknesses = [attr for attr, gap in gaps_to_category.items() if gap < -0.1]
            
            if strengths:
                top_s = sorted(strengths, key=lambda x: gaps_to_category[x], reverse=True)[:2]
                insight_msg = f"{self.my_brand} is outperforming the category average in {', '.join(top_s)}. "
            
            if weaknesses:
                top_w = sorted(weaknesses, key=lambda x: gaps_to_category[x])[:1]
                insight_msg += f"Critical focus needed on {top_w[0]} where performance trails the benchmark by {abs(round(gaps_to_category[top_w[0]], 2))} points. "
            
            # Competitor context
            if self.top_competitor:
                comp_scores = {attr: all_means.get((attr, self.top_competitor), 0) for attr in attributes}
                comp_gaps = {attr: my_scores[attr] - comp_scores[attr] for attr in attributes}
                head_to_head = max(comp_gaps, key=comp_gaps.get)
                if comp_gaps[head_to_head] > 0.2:
                    insight_msg += f"Competitive Edge: Leading {self.top_competitor} significantly in {head_to_head}."
        
        if not insight_msg:
             insight_msg = f"Consistent Equilibrium: {self.my_brand} performance is tightly coupled with the category average across all core attributes."

        return {
            "chart_id": "attribute_radar",
            "chart_type": "radar",
            "title": "Attribute Performance Radar",
            "subtitle": f"Comparative strengths across {len(attributes)} criteria",
            "data": {
                "labels": attributes, 
                "datasets": datasets,
                "domain": [0, max_domain],
                "scale_type": "points" if max_domain <= 10 else "percentage"
            },
            "insight": insight_msg,
            "brands": ["Category"] + display_brands,
            "base_n": self.n,
            "section": "Criteria Analysis"
        }

    # ──────────────────────────────────────────────────────────────────────
    #  7-9. Open-End Word Clouds
    # ──────────────────────────────────────────────────────────────────────

    def open_end_clouds(self) -> List[Dict[str, Any]]:
        """Word clouds for Likes, Dislikes, and Improvements."""
        oe = self.data.open_ends
        if oe.empty:
            return []

        charts = []
        # Map metrics to chart categories
        like_keywords = ["like", "liked", "love", "best"]
        dislike_keywords = ["dislike", "disliked", "hate", "worst"]
        improve_keywords = ["improve", "suggest", "better", "enhancement"]

        categories = [
            ("likes", "What Respondents Liked", like_keywords),
            ("dislikes", "What Respondents Disliked", dislike_keywords),
            ("improvements", "Suggestions for Improvement", improve_keywords),
        ]

        for cat_id, title, keywords in categories:
            # Filter by metric name containing any keyword
            mask = oe["metric"].str.lower().apply(
                lambda m: any(kw in str(m).lower() for kw in keywords)
            )
            subset = oe[mask]

            if subset.empty:
                continue

            # Count word frequencies across all responses
            all_words: List[str] = []
            for text in subset["value"].dropna():
                words = str(text).lower().strip().split()
                # Filter stopwords and short words
                all_words.extend([w for w in words if len(w) > 2 and w not in _STOPWORDS])

            word_counts = Counter(all_words).most_common(30)
            if not word_counts:
                continue

            cloud_data = [{"text": w, "value": c} for w, c in word_counts]

            charts.append({
                "chart_id": f"open_end_{cat_id}",
                "chart_type": "wordcloud",
                "title": title,
                "data": {"words": cloud_data},
                "base_n": len(subset),
            })

        return charts

    def _purchase_intent_frame(self) -> pd.DataFrame:
        """Scale-evaluation rows identified as purchase intent (shared detection rules)."""
        return filter_purchase_intent_rows(
            self.data.scale_evaluations,
            question_map=self.data.question_map,
        )

    def _overall_likability_frame(self) -> pd.DataFrame:
        """Numeric overall-liking rows (excludes PI / recommend / open-end General rows)."""
        df = self.data.scale_evaluations
        if df.empty:
            return df
        overall_mask = df["attribute"].str.lower().isin(["general", "overall", "likeness", "total"])
        overall_df = df[overall_mask].copy()
        if overall_df.empty:
            return overall_df
        pi_mask = purchase_intent_row_mask(
            overall_df,
            question_map=self.data.question_map,
        )
        rec_mask = recommend_nps_row_mask(overall_df["metric"])
        return overall_df[~(pi_mask | rec_mask)].copy()

    @staticmethod
    def _infer_likert_scale_max(*value_series: Optional[pd.Series]) -> int:
        """Infer Likert scale ceiling from observed response values (PI + OL frames)."""
        max_seen = 5.0
        for series in value_series:
            if series is None or series.empty:
                continue
            clean = pd.to_numeric(series, errors="coerce").dropna()
            if clean.empty:
                continue
            max_seen = max(max_seen, float(clean.max()))
        return int(math.ceil(max_seen))

    @staticmethod
    def _build_likability_axis_metadata(
        ol_series: List[float],
        *,
        likability_values: Optional[pd.Series] = None,
        pi_values: Optional[pd.Series] = None,
    ) -> Dict[str, Any]:
        """
        Build y-axis metadata for overall-likability from brand means and raw scale data.

        Domain upper bound uses headroom above the highest brand mean; scale label uses
        the inferred Likert ceiling from all matched PI/OL response values.
        """
        positive_means = [float(v) for v in ol_series if float(v) > 0]
        observed_mean_max = max(positive_means, default=5.0)
        scale_max = ReportAggregator._infer_likert_scale_max(likability_values, pi_values)
        domain_upper = max(int(math.ceil(observed_mean_max + 0.5)), scale_max)

        return {
            "label": "Likability Score",
            "unit": f"1-{scale_max}",
            "domain": [1, domain_upper],
            "scale_max": scale_max,
        }

    @staticmethod
    def _brand_comparison_insight_message(
        labels: List[str],
        pi_series: List[float],
        ol_series: List[float],
    ) -> str:
        """
        Insight text for brand_comparison_pi_ol.

        Correlation is only computed when there are 3+ brands; with 2 brands correlation
        is always ±1.0 and would produce misleading strategic narratives.
        """
        default = "Strategic performance map for competitive analysis."
        if len(labels) < 2:
            return default

        if len(labels) == 2:
            pi_leader = labels[int(np.argmax(pi_series))]
            ol_leader = labels[int(np.argmax(ol_series))]
            if pi_leader == ol_leader:
                return (
                    f"{pi_leader} leads on both Purchase Intent and Overall Likability "
                    "in this head-to-head comparison."
                )
            return (
                f"{pi_leader} leads Purchase Intent while {ol_leader} leads Overall Likability — "
                "sentiment and conversion diverge; evaluate pricing, distribution, or brand equity."
            )

        try:
            corr = float(np.corrcoef(pi_series, ol_series)[0, 1])
            if np.isnan(corr):
                return default
            if corr > 0.7:
                return (
                    "Strong Correlation: Overall likeness is effectively driving purchase conversion."
                )
            if corr < 0.3:
                return (
                    "Weak Correlation: Brand sentiment does not directly translate to purchase intent; "
                    "check pricing or distribution."
                )
        except Exception:
            pass
        return default

    # ──────────────────────────────────────────────────────────────────────
    #  10. Purchase Intent
    # ──────────────────────────────────────────────────────────────────────

    def purchase_intent(self) -> Dict[str, Any]:
        """Bar chart: 'intend to buy' scores per brand."""
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        intent_df = self._purchase_intent_frame()
        if intent_df.empty:
            return {}

        display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]
        t2b = compute_pi_t2b_by_brand(intent_df, display_brands)
        labels = [b for b in display_brands if b in intent_df["brand"].unique()]
        values = [t2b.get(b, 0.0) for b in labels]

        return {
            "chart_id": "purchase_intent",
            "chart_type": "horizontal_bar",
            "title": "Purchase Intent",
            "subtitle": "Top 2 Box — Likelihood to buy",
            "data": {"labels": labels, "datasets": [{"label": "Intent T2B%", "data": values}]},
            "brands": labels,
            "base_n": self.n,
        }

    # ──────────────────────────────────────────────────────────────────────
    #  10.5 Brand Strategic Comparison (PI vs. OL)
    # ──────────────────────────────────────────────────────────────────────

    def brand_comparison_pi_ol(self) -> Dict[str, Any]:
        """
        Advanced Strategic Dashboard: Dual-Metric Brand Comparison.
        Synchronizes Purchase Intent (T2B%) vs Overall Likability (Mean Score).
        Enables high-fidelity executive analysis of conversion vs sentiment.
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        intent_df = self._purchase_intent_frame()
        overall_df = self._overall_likability_frame()

        if intent_df.empty and overall_df.empty:
            return {}

        available_brands = sorted(self.brands)
        labels: List[str] = []
        pi_series: List[float] = []
        ol_series: List[float] = []

        t2b_by_brand = compute_pi_t2b_by_brand(intent_df, available_brands)
        ol_brands = set(overall_df["brand"].unique()) if not overall_df.empty else set()
        pi_diag = build_pi_diagnostics(intent_df, available_brands, overall_brands=ol_brands)

        for brand in available_brands:
            pi_val = t2b_by_brand.get(brand, 0.0)

            b_overall = overall_df[overall_df["brand"] == brand]
            ol_val = float(b_overall["value"].mean()) if not b_overall.empty else 0.0

            if pi_val > 0 or ol_val > 0:
                labels.append(brand)
                pi_series.append(pi_val)
                ol_series.append(round(ol_val, 2))

        if not labels:
            return {}

        if pi_diag.brands_missing_pi:
            logger.info(
                "brand_comparison_pi_ol: brands with likability but no PI rows: %s",
                pi_diag.brands_missing_pi,
            )

        insight_msg = self._brand_comparison_insight_message(labels, pi_series, ol_series)

        likability_values = overall_df["value"] if not overall_df.empty else None
        pi_values = intent_df["value"] if not intent_df.empty else None

        metadata: Dict[str, Any] = {
            "y_axis_left": {"label": "Purchase Intent", "unit": "%", "domain": [0, 100]},
            "y_axis_right": self._build_likability_axis_metadata(
                ol_series,
                likability_values=likability_values,
                pi_values=pi_values,
            ),
            "pi_diagnostics": pi_diag.to_metadata(),
        }

        return {
            "chart_id": "brand_comparison_pi_ol",
            "chart_type": "brand_comparison",
            "title": "Brand Strategic Comparison",
            "subtitle": "Purchase Intent (T2B%) vs. Overall Likability (Mean Score)",
            "data": {
                "labels": labels,
                "datasets": [
                    {"label": "Purchase Intent (T2B%)", "data": pi_series, "unit": "%"},
                    {"label": "Overall Likability", "data": ol_series, "unit": "score"},
                ],
                "metadata": metadata,
            },
            "insight": insight_msg,
            "brands": labels,
            "base_n": self.n,
            "section": "Executive Summary",
        }

    # ──────────────────────────────────────────────────────────────────────
    #  11. NPS / Recommendation
    # ──────────────────────────────────────────────────────────────────────

    def _recommend_nps_frame(self) -> pd.DataFrame:
        """Scale-evaluation rows for likelihood-to-recommend / NPS questions."""
        df = self.data.scale_evaluations
        if df.empty:
            return df
        rec_mask = recommend_nps_row_mask(df["metric"])
        return df[rec_mask].copy()

    @staticmethod
    def _infer_nps_scale_max(scores: pd.Series) -> int:
        """
        Infer recommend-scale ceiling from all observed scores in the recommend frame.

        Uses the survey-wide maximum so every brand shares the same promoter/detractor
        cutoffs. A brand whose respondents only scored 1-5 still uses 0-10 thresholds
        when any other brand (or the same frame) contains scores above 5.
        """
        clean = pd.to_numeric(scores, errors="coerce").dropna()
        if clean.empty:
            return 10
        return 5 if float(clean.max()) <= 5 else 10

    @staticmethod
    def _nps_segments_from_scores(
        scores: pd.Series,
        *,
        scale_max: Optional[int] = None,
    ) -> NpsBrandMetrics:
        """
        Compute NPS and promoter/passive/detractor percentages from raw scores.

        Formula (standard NPS):
            NPS = round((% Promoters - % Detractors) * 100), range -100..+100
            Passives = remainder; not subtracted from the score.

        Thresholds (chosen via ``scale_max``):
            - 5-point scale (max observed <= 5): Promoters >= 4, Detractors <= 2
            - 0-10 scale (max observed > 5): Promoters >= 9, Detractors <= 6

        When ``scale_max`` is omitted, it is inferred from ``scores`` alone (unit tests).
        Production paths should pass the frame-level value from ``_compute_nps_by_brand``.
        """
        clean = pd.to_numeric(scores, errors="coerce").dropna()
        total = len(clean)
        if total == 0:
            return {
                "nps": 0,
                "promoters_pct": 0.0,
                "passives_pct": 0.0,
                "detractors_pct": 0.0,
                "base_n": 0,
            }

        effective_scale = scale_max if scale_max is not None else ReportAggregator._infer_nps_scale_max(clean)
        if effective_scale <= 5:
            promoters = int((clean >= 4).sum())
            detractors = int((clean <= 2).sum())
        else:
            promoters = int((clean >= 9).sum())
            detractors = int((clean <= 6).sum())

        nps = round(((promoters - detractors) / total) * 100)
        return {
            "nps": nps,
            "promoters_pct": round(promoters / total * 100, 1),
            "passives_pct": round((total - promoters - detractors) / total * 100, 1),
            "detractors_pct": round(detractors / total * 100, 1),
            "base_n": total,
        }

    def _compute_nps_by_brand(
        self,
        rec_df: Optional[pd.DataFrame] = None,
    ) -> Dict[str, NpsBrandMetrics]:
        """
        Per-brand NPS metrics keyed by brand name.

        Scale detection runs once on the full recommend/NPS frame so brand cards and
        the standalone NPS gauge always apply identical thresholds per survey.

        Brands without recommend/NPS response rows are omitted. Preserves
        ``self.brands`` iteration order when consumed by chart builders.
        """
        frame = rec_df if rec_df is not None else self._recommend_nps_frame()
        if frame.empty:
            return {}

        scale_max = self._infer_nps_scale_max(frame["value"])
        nps_by_brand: Dict[str, NpsBrandMetrics] = {}
        for brand in self.brands:
            brand_df = frame[frame["brand"] == brand]
            if brand_df.empty:
                continue
            nps_by_brand[brand] = self._nps_segments_from_scores(
                brand_df["value"],
                scale_max=scale_max,
            )
        return nps_by_brand

    @staticmethod
    def _build_nps_gauge_data(
        nps_by_brand: Dict[str, NpsBrandMetrics],
        *,
        brand_order: List[str],
    ) -> Dict[str, Any]:
        """
        Build canonical multi-brand NPS gauge payload for web and PPTX renderers.

        Shape:
            labels: brand names in ``brand_order`` (skipping brands without NPS rows)
            datasets: Detractors / Passives / Promoters series (fractions 0..1 per brand)
            nps_scores: {brand: nps_int}
            segments: raw per-brand metrics for CSV export and backward compatibility
        """
        labels = [brand for brand in brand_order if brand in nps_by_brand]
        if not labels:
            return {}

        detractor_fractions: List[float] = []
        passive_fractions: List[float] = []
        promoter_fractions: List[float] = []
        nps_scores: Dict[str, int] = {}
        segments: List[Dict[str, Any]] = []

        for brand in labels:
            metrics = nps_by_brand[brand]
            detractor_fractions.append(round(metrics["detractors_pct"] / 100.0, 4))
            passive_fractions.append(round(metrics["passives_pct"] / 100.0, 4))
            promoter_fractions.append(round(metrics["promoters_pct"] / 100.0, 4))
            nps_scores[brand] = metrics["nps"]
            segments.append({"brand": brand, **metrics})

        return {
            "labels": labels,
            "datasets": [
                {"label": "Detractors", "data": detractor_fractions},
                {"label": "Passives", "data": passive_fractions},
                {"label": "Promoters", "data": promoter_fractions},
            ],
            "nps_scores": nps_scores,
            "segments": segments,
        }

    def nps_recommend(self) -> Dict[str, Any]:
        """
        NPS-style gauge per brand from likelihood-to-recommend / NPS questions.

        Emits a canonical ``data`` envelope (``labels``, segment ``datasets`` as
        fractions, ``nps_scores``, and raw ``segments``) consumed by web and PPTX
        gauge builders. See ``_nps_segments_from_scores`` for threshold rules.
        """
        if self.data.scale_evaluations.empty:
            return {}

        nps_by_brand = self._compute_nps_by_brand()
        gauge_data = self._build_nps_gauge_data(nps_by_brand, brand_order=self.brands)
        if not gauge_data:
            return {}

        return {
            "chart_id": "nps_recommend",
            "chart_type": "gauge",
            "title": "Net Promoter Score",
            "subtitle": "Likelihood to recommend",
            "data": gauge_data,
            "brands": gauge_data["labels"],
            "base_n": self.n,
        }

    # ──────────────────────────────────────────────────────────────────────
    #  12. Price Sensitivity
    # ──────────────────────────────────────────────────────────────────────

    def price_sensitivity(self) -> Dict[str, Any]:
        """Distribution of stated willingness-to-pay."""
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        price_mask = df["metric"].str.lower().str.contains("price|pay|cost", na=False)
        price_df = df[price_mask]

        if price_df.empty:
            return {}

        # Convert to numeric, coercing errors
        prices = pd.to_numeric(price_df["value"], errors="coerce").dropna()

        if prices.empty:
            return {}

        datasets = []
        for brand in self.brands:
            brand_prices = pd.to_numeric(
                price_df[price_df["brand"] == brand]["value"], errors="coerce"
            ).dropna()
            
            if brand_prices.empty:
                continue

            datasets.append({
                "brand": brand,
                "mean": round(float(brand_prices.mean()), 2),
                "median": round(float(brand_prices.median()), 2),
                "min": round(float(brand_prices.min()), 2),
                "max": round(float(brand_prices.max()), 2),
                "base_n": len(brand_prices),
            })

        if not datasets:
            return {}

        return {
            "chart_id": "price_sensitivity",
            "chart_type": "horizontal_bar",
            "title": "Price Sensitivity",
            "subtitle": "Willingness-to-pay distribution",
            "data": {
                "labels": [d["brand"] for d in datasets],
                "datasets": [{"label": "Mean Price", "data": [d["mean"] for d in datasets]}],
                "details": datasets,
            },
            "brands": [d["brand"] for d in datasets],
            "base_n": self.n,
        }

    # ──────────────────────────────────────────────────────────────────────
    #  13. Overall Scatter (Correlational Matrix)
    # ──────────────────────────────────────────────────────────────────────

    def overall_scatter(self) -> Dict[str, Any]:
        """
        Map attributes on a 2D plane for ALL brands:
        X-axis: Significance (Correlation to Overall Rating)
        Y-axis: Top-2-Box % (Performance)
        N=10: Limit to Top 10 Drivers for clarity.
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        # 1. Compute Significance via Pearson correlation (Global Category Drivers)
        sig_map = self._compute_significance(df)
        
        # 2. Identify Top 10 Attributes (Drivers of Likeness)
        # Avoid overall markers in the breakdown
        overall_markers = {"general", "overall", "likeness", "total", "global", "essence"}
        sorted_attrs = sorted(
            [a for a in sig_map.keys() if not any(m in str(a).lower() for m in overall_markers)],
            key=lambda a: sig_map.get(a, 0),
            reverse=True
        )[:10]

        if not sorted_attrs:
            return {}

        datasets = []
        available_brands = sorted(self.brands)
        for brand in available_brands:
            brand_df = df[df['brand'].str.lower() == brand.lower()]
            if brand_df.empty:
                continue
                
            brand_points = []
            for attr in sorted_attrs:
                # Find global max for this attribute across ALL brands to determine scale
                global_attr_df = df[df['attribute'] == attr]
                global_numeric = pd.to_numeric(global_attr_df["value"], errors='coerce').dropna()
                if global_numeric.empty:
                    continue
                global_max = global_numeric.max()
                t2b_threshold = global_max - 1
                
                attr_df = brand_df[brand_df['attribute'] == attr]
                if attr_df.empty:
                    continue
                
                # T2B Calculation
                numeric_vals = pd.to_numeric(attr_df["value"], errors='coerce').dropna()
                if len(numeric_vals) == 0:
                    continue
                
                t2b_pct = (numeric_vals >= t2b_threshold).mean() * 100
                brand_points.append({
                    "attribute": attr,
                    # Join key for the Key Preference Drivers drill-down: must
                    # match `main_key` on sub_attribute_scatter points.
                    "main_key": self._norm_attr_key(attr),
                    "x": round(sig_map.get(attr, 0) * 100, 1),
                    "y": round(float(t2b_pct), 1),
                    "brand": brand
                })

            if brand_points:
                datasets.append({
                    "brand": brand,
                    "data": brand_points
                })

        if not datasets:
            return {}

        return {
            "chart_id": "overall_scatter",
            "chart_type": "scatter_plot",
            "title": "Correlational Matrix",
            "subtitle": f"{self.my_brand} — Impact vs Performance [All Brands Comparison]",
            "data": {
                "datasets": datasets,
                "top_attributes": sorted_attrs
            },
            "brands": available_brands,
            "base_n": self.n,
        }

    def sub_attribute_scatter(self) -> Dict[str, Any]:
        """
        Matrix: Sub-Attribute Analysis (Likeness Drivers).
        X-axis: Impact (Correlation of Sub-Attribute to General Likeness).
        Y-axis: Performance (T2B% for Sub-Attribute, scale 1-5).
        Logic: Registry-driven filtering to ensure semantic accuracy.
        """
        df = self.data.scale_evaluations
        if df.empty or not self.attribute_registry:
            return {}

        # 1. Identification: Map Registry to Metrics in Data
        # We reuse the same normalization logic as Likeness Snake Chart
        available_metrics = df["metric"].unique().tolist()
        qm = self.data.question_map
        target_map = {} # metric -> formatted_label

        for entry in self.attribute_registry:
            main_label = entry.get("main_att", "").strip()
            supp_label = entry.get("supp_att", "").strip()
            en_text = entry.get("en_text", "").strip()
            source = entry.get("source", "library")
            
            matched_metric = None
            norm_registry_text = self._norm_text(en_text) if source == "library" else ""
            
            # Mirror Likeness Profile logic for consistency
            if source == "library" and norm_registry_text:
                for m in available_metrics:
                    m_df = df[df["metric"] == m]
                    q_id = m_df["question_id"].iloc[0]
                    q_text = str(qm.get(q_id, {}).get("text", m)).strip()
                    if self._norm_text(q_text) == norm_registry_text:
                        matched_metric = m
                        break
            elif source == "custom" and supp_label:
                supp_lower = supp_label.lower().strip()
                for m in available_metrics:
                    if str(m).lower().strip() == supp_lower:
                        matched_metric = m
                        break
            
            if not matched_metric:
                for m in available_metrics:
                    m_df = df[df["metric"] == m]
                    q_text = str(qm.get(m_df["question_id"].iloc[0], {}).get("text", m)).strip().lower()
                    if supp_label.lower().strip() in q_text:
                        if m_df["value"].mean() <= 6.0:
                            matched_metric = m
                            break

            if matched_metric:
                # Prefer the dataframe's own `attribute` value as the main
                # attribute. `overall_scatter` labels its points from that same
                # column, so sourcing it here guarantees both panels of the
                # drill-down speak one vocabulary. The registry label is only a
                # fallback for metrics with no attribute recorded.
                data_main = ""
                matched_rows = df[df["metric"] == matched_metric]
                if not matched_rows.empty:
                    data_main = str(matched_rows["attribute"].iloc[0] or "").strip()

                target_map[matched_metric] = self._build_attribute_label(
                    data_main or main_label,
                    supp_label,
                )

        if not target_map:
            return {}

        # 2. Computation: Impact (Correlation)
        # Advanced Logic: We now compute significance at the METRIC level
        # to ensure that sub-attribute descriptors are correctly correlated.
        sig_map = self._compute_significance(df, use_metrics=True)
        
        # 3. Computation: Performance (T2B% on 1-5 scale)
        sub_df = df[df["metric"].isin(target_map.keys())].copy()
        sub_df = sub_df[(sub_df["value"] >= 1) & (sub_df["value"] <= 5)]
        
        if sub_df.empty:
            return {}

        datasets = []
        available_brands = sorted(self.brands)
        
        # Standard Visual Encoding (Backend-Driven for consistency)
        BRAND_COLORS = ['#60a5fa', '#34d399', '#fb7185', '#fbbf24', '#a78bfa', '#22d3ee', '#f472b6']
        SHAPES = ['circle', 'square', 'triangle', 'diamond', 'star', 'cross', 'wye']

        for b_idx, brand in enumerate(available_brands):
            brand_df = sub_df[sub_df['brand'].str.lower() == brand.lower()]
            if brand_df.empty:
                continue
                
            brand_points = []
            color = BRAND_COLORS[b_idx % len(BRAND_COLORS)]
            shape = SHAPES[b_idx % len(SHAPES)]

            for metric, meta in target_map.items():
                attr_df = brand_df[brand_df['metric'] == metric]
                if attr_df.empty:
                    continue
                
                # T2B Calculation (Threshold 4 for scale 1-5)
                numeric_vals = pd.to_numeric(attr_df["value"], errors='coerce').dropna()
                if len(numeric_vals) == 0:
                    continue
                
                t2b_pct = (numeric_vals >= 4).mean() * 100
                brand_points.append({
                    "attribute": meta["display"],
                    "main_attribute": meta["main_attribute"],
                    "sub_attribute": meta["sub_attribute"],
                    "main_key": meta["main_key"],
                    "sub_key": meta["sub_key"],
                    "is_distinct": meta["is_distinct"],
                    "x": round(sig_map.get(metric, 0) * 100, 1),
                    "y": round(float(t2b_pct), 1),
                    "brand": brand,
                    "color": color # Added for tooltip/cell mapping
                })

            if brand_points:
                datasets.append({
                    "brand": brand,
                    "color": color,
                    "shape": shape,
                    "data": brand_points
                })

        if not datasets:
            return {}

        return {
            "chart_id": "sub_attribute_scatter",
            "chart_type": "scatter_plot",
            "title": "Sub-Attribute Correlational Matrix",
            "subtitle": "Micro-Drivers of Likeness — Impact vs Performance",
            "data": {
                "datasets": datasets,
                "top_attributes": [m["display"] for m in target_map.values()],
                "attribute_metadata": list(target_map.values())
            },
            "brands": available_brands,
            "base_n": self.n,
            "section": "Criteria Analysis"
        }

    def driver_ranking_chart(self) -> Dict[str, Any]:
        """
        Tornado-style ranked bar view of the same sub-attribute impact/
        correlation data used by the Sub-Attribute Importance Matrix
        (`sub_attribute_scatter`), reformatted for the frontend's
        TornadoChart (CHART_MAP['driver_ranking']) so respondents get a
        single ranked "what matters most" view alongside the scatter matrix.
        """
        scatter = self.sub_attribute_scatter()
        if not scatter or not scatter.get("data", {}).get("datasets"):
            return {}

        # Main Insights shows MAIN attributes only. Sub-attribute points are
        # rolled up into their parent so the ranking reads as "which attribute
        # matters most", not "which of 40 descriptors matters most".
        datasets = []
        for ds in scatter["data"]["datasets"]:
            rolled: Dict[str, Dict[str, Any]] = {}
            for pt in ds.get("data", []):
                key = pt.get("main_key") or self._norm_attr_key(pt.get("main_attribute", ""))
                if not key:
                    continue
                bucket = rolled.setdefault(key, {
                    "attribute": pt.get("main_attribute") or pt.get("attribute"),
                    "main_attribute": pt.get("main_attribute") or pt.get("attribute"),
                    "main_key": key,
                    "brand": ds.get("brand"),
                    "color": pt.get("color"),
                    "_x": [],
                    "_y": [],
                    "sub_count": 0,
                })
                bucket["_x"].append(pt.get("x", 0))
                bucket["_y"].append(pt.get("y", 0))
                if pt.get("is_distinct"):
                    bucket["sub_count"] += 1

            points = []
            for bucket in rolled.values():
                xs, ys = bucket.pop("_x"), bucket.pop("_y")
                if not xs:
                    continue
                bucket["x"] = round(sum(xs) / len(xs), 1)
                bucket["y"] = round(sum(ys) / len(ys), 1)
                points.append(bucket)

            if points:
                points.sort(key=lambda p: p["x"], reverse=True)
                datasets.append({**ds, "data": points})

        if not datasets:
            return {}

        return {
            "chart_id": "driver_ranking",
            "chart_type": "driver_ranking",
            "title": "Top Attribute Drivers",
            "subtitle": "Ranked impact of each attribute on overall brand likeness",
            "data": {
                "datasets": datasets,
                "top_attributes": [p["attribute"] for p in datasets[0]["data"]],
                "level": "main",
            },
            "brands": scatter.get("brands"),
            "base_n": scatter.get("base_n"),
        }

    # ──────────────────────────────────────────────────────────────────────
    #  15. Combined Importance (Unified Matrix)
    # ──────────────────────────────────────────────────────────────────────

    def key_preference_drivers(self) -> Dict[str, Any]:
        """
        Unified view of Main Attributes (overall_scatter) and Sub-Attributes
        (sub_attribute_scatter) for the interactive Key Preference Drivers chart.
        """
        overall = self.overall_scatter()
        sub_all = self.sub_attribute_scatter()
        
        if not overall or not overall.get("data"):
            return {}
            
        return {
            "chart_id": "key_preference_drivers",
            "chart_type": "key_preference_drivers",
            "title": "Key Preference Drivers",
            "subtitle": "Interactive attribute impact analysis",
            "data": {
                "main_scatter": overall.get("data", {}),
                "sub_scatter": sub_all.get("data", {}) if sub_all else {},
                # Main -> sub map derived from the survey's attribute config,
                # so the drill-down knows which attributes are expandable even
                # before a point is clicked.
                "attribute_hierarchy": self.attribute_hierarchy(
                    (sub_all or {}).get("data", {}).get("attribute_metadata") or []
                ),
            },
            "brands": overall.get("brands", []),
            "base_n": overall.get("base_n", 0),
        }

    def attribute_hierarchy(
        self,
        metadata: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Main-attribute -> sub-attribute map for the drill-down.

        Built from the resolved sub-scatter metadata when available, since that
        has already been reconciled against the response data and therefore
        shares a key space with the main scatter. Falls back to the raw survey
        attribute registry when no scatter was produced.

        Flat attributes (sub == main, or no sub defined) report an empty
        `sub_attributes` list rather than echoing their own name.
        """
        if metadata:
            entries = metadata
        else:
            entries = [
                self._build_attribute_label(e.get("main_att", ""), e.get("supp_att", ""))
                for e in self.attribute_registry
            ]

        hierarchy: Dict[str, Dict[str, Any]] = {}
        for meta in entries:
            main_key = meta.get("main_key")
            if not main_key:
                continue
            node = hierarchy.setdefault(main_key, {
                "main_attribute": meta.get("main_attribute", ""),
                "main_key": main_key,
                "sub_attributes": [],
            })
            sub = meta.get("sub_attribute")
            if meta.get("is_distinct") and sub and sub not in node["sub_attributes"]:
                node["sub_attributes"].append(sub)
        return list(hierarchy.values())

    def importance_combined(self) -> List[Dict[str, Any]]:
        """
        [Advanced Phase] N-Slide Driver Analysis.
        Aggregates drill-down payloads for the Top-3 most important attributes.
        """
        overall = self.overall_scatter()
        if not overall or not overall.get("data"):
            return []

        sub_all = self.sub_attribute_scatter()
        top_attributes = overall["data"].get("top_attributes", [])
        
        results = []
        # Support N-Slide generation (Top 3 Drivers)
        for rank, drill_attribute in enumerate(top_attributes[:3]):
            target_norm = str(drill_attribute).lower().strip()
            filtered_sub_datasets = []
            drill_sub_labels = []
            
            if sub_all and "data" in sub_all:
                raw_sub_datasets = sub_all["data"].get("datasets", [])
                for dataset in raw_sub_datasets:
                    brand_points = dataset.get("data", [])
                    filtered_points = [
                        p for p in brand_points 
                        if str(p.get("main_attribute", "")).lower().strip() == target_norm
                    ]
                    if filtered_points:
                        filtered_sub_datasets.append({
                            "brand": dataset.get("brand"),
                            "data": filtered_points
                        })
                        for p in filtered_points:
                            label = p.get("sub_attribute")
                            if label and label not in drill_sub_labels:
                                drill_sub_labels.append(label)

            if not filtered_sub_datasets:
                continue

            results.append({
                "chart_id": f"importance_combined_{rank+1}",
                "chart_type": "importance_combined",
                "title": f"Importance: {drill_attribute}",
                "subtitle": f"Drill-down: Brand Performance on {drill_attribute} Drivers",
                "exclude_from_web": True,
                "data": {
                    "main_scatter": overall["data"],
                    "sub_scatter": {
                        "datasets": filtered_sub_datasets,
                        "drill_attribute": drill_attribute,
                        "top_attributes": sorted(drill_sub_labels)
                    }
                },
                "rank": rank + 1,
                "brands": overall.get("brands", sorted(self.brands)),
                "base_n": self.n,
                "section": "Criteria Analysis"
            })
        
        return results

    def _pi_t2b_by_brand(self) -> Dict[str, float]:
        """Shared purchase-intent T2B% map for charts, sigma, and opportunity engine."""
        return compute_pi_t2b_by_brand(self._purchase_intent_frame(), list(self.brands))

    def enhanced_sigma_intent_analysis(self) -> Dict[str, Any]:
        """
        [Phase 3] AI-Driven Synthesis: Sigma (Z-Score) vs Purchase Intent.
        Adds correlation modeling and automated strategic headlines.
        """
        df = self.data.scale_evaluations
        if df.empty:
            return {}

        intent_df = self._purchase_intent_frame()
        if intent_df.empty:
            return {}

        intent_t2b = self._pi_t2b_by_brand()

        # 2. Identify Main Attributes
        main_df = df[df["metric"].str.lower() == df["attribute"].str.lower()].copy()
        if main_df.empty:
            main_df = df.copy()

        attributes = sorted([a for a in main_df["attribute"].unique() if "general" not in str(a).lower()])
        if not attributes:
            return {}

        global_stats = main_df.groupby("attribute")["value"].agg(["mean", "std"]).to_dict('index')
        available_brands = sorted(self.brands)
        brand_means = main_df.groupby(["attribute", "brand"])["value"].mean()

        datasets_by_attribute = {}
        correlations = {} # attr -> correlation coeff
        headlines = {}    # attr -> automated_headline

        for attr in attributes:
            stats = global_stats.get(attr, {})
            mu_cat = stats.get("mean", 0)
            sigma_cat = stats.get("std", 1)
            if sigma_cat == 0 or pd.isna(sigma_cat): sigma_cat = 0.001 

            brand_data = []
            xs, ys = [], [] # For correlation calc
            for brand in available_brands:
                mean_b = brand_means.get((attr, brand), mu_cat)
                pi_b = intent_t2b.get(brand, 0)
                sigma_score = (mean_b - mu_cat) / sigma_cat
                
                point = {
                    "brand": brand,
                    "x": round(float(sigma_score), 3),
                    "y": round(float(pi_b), 1),
                    "raw_mean": round(float(mean_b), 2),
                    "n": int(self.brand_counts.get(brand, 0)),
                    "category_mean": round(float(mu_cat), 2),
                    "category_std": round(float(sigma_cat), 2)
                }
                brand_data.append(point)
                xs.append(sigma_score)
                ys.append(pi_b)
            
            # --- PHASE 3: CORRELATION MODELING ---
            # How much does this attribute's Sigma drive Category Intent?
            try:
                if len(xs) > 2 and np.std(xs) > 0 and np.std(ys) > 0:
                    corr = float(np.corrcoef(xs, ys)[0, 1])
                    correlations[attr] = round(corr, 2)
                else:
                    correlations[attr] = 0
            except:
                correlations[attr] = 0

            # --- PHASE 3: AUTO-HEADLINES (AI SYNTHESIS) ---
            attr_corr = correlations.get(attr, 0)
            my_sigma = next((p["x"] for p in brand_data if p["brand"] == self.my_brand), 0)
            
            if attr_corr > 0.7:
                drivers_text = f"Strong Primary Driver: {attr} has a critical impact on Purchase Intent."
            elif attr_corr > 0.4:
                drivers_text = f"Secondary Driver: {attr} shows moderate influence on purchase decisions."
            else:
                drivers_text = f"Engagement Metric: {attr} is a character builder but less predictive of intent."

            if my_sigma > 1.0:
                brand_status = f"{self.my_brand} is dominating in this category."
            elif my_sigma > 0:
                brand_status = f"{self.my_brand} is outperforming the market average."
            else:
                brand_status = f"{self.my_brand} has a significant performance gap to address."

            headlines[attr] = f"{drivers_text} {brand_status}"
            datasets_by_attribute[attr] = brand_data

        return {
            "chart_id": "sigma_intent",
            "chart_type": "sigma_intent_scatter",
            "title": "Interactive Analysis: Attribute Sigma vs Purchase Intent",
            "subtitle": "AI-Synthesized Performance Z-Scores vs Intent Correlation",
            "data": {
                "attributes": attributes,
                "datasets": datasets_by_attribute,
                "correlations": correlations,
                "headlines": headlines,
                "default_attribute": attributes[0] if attributes else None
            },
            "brands": available_brands,
            "base_n": self.n,
            "section": "Advanced Analytics"
        }

    def market_position_sigma(self) -> Dict[str, Any]:
        """
        [Task 1.1] Strategic Positioning Sigma: MOU, Demographics, and Geographics.
        Computes multi-dimensional Sigma DIFF (Z-Scores) and Chi-squared departures
        to detect market positioning and core audience affinity.
        """
        pf_df = self.data.purchase_funnel
        demo_df = self.data.demographics
        if pf_df.empty or demo_df.empty:
            return {}

        # 1. Dimension A: MOU (Market Share) Sigma
        mou_mask = pf_df["question"].isin(self._question_ids_for_stage("mou"))
        mou_df = pf_df[mou_mask].copy()
        if mou_df.empty:
            return {}

        # Explode if values are lists (multi-usage)
        mou_flat = []
        for _, row in mou_df.iterrows():
            val = row["value"]
            if isinstance(val, list):
                for v in val: mou_flat.append({"response_id": row["response_id"], "brand": v})
            elif isinstance(val, str):
                mou_flat.append({"response_id": row["response_id"], "brand": val})
        
        mou_flat_df = pd.DataFrame(mou_flat)
        if mou_flat_df.empty:
            return {}
            
        mou_counts = mou_flat_df["brand"].value_counts()
        total_mou_n = len(mou_flat_df)
        
        # Share stats for all brands to get Z-score baseline
        all_shares = [ (mou_counts.get(b, 0) / total_mou_n) * 100 for b in self.brands ]
        mu_share = np.mean(all_shares)
        sigma_share = np.std(all_shares) if np.std(all_shares) > 0 else 1.0

        # 2. Dimensions B & C: Demographics & Geographics (Chi-Squared Departure)
        # We define fields of interest. "location" is the Geographics dimension.
        target_fields = ["gender", "age", "sec_classes", "education", "family_income", "location"]
        # Remove fields not present in data
        available_fields = [f for f in target_fields if f in demo_df["field"].unique()]
        
        # Category-level distributions (Benchmark)
        benchmark_dists = {}
        for f in available_fields:
            dist = demo_df[demo_df["field"] == f]["value"].value_counts(normalize=True).to_dict()
            benchmark_dists[f] = dist

        # Map ResponseID -> MOU Brand for demographic correlation
        resp_to_mou = mou_flat_df.set_index("response_id")["brand"].to_dict()
        
        # Augment demo_df with MOU brand
        merged_demo = demo_df[demo_df["field"].isin(available_fields)].copy()
        merged_demo["mou_brand"] = merged_demo["response_id"].map(resp_to_mou)
        merged_demo = merged_demo.dropna(subset=["mou_brand"])

        brand_results = {}
        for brand in self.brands:
            brand_mou_n = int(mou_counts.get(brand, 0))
            if brand_mou_n < 5: continue # Stability threshold

            brand_subset = merged_demo[merged_demo["mou_brand"] == brand]
            
            # --- MOU Sigma ---
            share_b = (brand_mou_n / total_mou_n) * 100
            mou_sigma = (share_b - mu_share) / sigma_share

            # --- Demographic & Geographic Departures ---
            field_scores = {}
            affinities = {} # Detailed segments where brand over-indexes

            for f in available_fields:
                obs_dist = brand_subset[brand_subset["field"] == f]["value"].value_counts(normalize=True).to_dict()
                exp_dist = benchmark_dists[f]
                
                # Chi-squared departure: sum((obs - exp)^2 / exp)
                # This measures "tilt". 0 = matches category perfectly. High = niche/polarized.
                chi_dist = 0
                for segment, p_exp in exp_dist.items():
                    p_obs = obs_dist.get(segment, 0)
                    if p_exp > 0:
                        chi_dist += ((p_obs - p_exp)**2) / p_exp
                    
                    # Track Affinity (Ratio > 1.1 = over-index)
                    ratio = (p_obs / p_exp) if p_exp > 0 else 0
                    if ratio > 1.15: # Significant over-index
                        affinities[f"{f}:{segment}"] = round(float(ratio), 2)

                field_scores[f] = round(float(chi_dist), 4)

            # Split into Demo vs Geo
            geo_sigma = field_scores.get("location", 0) * 5 # Scale for visualization
            other_demos = [v for k,v in field_scores.items() if k != "location"]
            demo_sigma = np.mean(other_demos) * 5 if other_demos else 0

            brand_results[brand] = {
                "brand": brand,
                "n": brand_mou_n,
                "mou_share": round(float(share_b), 1),
                "sigmas": {
                    "mou": round(float(mou_sigma), 3),
                    "demographic": round(float(demo_sigma), 3),
                    "geographic": round(float(geo_sigma), 3)
                },
                "affinites": sorted(affinities.items(), key=lambda x: x[1], reverse=True)[:5],
                "is_target": (brand == self.my_brand)
            }

        # 3. Final Synthesis Package
        return {
            "chart_id": "market_position_sigma",
            "chart_type": "market_position_radar",
            "title": "Market Positioning Intelligence",
            "subtitle": "Sigma DIFF Analysis: MOU, Demographic Tilt, and Geographic Concentration",
            "data": {
                "brands": sorted(brand_results.keys()),
                "metrics": ["Market Presence (MOU)", "Audience Specialization (Demo)", "Geographic Focus (Geo)"],
                "results": brand_results,
                "target_brand_analysis": brand_results.get(self.my_brand, {}),
                "thresholds": { "high": 1.5, "medium": 0.5, "benchmark": 0 }
            },
            "brands": list(brand_results.keys()),
            "base_n": total_mou_n,
            "section": "Strategic Analysis"
        }

    def audience_affinity_index(self) -> Dict[str, Any]:
        """
        [Task 1.2] Audience Affinity Index (AAI) Calculator.
        Measures brand penetration in demographic segments compared to category average.
        Formula: AAI = (% of brand users in segment / % of total users in segment) * 100
        """
        demo_df = self.data.demographics
        pf_df = self.data.purchase_funnel
        if demo_df.empty or pf_df.empty:
            return {}

        # 1. Base Resolution: Use MOU Users as the 'Brand User' definition
        mou_ids = self._question_ids_for_stage("mou")
        mou_df = pf_df[pf_df["question"].isin(mou_ids)].copy()
        if mou_df.empty: return {}

        # Flatten MOU users
        mou_flat = []
        for _, row in mou_df.iterrows():
            val = row["value"]
            if isinstance(val, list):
                for v in val: mou_flat.append({"response_id": row["response_id"], "brand": v})
            elif isinstance(val, str):
                mou_flat.append({"response_id": row["response_id"], "brand": val})
        
        mou_flat_df = pd.DataFrame(mou_flat)
        if mou_flat_df.empty:
            return {}
        
        mou_counts = mou_flat_df["brand"].value_counts()
        total_mou_n = len(mou_flat_df)

        resp_to_mou = mou_flat_df.set_index("response_id")["brand"].to_dict()

        # 2. Demographic Field Resolution
        target_fields = ["gender", "age", "sec_classes", "education", "family_income", "location", "occupation", "marital_status"]
        available_fields = sorted([f for f in target_fields if f in demo_df["field"].unique()])
        if not available_fields: return {}

        # 3. Calculate Global Category Benchmarks (% of total users per segment)
        global_benchmarks = {} # field -> {segment: percentage}
        for f in available_fields:
            field_total = len(demo_df[demo_df["field"] == f])
            if field_total == 0: continue
            counts = demo_df[demo_df["field"] == f]["value"].value_counts().to_dict()
            global_benchmarks[f] = {seg: count / field_total for seg, count in counts.items()}

        # 4. Compute AAIs for each Brand and Field
        heatmap_data = [] # List of {field, segment, brand, aai, n_segment}
        brands_to_analyze = [self.my_brand] + [b for b in self.brands if b != self.my_brand]

        # Pre-filter demographic data with brand associations
        merged_demo = demo_df[demo_df["field"].isin(available_fields)].copy()
        merged_demo["brand"] = merged_demo["response_id"].map(resp_to_mou)
        
        field_segments_map = {} # field -> list of ordered segments

        for field in available_fields:
            benchmarks = global_benchmarks.get(field, {})
            segments = sorted(benchmarks.keys())
            field_segments_map[field] = segments
            
            for brand in brands_to_analyze:
                brand_n = int(mou_counts.get(brand, 0))
                if brand_n < 5: continue

                brand_subset = merged_demo[(merged_demo["field"] == field) & (merged_demo["brand"] == brand)]
                brand_field_n = len(brand_subset)
                if brand_field_n == 0: continue
                
                brand_dist = brand_subset["value"].value_counts(normalize=True).to_dict()

                for seg in segments:
                    p_exp = benchmarks.get(seg, 0)
                    p_obs = brand_dist.get(seg, 0)
                    
                    if p_exp > 0:
                        aai = (p_obs / p_exp) * 100
                    else:
                        aai = 0
                    
                    # Statistical stability flag
                    n_seg = len(brand_subset[brand_subset["value"] == seg])
                    
                    heatmap_data.append({
                        "field": field,
                        "segment": seg,
                        "brand": brand,
                        "aai": round(float(aai), 1),
                        "p_obs": round(float(p_obs * 100), 1),
                        "p_exp": round(float(p_exp * 100), 1),
                        "n_segment": n_seg,
                        "is_target": (brand == self.my_brand)
                    })

        # 5. Extract Core Audience for Target Brand
        target_affinities = [d for d in heatmap_data if d["brand"] == self.my_brand and d["aai"] > 110]
        target_affinities.sort(key=lambda x: x["aai"], reverse=True)

        return {
            "chart_id": "audience_affinity",
            "chart_type": "affinity_heatmap",
            "title": "Audience Affinity Index (AAI)",
            "subtitle": "Index > 100 indicates over-indexing vs category average population",
            "data": {
                "heatmap": heatmap_data,
                "fields": available_fields,
                "field_segments": field_segments_map,
                "brands": [b for b in brands_to_analyze if b in mou_counts],
                "core_audience": target_affinities[:8],
                "benchmarks": global_benchmarks,
            },
            "brands": self.brands,
            "base_n": total_mou_n,
            "section": "Strategic Analysis"
        }

    def competitive_position_matrix(self) -> Dict[str, Any]:
        """
        [Task 1.3] Competitive Position Matrix Builder.
        Maps brands on a 2D grid: 
          X-Axis: MOU Share Sigma (Market Momentum)
          Y-Axis: Composite Attribute Sigma (Performance Quality)
        """
        pf_df = self.data.purchase_funnel
        eval_df = self.data.scale_evaluations
        if pf_df.empty or eval_df.empty:
            return {}

        # 1. Component X: Market Momentum (MOU Sigma)
        mou_ids = self._question_ids_for_stage("mou")
        mou_df = pf_df[pf_df["question"].isin(mou_ids)].copy()
        if mou_df.empty: return {}

        mou_counts = [] # List of brand strings
        for val in mou_df["value"]:
            if isinstance(val, list): mou_counts.extend(val)
            elif isinstance(val, str): mou_counts.append(val)
        
        mou_series = pd.Series(mou_counts)
        brand_mou_counts = mou_series.value_counts()
        total_mou_n = len(mou_counts)
        if total_mou_n == 0:
            return {}
        
        shares = {b: (brand_mou_counts.get(b, 0) / total_mou_n) * 100 for b in self.brands}
        share_vals = list(shares.values())
        mu_share, sigma_share = np.mean(share_vals), np.std(share_vals)
        if sigma_share == 0: sigma_share = 1.0

        # 2. Component Y: Performance Quality (Composite Attribute Sigma)
        # Filter for main attributes (1-10 scale)
        main_df = eval_df[eval_df["metric"].str.lower() == eval_df["attribute"].str.lower()].copy()
        if main_df.empty: main_df = eval_df.copy()

        attributes = [a for a in main_df["attribute"].unique() if "general" not in str(a).lower()]
        if not attributes: return {}

        global_stats = main_df.groupby("attribute")["value"].agg(["mean", "std"]).to_dict("index")
        brand_means = main_df.groupby(["attribute", "brand"])["value"].mean()

        # 3. Build Vectorized Matrix
        points = []
        for brand in self.brands:
            brand_n = int(self.brand_counts.get(brand, 0))
            if brand_n < 5: continue

            # X-Coordinate
            x_sigma = (shares.get(brand, 0) - mu_share) / sigma_share

            # Y-Coordinate (Mean of Z-Scores across attributes)
            z_scores = []
            for attr in attributes:
                stats = global_stats.get(attr, {"mean": 0, "std": 1})
                b_mean = brand_means.get((attr, brand), stats["mean"])
                b_sigma = stats["std"] if stats["std"] > 0 else 0.1
                z_scores.append((b_mean - stats["mean"]) / b_sigma)
            
            y_sigma = np.mean(z_scores) if z_scores else 0

            # 4. Quadrant Classification
            quadrant = ""
            if x_sigma >= 0 and y_sigma >= 0: quadrant = "Leader"
            elif x_sigma < 0 and y_sigma >= 0: quadrant = "Niche/Premium"
            elif x_sigma >= 0 and y_sigma < 0: quadrant = "Mass Market/Functional"
            else: quadrant = "Follower"

            points.append({
                "label": brand,
                "brand": brand,
                "x": round(float(x_sigma), 3),
                "y": round(float(y_sigma), 3),
                "r": int(math.sqrt(brand_n) * 2), # Radius proportional to sample size
                "n": brand_n,
                "share_pct": round(float(shares.get(brand, 0)), 1),
                "quadrant": quadrant,
                "is_target": (brand == self.my_brand)
            })

        return {
            "chart_id": "competitive_position_matrix",
            "chart_type": "scatter_bubble",
            "title": "Competitive Positioning Matrix",
            "subtitle": "Market Momentum (MOU Share) vs Product Quality (Composite Performance Index)",
            "data": {
                "datasets": [{ "label": "Brands", "data": points }],
                "x_axis_label": "Market Momentum (Sigma DIFF)",
                "y_axis_label": "Product Quality (Sigma DIFF)",
                "quadrants": {
                    "top_right": "Leaders (Strong Presence + High Quality)",
                    "top_left": "Niche Players (Exclusive + High Quality)",
                    "bottom_right": "Mass Market (High Presence + Functional)",
                    "bottom_left": "Followers (Developing Presence + Functional)"
                }
            },
            "brands": self.brands,
            "base_n": self.n,
            "section": "Strategic Analysis"
        }

    def opportunity_signals(self) -> List[AttributeSignal]:
        """
        [Phase 2] Feature Engineering: Directional Gap Computation.
        
        This method computes the raw quantitative signals required for the 
        Opportunity-for-Improvement engine. It isolates the target brand's 
        performance against the market average with high precision.
        
        Logic:
        - Gap = (Target Brand Mean) - (Competitor Average)
        - Sigma = Standard Deviation of Target Brand scores (Inconsistency)
        - Intent = T2B% for Target Brand
        
        Critical Rule: A negative gap is the primary prerequisite for an opportunity.
        """
        import pandas as pd
        df = self.data.scale_evaluations
        if df.empty:
            return []

        pi_map = self._pi_t2b_by_brand()

        # 2. Isolate Main Attribute Metrics (excluding general/intent metrics)
        main_mask = df["metric"].str.lower() == df["attribute"].str.lower()
        attr_df = df[main_mask & (~df["attribute"].str.lower().str.contains("general", na=False))].copy()

        if attr_df.empty:
            pi_mask = purchase_intent_row_mask(df, question_map=self.data.question_map)
            attr_df = df[~pi_mask].copy()

        attributes = sorted(attr_df["attribute"].unique())
        
        # 3. Compute Metrics with Market Benchmarking
        signals = []
        for attr in attributes:
            sub = attr_df[attr_df["attribute"] == attr]
            
            # Target brand performance slice
            target_data = sub[sub["brand"] == self.my_brand]
            if target_data.empty:
                continue
                
            mu_target = float(target_data["value"].mean())
            sigma_target = float(target_data["value"].std())
            if pd.isna(sigma_target): sigma_target = 0.0
            
            n_target = int(self.brand_counts.get(self.my_brand, 0))
            pi_target = float(pi_map.get(self.my_brand, 0))
            
            # Market Average (Competitor Context)
            comp_data = sub[sub["brand"].isin(self.competitor_brands)]
            mu_market = float(comp_data["value"].mean()) if not comp_data.empty else mu_target
            
            # Directional Gap Calculation (Target - Market)
            # A negative value indicates we are underperforming the competition.
            gap = mu_target - mu_market
            
            signals.append(AttributeSignal(
                attribute=attr,
                mean_score=round(float(mu_target), 2),
                sigma=round(float(sigma_target), 3),
                gap_vs_market=round(float(gap), 3),
                purchase_intent_t2b=round(float(pi_target), 1),
                sample_n=n_target,
                metadata={"market_average": round(float(mu_market), 2)}
            ))

        logger.info(f"Generated {len(signals)} attribute signals for Opportunity Detection.")
        return signals

    # ──────────────────────────────────────────────────────────────────────
    #  14. Flow & Switching Dynamics
    # ──────────────────────────────────────────────────────────────────────

    def overall_switch(self) -> Dict[str, Any]:
        """Aggregate Bar: 'Most Often Used' vs 'Purchase Next' (Preference) per brand."""
        pf_df = self.data.purchase_funnel
        pref_df = self.data.preferences

        if pf_df.empty or pref_df.empty:
            return {}

        # Get MOU
        mou_df = pf_df[pf_df["question"].isin(self._question_ids_for_stage("mou"))].copy()
        if mou_df.empty:
            return {}

        # Build datasets
        datasets = []
        labels = []
        
        display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]

        mou_counts = mou_df["value"].value_counts()
        pref_counts = pref_df["preference"].value_counts()

        mou_data = []
        pref_data = []

        total_n = len(mou_df["response_id"].unique())

        for b in display_brands[:7]:
            labels.append(b)
            # Safe count for both string and list structures in MOU
            mou_c = 0
            for val, c in mou_counts.items():
                if isinstance(val, list) and b in val:
                    mou_c += c
                elif isinstance(val, str) and val == b:
                    mou_c += c
            
            mou_pct = round((mou_c / total_n) * 100, 1) if total_n > 0 else 0
            
            # Preference is usually string
            p_c = pref_counts.get(b, 0)
            p_pct = round((p_c / total_n) * 100, 1) if total_n > 0 else 0

            mou_data.append(mou_pct)
            pref_data.append(p_pct)

        if sum(mou_data) == 0:
            return {}

        datasets.append({"label": "Most Often Used %", "data": mou_data})
        datasets.append({"label": "Purchase Next %", "data": pref_data})

        return {
            "chart_id": "overall_switch",
            "chart_type": "grouped_bar",
            "title": "Brand Flow Summary",
            "subtitle": "Current Usage vs Future Intent",
            "data": {"labels": labels, "datasets": datasets},
            "brands": display_brands[:7],
            "base_n": total_n,
        }

    def switch_per_brand(self) -> Dict[str, Any]:
        """Grouped Bar: For each MOU brand, where is the Purchase Next intent going?"""
        pf_df = self.data.purchase_funnel
        pref_df = self.data.preferences

        if pf_df.empty or pref_df.empty:
            return {}

        mou_df = pf_df[pf_df["question"].isin(self._question_ids_for_stage("mou"))]
        if mou_df.empty:
            return {}

        # Merge MOU and Pref on response_id
        # Note: MOU values can be lists. We need to explode them if so.
        mou_flat = []
        for _, row in mou_df.iterrows():
            val = row["value"]
            if isinstance(val, list):
                for v in val:
                    mou_flat.append({"response_id": row["response_id"], "mou": v})
            elif isinstance(val, str):
                mou_flat.append({"response_id": row["response_id"], "mou": val})
                
        mou_flat_df = pd.DataFrame(mou_flat)
        if mou_flat_df.empty: return {}

        merged = pd.merge(mou_flat_df, pref_df, on="response_id", how="inner")
        if merged.empty: return {}

        funnel_master = self._resolve_master_brands_for_awareness()
        if funnel_master:
            if self.my_brand in funnel_master:
                display_brands = [self.my_brand] + [b for b in funnel_master if b != self.my_brand]
            else:
                display_brands = funnel_master
        else:
            display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]
        
        # X-Axis = MOU Brand. Legend = Purchase Next Brand
        datasets_map: Dict[str, List[float]] = {b: [] for b in display_brands}
        labels = []

        for mou_brand in display_brands[:5]: # Top 5 MOU brands
            subset = merged[merged["mou"] == mou_brand]
            total_mou = len(subset)
            if total_mou < 3: # Ignore if very small sample
                continue
                
            labels.append(mou_brand)
            for next_brand in display_brands:
                c = len(subset[subset["preference"] == next_brand])
                pct = round((c / total_mou) * 100, 1)
                datasets_map[next_brand].append(pct)

        # Remove brands from legend if they were never chosen
        datasets = []
        for next_brand, data in datasets_map.items():
            if sum(data) > 0:
                datasets.append({"label": f"Will buy {next_brand}", "data": data})

        if not labels or not datasets:
            return {}

        return {
            "chart_id": "switch_per_brand",
            "chart_type": "grouped_bar",
            "title": "Loyalty vs Defection",
            "subtitle": "Future intent grouped by current Most Often Used brand",
            "data": {"labels": labels, "datasets": datasets},
            "brands": display_brands,
            "base_n": len(merged["response_id"].unique()),
        }

    # ──────────────────────────────────────────────────────────────────────
    #  15. Demographic Cross-Tabs (Sub-Averages)
    # ──────────────────────────────────────────────────────────────────────

    def demographic_sub_averages(self) -> Dict[str, Any]:
        """Grouped Bar: Overall Product Rating broken down by a specific demographic field."""
        if not self.group_by:
            return {}
            
        df = self.data.scale_evaluations
        demo_df = self.data.demographics

        if df.empty or demo_df.empty:
            return {}

        general_df = df[df["attribute"] == "General"].copy()
        if general_df.empty:
            return {}

        # Merge with the selected demographic field
        demo_subset = demo_df[demo_df["field"] == self.group_by][["response_id", "value"]].rename(columns={"value": "demo_val"})
        merged = pd.merge(general_df, demo_subset, on="response_id", how="inner")
        
        if merged.empty:
            return {}

        # X-Axis will be the unique values of the demographic field
        # Limit to 10 unique labels max to prevent unreadable charts
        raw_labels = sorted([str(x) for x in merged["demo_val"].unique() if pd.notna(x)])
        labels = raw_labels[:10]
        
        display_brands = [self.my_brand] + [b for b in self.brands if b != self.my_brand]

        datasets = []
        for brand in display_brands[:5]:
            brand_df = merged[merged["brand"] == brand]
            data = []
            for label in labels:
                subset = brand_df[brand_df["demo_val"] == label]
                if not subset.empty:
                    data.append(round(float(pd.to_numeric(subset["value"], errors='coerce').mean()), 1))
                else:
                    data.append(0)
            if sum(data) > 0:
                datasets.append({"label": brand, "data": data})

        if not datasets:
            return {}

        human_field = self.group_by.replace('_auto', '').replace('calculated_', '').replace('_', ' ').title()

        return {
            "chart_id": "demographic_sub_averages",
            "chart_type": "grouped_bar",
            "title": f"Sub Averages: {human_field}",
            "subtitle": f"Overall Product Rating broken down by {human_field}",
            "data": {"labels": labels, "datasets": datasets},
            "brands": display_brands,
            "base_n": len(merged["response_id"].unique()),
        }

    # ──────────────────────────────────────────────────────────────────────
    #  Internal Helpers
    # ──────────────────────────────────────────────────────────────────────

    def _detect_top_competitor(self) -> Optional[str]:
        """Find the competitor brand with the highest overall mean score."""
        df = self.data.scale_evaluations
        if df.empty or not self.competitor_brands:
            return self.competitor_brands[0] if self.competitor_brands else None

        comp_df = df[df["brand"].isin(self.competitor_brands)]
        if comp_df.empty:
            return self.competitor_brands[0]

        brand_means = comp_df.groupby("brand")["value"].mean()
        return str(brand_means.idxmax()) if not brand_means.empty else self.competitor_brands[0]

    def _safe_ratio(self, numerator: float, denominator: float) -> float:
        """Denominator-safe ratio: returns 0 when denominator <= 0."""
        if denominator is None or denominator <= 0:
            return 0.0
        return float(numerator or 0.0) / float(denominator)

    def _resolve_master_brands_for_awareness(self) -> List[str]:
        """
        Phase-2 precedence:
          purchase funnel config explicitly > taste test config / discovered brands
        Use purchase_funnel_brands first; fallback to brand_master_list, then self.brands for safety.
        """
        funnel_explicit = self.data.purchase_funnel_brands or []
        primary = self.data.brand_master_list or []
        fallback = self.brands or []
        
        if funnel_explicit:
            source = funnel_explicit
        elif primary:
            source = primary
        else:
            source = fallback

        out: List[str] = []
        seen: Set[str] = set()
        for item in source:
            if not isinstance(item, str):
                continue
            clean = item.strip()
            if not clean:
                continue
            token = clean.casefold()
            if token in seen:
                continue
            seen.add(token)
            out.append(clean)
        return out

    def _coerce_answer_values(self, value: Any) -> List[str]:
        """Normalize raw answer value into a list of string mentions."""
        if value is None:
            return []
        if isinstance(value, str):
            v = value.strip()
            return [v] if v else []
        if isinstance(value, list):
            out: List[str] = []
            for item in value:
                if isinstance(item, str) and item.strip():
                    out.append(item.strip())
            return out
        return []

    def _canonicalize_mentions(
        self,
        mentions: List[str],
        alias_map: Dict[str, str],
        canonical_display: Dict[str, str],
    ) -> Set[str]:
        """
        Map mentions -> canonical brand names, but only keep brands in master list.
        """
        out: Set[str] = set()
        for mention in mentions:
            key = self._norm_brand_token(mention)
            if not key:
                continue

            # explicit alias mapping first, identity fallback second
            mapped = alias_map.get(key, mention)
            mapped_key = self._norm_brand_token(mapped)
            if not mapped_key:
                continue
            if mapped_key in canonical_display:
                out.add(canonical_display[mapped_key])
        return out

    def _norm_brand_token(self, value: Any) -> str:
        if not isinstance(value, str):
            return ""
        return value.strip().casefold()

    def _compute_significance(self, df: pd.DataFrame, use_metrics: bool = False) -> Dict[str, float]:
        """
        Compute significance of each attribute (or metric) via Pearson correlation
        with the 'Overall' rating.
        :param use_metrics: If True, calculates correlation for individual metrics instead of attributes.
        """
        sig: Dict[str, float] = {}
        target_col = "metric" if use_metrics else "attribute"

        # 1. Identify "Overall" Rating Column (Best-Effort Search)
        # Overall/General likeness is always the baseline for importance
        overall_markers = ["general", "overall", "global", "likeness", "total", "essence"]
        general_df = pd.DataFrame()
        found_overall = None

        # Search for overall rating in attributes (primary baseline)
        for marker in overall_markers:
            mask = df["attribute"].str.lower() == marker
            if mask.any():
                general_df = df[mask]
                found_overall = marker
                break

        if general_df.empty:
            # Secondary baseline: check metrics if attribute search failed
            for marker in overall_markers:
                mask = df["metric"].str.lower().str.contains(marker, na=False)
                if mask.any():
                    general_df = df[mask]
                    found_overall = marker
                    break

        if general_df.empty:
            # Final fallback: Use first attribute if none found
            available = df["attribute"].unique()
            if len(available) > 0:
                general_df = df[df["attribute"] == available[0]]
            else:
                return sig

        # Build pivot series for high-speed alignment
        # We handle potential duplicate entries by taking the mean per [id, brand]
        overall_series = general_df.groupby(["response_id", "brand"])["value"].mean()

        target_items = df[target_col].unique()
        for item in target_items:
            # Skip the baseline itself to avoid perfect 1.0 artifacting
            if found_overall:
                if use_metrics and found_overall in str(item).lower(): continue
                if not use_metrics and str(item).lower() == found_overall: continue

            item_df = df[df[target_col] == item]
            item_means = item_df.groupby(["response_id", "brand"])["value"].mean()

            # --- Robust Alignment Phase (Advanced Inner Join) ---
            # Using intersection for speed and inner-join logic
            common = overall_series.index.intersection(item_means.index)
            if len(common) < 3: 
                sig[item] = 0
                continue

            x = item_means.loc[common].values
            y = overall_series.loc[common].values

            try:
                # STATISTICAL DEFENSE: Check for zero-variance (straight-lining)
                # If N=10 all gave the same score, Pearson is undefined
                if np.all(x == x[0]) or np.all(y == y[0]):
                    sig[item] = 0.01 # Minimal non-zero impact indicator
                    continue
                    
                # Use numpy for high-performance correlation matrix
                corr = float(np.corrcoef(x, y)[0, 1])
                # We use absolute correlation as 'Importance' (both positive and negative impacts matter)
                sig[item] = abs(corr) if not pd.isna(corr) else 0
            except Exception:
                sig[item] = 0

        return sig

    # ──────────────────────────────────────────────────────────────────────
    #  7. Brand Analyzer (L7) Analytics
    # ──────────────────────────────────────────────────────────────────────

    def _get_ba_base_data(self) -> Optional[Dict[str, Any]]:
        """
        [INTERNAL] High-performance raw data extraction for Brand Analyzer.
        Optimized with NumPy int8 and minimal string parsing.
        """
        df = self.data.module_brand_analyzer
        if df.empty: return None

        p_df = df[df["question"] == "ba_q2_perception"]
        if p_df.empty: return None

        sample_val = p_df.iloc[0]["value"]
        if not isinstance(sample_val, dict): return None
        
        attributes = sorted(list(sample_val.keys()))
        brands = sorted(self.brands)
        brand_to_idx = {b: i for i, b in enumerate(brands)}
        
        respondents = df["response_id"].unique().tolist()
        resp_to_idx = {rid: i for i, rid in enumerate(respondents)}
        
        n_resps, n_brands, n_attrs = len(respondents), len(brands), len(attributes)

        # Build 3D int8 Scores Matrix
        scores_3d = np.zeros((n_resps, n_attrs, n_brands), dtype=np.int8)
        perception_data = df[df["question"] == "ba_q2_perception"]
        for _, row in perception_data.iterrows():
            rid, grid_val = row["response_id"], row["value"]
            if rid not in resp_to_idx: continue
            r_idx = resp_to_idx[rid]
            
            if isinstance(grid_val, dict):
                for a_idx, attr in enumerate(attributes):
                    checked = grid_val.get(attr, [])
                    if not isinstance(checked, list): checked = []
                    for b in checked:
                        if b in brand_to_idx:
                            scores_3d[r_idx, a_idx, brand_to_idx[b]] = 1

        return {
            "n_resps": n_resps,
            "n_brands": n_brands,
            "n_attrs": n_attrs,
            "attributes": attributes,
            "brands": brands,
            "scores_np": scores_3d,
            "resp_to_idx": resp_to_idx,
            "brand_to_idx": brand_to_idx
        }

    @cached_property
    def _ba_context(self) -> Optional[Dict[str, Any]]:
        """
        [PHASE 6] High-Performance Shared Computation Cache.
        """
        base = self._get_ba_base_data()
        if not base: return None

        calc = ba_calc
        n_resps, n_brands, n_attrs = base["n_resps"], base["n_brands"], base["n_attrs"]
        scores_3d = base["scores_np"]
        
        # Core Frequencies (Vectorized)
        freq_matrix = scores_3d.sum(axis=0).astype(np.float32)
        grand_total = freq_matrix.sum()
        if grand_total == 0: return None

        # Base Probability and Gaps
        p_attr = freq_matrix.sum(axis=1) / grand_total
        p_brand = freq_matrix.sum(axis=0) / grand_total
        expected = calc.get_expected_attribute_score(p_attr.tolist(), p_brand.tolist(), n_attrs, n_brands, grand_total)
        gap = calc.get_expected_attribute_share_from_check(freq_matrix.tolist(), expected, n_attrs, n_brands)
        normalized_gap = calc.get_normalize_expected_attribute_share(gap, n_attrs, n_brands)

        return {**base, "freq_matrix": freq_matrix, "gap": gap, "normalized_gap": normalized_gap}

    def prepare_ba_matrices(self) -> Optional[Dict[str, Any]]:
        """Legacy shim for backward compatibility."""
        ctx = self._ba_context
        if not ctx: return None
        return {
            **ctx,
            "scores_matrix": [[str(x) for x in row] for row in ctx["scores_np"].reshape(ctx["n_resps"], -1).tolist()],
            "scores_np": ctx["scores_np"].tolist(),
            "utility_matrix": np.ones((ctx["n_resps"], ctx["n_brands"])).tolist(),
            "awareness_matrix": np.zeros((ctx["n_resps"], ctx["n_brands"])).tolist(),
            "satisfaction_matrix": np.zeros((ctx["n_resps"], ctx["n_brands"])).tolist()
        }

    def brand_analyzer_cbi(self) -> Dict[str, Any]:
        """
        [PHASE 3] Final Output Computation: CBI (Composite Brand Index).
        Redesigned to utilize high-performance cached context.
        """
        ctx = self._ba_context
        if not ctx: return {}

        calc = ba_calc
        n_resps, n_brands, n_attrs = ctx["n_resps"], ctx["n_brands"], ctx["n_attrs"]
        
        # 1. Preference-based Utility (MOU rebasing)
        utility_matrix = np.ones((n_resps, n_brands), dtype=np.float32)
        mou_id = (self.data.stage_roles or {}).get("mou", "pf_q7")
        mou_data = self.data.purchase_funnel[self.data.purchase_funnel["question"] == mou_id]
        for _, row in mou_data.iterrows():
            rid, val = row["response_id"], row["value"]
            mentions = self._coerce_answer_values(val)
            for b in mentions:
                if rid in ctx["resp_to_idx"] and b in ctx["brand_to_idx"]:
                    utility_matrix[ctx["resp_to_idx"][rid], ctx["brand_to_idx"][b]] = 100.0

        # 2. Pearson Correlations
        ut_1d = calc.arr_one_d(utility_matrix.tolist(), n_resps, n_brands)
        scores_col_major = calc.arr_transform(ctx["scores_np"].reshape(n_resps, -1).tolist(), n_attrs, n_brands, n_resps)
        
        correlations = calc.corr_calc(scores_col_major, np.array(ut_1d), n_attrs, n_resps, n_brands)
        wt_t = calc.wt_t_calc(correlations, n_attrs, n_resps)

        # 3. Final CBI Formula
        freq_pct = (ctx["freq_matrix"] / n_resps) * 100
        cbi_scores = calc.calc_cbi(ctx["normalized_gap"], freq_pct.tolist(), wt_t, n_attrs, n_brands)

        # 4. JSON Payload construction
        dataset = []
        for i, b in enumerate(ctx["brands"]):
            val = round(cbi_scores[i], 1)
            # Apply Phase 7 Strategic Interpretation
            equity_status, action = calc.StrategicIntelligence.get_cbi_status(val)

            dataset.append({
                "label": b,
                "value": val,
                "status": equity_status,
                "strategic_action": action,
                "is_target": b == self.my_brand
            })

        dataset.sort(key=lambda x: (not x["is_target"], -x["value"]))

        return {
            "chart_id": "brand_analyzer_cbi",
            "chart_type": "bar_horizontal",
            "title": "Composite Brand Index (CBI)",
            "subtitle": "Relative brand equity based on association gaps and preference drivers",
            "data": {
                "labels": [d["label"] for d in dataset],
                "datasets": [{
                    "label": "CBI Score", 
                    "data": [d["value"] for d in dataset],
                    "status": [d["status"] for d in dataset]
                }],
                "benchmark": 100.0
            },
            "interpretation": {
                "top_performer": dataset[0]["label"],
                "target_equity": next((d["status"] for d in dataset if d["is_target"]), "N/A")
            },
            "base_n": n_resps
        }

    def brand_analyzer_perception(self, attr_filter: Optional[List[str]] = None, title_suffix: str = "") -> Dict[str, Any]:
        """
        [PHASE 3] Final Output Computation: Strategic Positioning Matrix (POP/POD).
        Utilizes cached context for extremely fast filtered analytics.
        """
        ctx = self._ba_context
        if not ctx: return {}

        calc = ba_calc
        n_resps = ctx["n_resps"]
        n_brands = ctx["n_brands"]
        n_attrs = ctx["n_attrs"]
        gap = np.array(ctx["gap"])

        # Apply filter if provided
        if attr_filter:
            attr_indices = [i for i, a in enumerate(ctx["attributes"]) if any(f.lower() in a.lower() for f in attr_filter)]
            if not attr_indices:
                return {}
            gap = gap[attr_indices, :]
            n_attrs = len(attr_indices)
            current_attributes = [ctx["attributes"][i] for i in attr_indices]
        else:
            current_attributes = ctx["attributes"]

        # 2. Call Enhanced Classification helper
        df_poppod = calc.pop_pod_str_unass(
            list(range(n_attrs)),
            list(range(n_brands)),
            gap.tolist(),
            current_attributes,
            ctx["brands"],
            n_attrs,
            n_brands
        )

        # Map to final chart response
        return {
            "chart_id": f"brand_analyzer_perception{title_suffix.lower().replace(' ', '_')}",
            "chart_type": "positioning_table",
            "title": f"Competitive Positioning Matrix {title_suffix}".strip(),
            "subtitle": "Classification of brand associations vs category expectations (Independence Model)",
            "data": {
                "columns": df_poppod.columns.tolist(),
                "rows": df_poppod.values.tolist()
            },
            "legend": {
                "POD": "Brand uniquely owns this attribute (Competitive Advantage)",
                "POP": "Industry table stakes; shared by multiple leaders",
                "Strong": "Notable association but not yet distinctive",
                "Unassoc": "Brand weakness or lack of awareness on this driver"
            },
            "base_n": n_resps,
            "display_context": "brand_analyzer_matrix"
        }

    def brand_analyzer_split_views(self) -> List[Dict[str, Any]]:
        """
        Generates split views for Brand Analyzer (Performance, Imagery).
        Used primarily for PPTX generation to ensure systematic slide coverage.
        """
        views = []
        
        # 1. Performance View
        perf = self.brand_analyzer_perception(
            attr_filter=["quality", "performance", "result", "benefit", "function", "value", "price"],
            title_suffix="(Performance)"
        )
        if perf:
            perf["exclude_from_web"] = True # Keep dashboard clean
            views.append(perf)

        # 2. Imagery View
        img = self.brand_analyzer_perception(
            attr_filter=["trust", "innovation", "friendly", "modern", "reliable", "expert", "care", "emotion", "personality"],
            title_suffix="(Imagery)"
        )
        if img:
            img["exclude_from_web"] = True # Keep dashboard clean
            views.append(img)

        return views

    @staticmethod
    def _norm_attr_key(label: str) -> str:
        """
        Canonical join key for attribute names.

        The main scatter labels its points from the dataframe's `attribute`
        column while the sub scatter labels `main_attribute` from the registry's
        `main_att`. Those two travel through different pipelines and drift in
        case, spacing and punctuation, which silently breaks the drill-down
        join. Normalizing both sides through here keeps them linkable.
        """
        if not label:
            return ""
        s = str(label).lower().strip()
        s = re.sub(r"[\s_\-/]+", " ", s)
        s = re.sub(r"[^\w\s]", "", s)
        return s.strip()

    @classmethod
    def _build_attribute_label(cls, main_label: str, supp_label: str) -> Dict[str, Any]:
        """
        Build the display metadata for one registry attribute.

        A registry entry whose sub-attribute equals (or is missing) its main
        attribute is a *flat* attribute — the survey never defined a real
        breakdown for it. Rendering those as "(Outershape - Outershape)" is
        noise, so they collapse to the single name and are flagged
        `is_distinct=False` so consumers can drop them from drill-downs.
        """
        main_label = (main_label or "").strip()
        supp_label = (supp_label or "").strip()

        main_key = cls._norm_attr_key(main_label)
        supp_key = cls._norm_attr_key(supp_label)

        is_distinct = bool(main_key and supp_key and main_key != supp_key)
        if is_distinct:
            display = f"({main_label} - {supp_label})"
        else:
            display = main_label or supp_label

        return {
            "display": display,
            "main_attribute": main_label or supp_label,
            "sub_attribute": supp_label or main_label,
            "main_key": main_key or supp_key,
            "sub_key": supp_key or main_key,
            "is_distinct": is_distinct,
        }

    def _norm_text(self, t: str) -> str:
        """
        Standard normalization helper to resolve placeholders like (Brand) and (Category)
        Allows matching registry entries to actual question texts.
        """
        if not t: return ""
        s = str(t).lower().strip()
        
        # 1. Resolve placeholders
        brand_name = (self.data.own_brand or "brand").lower().strip()
        category_name = (self.data.category or "category").lower().strip()
        s = s.replace("(brand)", brand_name).replace("(category)", category_name)
        s = s.replace("[brand]", brand_name).replace("{brand}", brand_name)
        
        # 2. Aggressive normalization: Strip the brand, category, and "product" boilerplate
        if brand_name: s = s.replace(brand_name, " ")
        if category_name: s = s.replace(category_name, " ")
        s = s.replace("product", " ")
        
        # 3. Punctuation and noise cleanup
        for char in ["?", ".", "!", "(", ")", "-", "_", "/", "'s"]:
            s = s.replace(char, " ")
        
        # Return words as a sorted string for stable comparison
        words = [w for w in s.split() if len(w) > 1]
        return " ".join(sorted(words))


# ──────────────────────────────────────────────────────────────────────────────
#  Stopwords for open-end processing
# ──────────────────────────────────────────────────────────────────────────────

_STOPWORDS = frozenset([
    "the", "and", "for", "that", "this", "with", "was", "are", "but",
    "not", "you", "all", "can", "has", "her", "his", "its", "may",
    "new", "now", "our", "out", "one", "two", "way", "who", "did",
    "get", "got", "had", "how", "its", "let", "say", "she", "too",
    "use", "very", "much", "like", "just", "also", "very", "really",
    "would", "could", "should", "about", "more", "some", "other",
])
