"""
Shared project_inputs construction for the Streamlit UI and CLI (config JSON).

Call ``finalize_project_inputs`` on any dict shaped like ``project_inputs`` so
derived fields (sections, pivots, research_type branches, constants) match.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


def pivots_from_sections(sections: list[str] | None) -> dict[str, bool]:
    """Derive pivots_needed from selected sections. BA-PF pivot from combined section."""
    sections = sections or []
    return {
        "Comparison": "Taste Test" in sections,
        "Significance": False,
        "Brand Analyzer": "Brand Analyzer" in sections,
        "Brand Awareness and Purchase Funnel": "Brand Awareness and Purchase Funnel" in sections,
        "Habits": any("Habit" in s for s in sections),
    }


def default_purchase_intent_scales() -> dict[str, int]:
    """Default scale labels -> numeric for pipeline."""
    return {
        "Definitely would NOT buy": 1,
        "Probably would NOT buy": 2,
        "Neutral": 3,
        "Probably would buy": 4,
        "Definitely would buy": 5,
    }


def finalize_project_inputs(project_inputs: dict[str, Any]) -> dict[str, Any]:
    """
    Apply derived fields and fixed constants. Copies the input so callers keep
    their original dict unchanged.
    """
    inputs = deepcopy(project_inputs)

    sections_raw = list(inputs.get("sections") or [])
    sections = list(sections_raw)
    if "Brand Awareness and Purchase Funnel" in sections and "Brand Cards" not in sections:
        sections.append("Brand Cards")
    inputs["sections"] = sections

    if "Product Placement" in sections:
        derived_research_type = "ProductPlacement"
    elif "Taste Test" in sections:
        derived_research_type = "TasteTest"
    else:
        derived_research_type = inputs.get("research_type")

    inputs["research_type"] = derived_research_type

    if not inputs.get("pivots_needed"):
        inputs["pivots_needed"] = pivots_from_sections(sections_raw)

    if "Brand Awareness and Purchase Funnel" in sections_raw:
        ba_pf = list(inputs.get("ba_pf_brands") or [])
        if ba_pf:
             inputs["focus_brands"] = ba_pf
        else:
             inputs["focus_brands"] = list(inputs.get("focus_brands") or [])
    else:
        inputs["focus_brands"] = list(inputs.get("focus_brands") or [])

    scales = inputs.get("purchase_intent_scales")
    if not scales:
        inputs["purchase_intent_scales"] = default_purchase_intent_scales()

    inputs.setdefault("ideal_is_3", 3)
    inputs["response_id"] = "sys_RespNum"

    rt = inputs.get("research_type")
    
    # Ensure both mapping keys are available regardless of research type to prevent KeyErrors in engine
    if "comparators_map" not in inputs or inputs["comparators_map"] is None:
        inputs["comparators_map"] = {}
    if "suffix_map" not in inputs or inputs["suffix_map"] is None:
        inputs["suffix_map"] = {}

    if rt == "TasteTest":
        inputs["ideal_is_3"] = inputs.get("ideal_is_3", 3)
        inputs["rescale_5_to_10"] = list(inputs.get("rescale_5_to_10") or [])
        inputs["competitor1"] = inputs.get("competitor1")
        inputs["comparator_symbol_column"] = inputs.get("comparator_symbol_column")
        inputs["all_comparison_columns"] = list(inputs.get("all_comparison_columns") or [])
    elif rt == "ProductPlacement":
        inputs["ideal_is_3"] = inputs.get("ideal_is_3", 3)
        inputs["rescale_5_to_10"] = list(inputs.get("rescale_5_to_10") or [])
        inputs["competitor1"] = inputs.get("competitor1")
        inputs["all_comparison_columns"] = list(inputs.get("all_comparison_columns") or [])
    else:
        inputs["rescale_5_to_10"] = list(inputs.get("rescale_5_to_10") or [])
        inputs["competitor1"] = inputs.get("competitor1") or None
        inputs["all_comparison_columns"] = list(inputs.get("all_comparison_columns") or [])

    mb = inputs.get("my_brands")
    if mb:
        inputs["my_brand"] = mb if isinstance(mb, str) else (mb[0] if mb else None)

    perf = inputs.get("performance")
    if isinstance(perf, list) and len(perf) == 1:
        inputs["performance"] = perf[0]
    img = inputs.get("imagery")
    if isinstance(img, list) and len(img) == 1:
        inputs["imagery"] = img[0]

    return inputs


def build_project_inputs_from_form(form: dict[str, Any]) -> dict[str, Any]:
    """Map UI form keys to a project_inputs dict, then apply ``finalize_project_inputs``."""
    rough = {
        "project_name": form.get("project_name") or "Project",
        "output_dir": form.get("output_dir") or "./out",
        "dataset_path": form.get("dataset_path") or "",
        "study_print_path": form.get("study_print_path") or "",
        "unaided_json_path": form.get("unaided_json_path") or None,
        "handle_unaided_with_ai": form.get("handle_unaided_with_ai", False),
        "w_insights": form.get("w_insights", False),
        "w_recommendations": form.get("w_recommendations", False),
        "screening_cols": form.get("screening_cols") or [],
        "sections": list(form.get("sections") or []),
        "pivots_needed": form.get("pivots_needed"),
        "my_brand": form.get("my_brand") or None,
        "brands_list": form.get("brands_list") or None,
        "ba_pf_brands": form.get("ba_pf_brands") or [],
        "tom": form.get("tom") or None,
        "unaided": form.get("unaided") or None,
        "aided": form.get("aided") or None,
        "consideration": form.get("consideration") or None,
        "trial": form.get("trial") or None,
        "repurchase": form.get("repurchase") or None,
        "mou": form.get("mou") or None,
        "source_of_awareness": form.get("source_of_awareness") or None,
        "usage_place": form.get("usage_place") or None,
        "usage_frequency": form.get("usage_frequency") or None,
        "purchase_place": form.get("purchase_place") or None,
        "purchase_frequency": form.get("purchase_frequency") or None,
        "budget": form.get("budget") or None,
        "stocking_behavior": form.get("stocking_behavior") or None,
        "usage_purpose": form.get("usage_purpose") or None,
        "usage_occasions": form.get("usage_occasions") or None,
        "daily_usage_time": form.get("daily_usage_time") or None,
        "barriers": form.get("barriers") or None,
        "drivers": form.get("drivers") or None,
        "habits_and_opinions": form.get("habits_and_opinions") or [],
        "performance": form.get("performance"),
        "imagery": form.get("imagery"),
        "loop_purchase_intent": form.get("loop_purchase_intent") or None,
        "brand_analyzer_brands": form.get("brand_analyzer_brands") or [],
        "ct-inputs": form.get("ct_inputs") or {"metrics": [], "groups": []},
        "focus_brands": form.get("focus_brands") or [],
        "loop_why_mou": form.get("loop_why_mou") or None,
        "improvement_in_taste": form.get("improvement_in_taste") or None,
        "dislike_in_taste": form.get("dislike_in_taste") or None,
        "like_in_taste": form.get("like_in_taste") or None,
        "open_end_send_to_api": form.get("open_end_send_to_api", True),
        "research_type": form.get("research_type"),
        "comparator_symbol_column": form.get("comparator_symbol_column") or None,
        "suffix_map": form.get("suffix_map") or {},
        "comparators_map": form.get("comparators_map") or {},
        "product_preference": form.get("product_preference") or None,
        "real_price_pi": form.get("real_price_pi") or None,
        "ideal_is_3": 3,
        "sub_features": form.get("sub_features") or [],
        "overall_features": form.get("overall_features") or [],
        "feature_map": form.get("feature_map") or {},
        "comparison_purchase_intent": form.get("comparison_purchase_intent") or None,
        "purchase_intent_scales": form.get("purchase_intent_scales"),
        "comparators": form.get("comparators") or [],
        "Recommend": form.get("Recommend") or None,
        "all_comparison_columns": form.get("all_comparison_columns") or [],
        "rescale_5_to_10": form.get("rescale_5_to_10"),
        "competitor1": form.get("competitor1"),
        "my_brands": form.get("my_brands"),
    }
    return finalize_project_inputs(rough)
