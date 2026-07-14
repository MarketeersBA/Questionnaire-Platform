from __future__ import annotations

from typing import Any, Dict, List

from .presentation_planner import PresentationPlanner

PROTEIN_BAR_SURVEY_ID = "69ce229eeed39ea9d5282afa"

SCREEN_CHART_TYPE_TO_REGISTRY: Dict[str, str] = {
    "criteria_table": "criteria_table",
    "profile_chart": "profile_chart",
    "likeness_profile": "likeness_profile",
    "scatter_plot": "scatter_plot",
    "sigma_intent_scatter": "sigma_intent",
    "market_position_radar": "market_position_radar",
    "affinity_heatmap": "affinity_heatmap",
    "scatter_bubble": "scatter_bubble",
    "stacked_bar": "stacked_bar",
    "brand_comparison": "brand_comparison",
    "horizontal_bar": "brand_awareness",
    "snake_line": "purchase_funnel",
    "funnel_ratio_cards": "purchase_funnel_ratio_cards",
    "reference_table": "reference_table",
    "gauge": "nps_recommend",
    "scorecard": "scorecard",
    "wordcloud": "wordcloud",
}

CHART_ID_REGISTRY_OVERRIDES: Dict[str, str] = {
    "brand_awareness": "brand_awareness",
    "brand_profile_snake": "profile_chart",
    "importance_combined": "importance_combined",
    "purchase_funnel": "purchase_funnel",
    "sigma_intent": "sigma_intent",
    "market_position_sigma": "market_position_radar",
    "audience_affinity": "affinity_heatmap",
    "competitive_position_matrix": "scatter_bubble",
    "purchase_intent": "stacked_bar",
    "brand_comparison_pi_ol": "brand_comparison",
    "purchase_funnel_ratio_cards": "purchase_funnel_ratio_cards",
    "purchase_funnel_reference_table": "reference_table",
    "nps_recommend": "nps_recommend",
    "brand_card_abu_auf": "scorecard",
    "brand_card_haj_arfaa": "scorecard",
    "brand_card_cadbury": "scorecard",
    "open_end_likes": "wordcloud",
    "open_end_dislikes": "wordcloud",
    "open_end_improvements": "wordcloud",
}

SHAPE_NATIVE_REGISTRY_KEYS = {
    "criteria_table",
    "reference_table",
    "purchase_funnel_reference_table",
    "funnel_reference_table",
    "table",
    "affinity_heatmap",
    "scorecard",
    "brand_summary",
    "wordcloud",
    "verbatim_cloud",
    "open_end_likes",
    "open_end_dislikes",
    "open_end_improvements",
    "verbatim_analysis",
    "verbatim_summary",
    "qualitative_analysis",
    "funnel_ratio_cards",
    "funnel_cards",
    "purchase_funnel_ratio_cards",
}


def expected_registry_key(chart: Dict[str, Any]) -> str:
    chart_id = str(chart.get("chart_id") or "")
    chart_type = str(chart.get("chart_type") or "table")
    if chart_id in CHART_ID_REGISTRY_OVERRIDES:
        return CHART_ID_REGISTRY_OVERRIDES[chart_id]
    return SCREEN_CHART_TYPE_TO_REGISTRY.get(chart_type, chart_type)


def build_chart_fidelity_matrix(report_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    ordered = PresentationPlanner.order_charts(report_doc.get("charts", []) or [])
    for index, chart in enumerate(ordered):
        if not isinstance(chart, dict):
            continue
        chart_id = str(chart.get("chart_id") or f"chart_{index + 1}")
        chart_type = str(chart.get("chart_type") or "table")
        registry_key = expected_registry_key(chart)
        rows.append(
            {
                "order_index": index,
                "chart_id": chart_id,
                "chart_type": chart_type,
                "title": chart.get("title"),
                "expected_registry_key": registry_key,
                "shape_native": registry_key in SHAPE_NATIVE_REGISTRY_KEYS,
                "group": PresentationPlanner.resolve_chart_group_name(chart),
                "has_ai_headline": bool(chart.get("ai_headline") or chart.get("insight_headline")),
                "has_ai_deep_analysis": bool(chart.get("ai_deep_analysis")),
            }
        )
    return rows
