import logging
import pandas as pd
from typing import Dict, Any, List, Optional
from backend.analytics_module.src.MySlides.base import DynamicSlideConcept
from backend.analytics_module.src.MySlides.registry import register_slide

logger = logging.getLogger(__name__)

@register_slide(section="Evaluation")
@register_slide(section="Executive Summary")
@register_slide(section="Brand Analysis")
@register_slide(section="Brand Cards")
class CriteriaTableSlide(DynamicSlideConcept):
    """
    Implements a comparative criteria table showing significance and T2B performance.
    """
    def __init__(self):
        super().__init__(
            slide_id="slide_criteria_table",
            section="Evaluation",
            template_slide_title="Evaluation Criteria Overview"
        )

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["my_brand"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand")

    def process(
        self,
        data_store,
        meta_data,
        meta_grids,
        codebook_df,
        project_inputs: dict,
        **kwargs
    ) -> Dict[str, Any]:
        matrix = data_store.computed_metrics.get("comparative_matrix", {})
        if not matrix:
            logger.warning("CriteriaTableSlide: comparative_matrix missing from data_store")
            return {}
        
        # Identify top competitor by average T2B performance
        t2b_raw = matrix.get("t2b", {})
        brands = matrix.get("brands", [])
        
        comp_brands = [b for b in brands if b != self.my_brand]
        if not comp_brands:
            return {}
            
        # Calculate mean T2B per brand to find the 'leader'
        t2b_means = {b: sum(t2b_raw.get(b, {}).values()) / max(len(t2b_raw.get(b, {})), 1) for b in comp_brands}
        top_comp = max(t2b_means, key=t2b_means.get)
        
        importance = data_store.computed_metrics.get("importance_scores", {})
        attributes = matrix.get("attributes", [])
        
        table_rows = []
        for attr in attributes:
            our_val = t2b_raw.get(self.my_brand, {}).get(attr, 0)
            comp_val = t2b_raw.get(top_comp, {}).get(attr, 0)
            sig = importance.get(attr, 0)
            
            table_rows.append({
                "criteria_name": attr,
                "significance": round(sig, 2),
                "our_brand_t2b": round(our_val, 1),
                "competitor_t2b": round(comp_val, 1),
                "diff": round(our_val - comp_val, 1)
            })
            
        # Sort by significance to show the most important drivers first
        sorted_rows = sorted(table_rows, key=lambda x: x["significance"], reverse=True)
            
        return {
            "overall": {
                "title": "Criteria Analysis — Overall",
                "rows": sorted_rows,
                "competitor_name": top_comp,
                "chart_type": "table",
                "brands": [self.my_brand, top_comp]
            }
        }

    def populate(self, pres, instance_key, payload, **kwargs) -> None:
        """Logic to fill PPTX table would go here."""
        pass


@register_slide(section="Evaluation")
@register_slide(section="Executive Summary")
@register_slide(section="Brand Analysis")
@register_slide(section="Brand Cards")
class PreferenceComparisonSlide(DynamicSlideConcept):
    """
    Implements a 2-bar chart comparing preference Top-2-Box across primary brands.
    """
    def __init__(self):
        super().__init__(
            slide_id="slide_preference_comp",
            section="Evaluation",
            template_slide_title="Overall Preference"
        )

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["my_brand"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand")

    def process(self, data_store, project_inputs, **kwargs) -> Dict[str, Any]:
        # We look for a 'preference' or 'likability' metric in computed_metrics or raw_answers
        # For simplicity, we use the average of all evaluation T2B as a proxy if explicit preference is missing
        matrix = data_store.computed_metrics.get("comparative_matrix", {})
        if not matrix: return {}

        brands = matrix.get("brands", [])
        comp_brands = [b for b in brands if b != self.my_brand]
        if not comp_brands: return {}

        # Top competitor detected by overall T2B
        t2b_raw = matrix.get("t2b", {})
        t2b_means = {b: sum(t2b_raw.get(b, {}).values()) / max(len(t2b_raw.get(b, {})), 1) for b in comp_brands}
        top_comp = max(t2b_means, key=t2b_means.get)

        our_perf = t2b_means.get(self.my_brand, 0)
        comp_perf = t2b_means.get(top_comp, 0)

        # Base N from project metadata or metrics table
        base_n = project_inputs.get("respondent_count", 0)

        return {
            "preference": {
                "title": "Product Preference",
                "chart_type": "horizontal_bar",
                "data": [
                    {"label": self.my_brand, "value": round(our_perf, 1)},
                    {"label": top_comp, "value": round(comp_perf, 1)}
                ],
                "footnote": f"Sample Size: N={base_n}",
                "brands": [self.my_brand, top_comp]
            }
        }

    def populate(self, pres, instance_key, payload, **kwargs) -> None:
        pass


@register_slide(section="Evaluation")
@register_slide(section="Brand Analysis")
@register_slide(section="Brand Cards")
class AveragesComparisonSlide(DynamicSlideConcept):
    """
    Implements a grouped bar chart for mean scores across all evaluation attributes.
    """
    def __init__(self):
        super().__init__(
            slide_id="slide_averages_comp",
            section="Evaluation",
            template_slide_title="Overall Averages"
        )

    @classmethod
    def required_input_keys(cls) -> List[str]:
        return ["my_brand"]

    def load_inputs(self, project_inputs: dict) -> None:
        self.my_brand = project_inputs.get("my_brand")

    def process(self, data_store, **kwargs) -> Dict[str, Any]:
        matrix = data_store.computed_metrics.get("comparative_matrix", {})
        if not matrix: return {}

        means_raw = matrix.get("means", {})
        brands = matrix.get("brands", [])
        comp_brands = [b for b in brands if b != self.my_brand]
        if not comp_brands: return {}

        t2b_raw = matrix.get("t2b", {})
        t2b_means = {b: sum(t2b_raw.get(b, {}).values()) / max(len(t2b_raw.get(b, {})), 1) for b in comp_brands}
        top_comp = max(t2b_means, key=t2b_means.get)

        attributes = matrix.get("attributes", [])
        
        # Prepare grouped data for grouped_bar
        chart_data = []
        for attr in attributes:
            chart_data.append({
                "attribute": attr,
                self.my_brand: round(means_raw.get(self.my_brand, {}).get(attr, 0), 2),
                top_comp: round(means_raw.get(top_comp, {}).get(attr, 0), 2)
            })

        return {
            "averages": {
                "title": "Overall Averages — Attributes",
                "chart_type": "grouped_bar",
                "data": chart_data,
                "brands": [self.my_brand, top_comp]
            }
        }

    def populate(self, pres, instance_key, payload, **kwargs) -> None:
        pass
