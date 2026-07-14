from backend.analytics_module.aggregator import ReportAggregator


def _chart(chart_id: str) -> dict:
    return {"chart_id": chart_id, "chart_type": "grouped_bar", "title": chart_id, "data": {"labels": ["A"], "datasets": [{"label": "S", "data": [1]}]}}


def test_compute_all_extends_list_output_for_importance_combined():
    aggregator = ReportAggregator.__new__(ReportAggregator)
    aggregator.research_type = "standard"
    aggregator.brands = ["A", "B"]

    aggregator.criteria_table = lambda: _chart("criteria_table")
    aggregator.brand_profile_analytics = lambda: _chart("brand_profile_snake")
    aggregator.likeness_profile_chart = lambda: _chart("likeness_profile_chart")
    aggregator.sub_attribute_scatter = lambda: _chart("sub_attribute_scatter")
    aggregator.overall_scatter = lambda: _chart("overall_scatter")
    aggregator.importance_combined = lambda: [
        {
            "chart_id": "importance_combined_1",
            "chart_type": "importance_combined",
            "title": "Importance: Taste",
            "exclude_from_web": True,
            "data": {"main_scatter": {"datasets": []}, "sub_scatter": {"datasets": []}},
        }
    ]
    aggregator.product_preference = lambda: _chart("product_preference")
    aggregator.overall_averages = lambda: _chart("overall_averages")
    aggregator.demographic_sub_averages = lambda: _chart("demographic_sub_averages")
    aggregator.purchase_funnel_chart = lambda: _chart("purchase_funnel")
    aggregator.overall_switch = lambda: _chart("overall_switch")
    aggregator.switch_per_brand = lambda: _chart("switch_per_brand")
    aggregator.attribute_radar = lambda: _chart("attribute_radar")
    aggregator.enhanced_sigma_intent_analysis = lambda: _chart("sigma_intent")
    aggregator.market_position_sigma = lambda: _chart("market_position_sigma")
    aggregator.audience_affinity_index = lambda: _chart("audience_affinity")
    aggregator.competitive_position_matrix = lambda: _chart("competitive_position_matrix")
    aggregator.purchase_intent = lambda: _chart("purchase_intent")
    aggregator.brand_awareness_stacked = lambda: _chart("brand_awareness")
    aggregator.brand_analyzer_cbi = lambda: _chart("brand_analyzer_cbi")
    aggregator.brand_analyzer_perception = lambda: _chart("brand_analyzer_perception")
    aggregator.brand_analyzer_split_views = lambda: _chart("brand_analyzer_views")
    aggregator.purchase_funnel_ratio_cards = lambda: _chart("purchase_funnel_ratio_cards")
    aggregator.purchase_funnel_reference_table = lambda: _chart("purchase_funnel_reference_table")
    aggregator.nps_recommend = lambda: _chart("nps_recommend")
    aggregator.price_sensitivity = lambda: _chart("price_sensitivity")
    aggregator.brand_comparison_pi_ol = lambda: _chart("brand_comparison_pi_ol")
    aggregator.brand_cards = lambda: []
    aggregator.open_end_clouds = lambda: []

    charts = aggregator.compute_all()
    ids = [chart["chart_id"] for chart in charts]
    assert "importance_combined_1" in ids
    importance = next(chart for chart in charts if chart["chart_id"] == "importance_combined_1")
    assert importance.get("exclude_from_web") is True

