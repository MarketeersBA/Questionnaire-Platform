"""Phase 5 — end-to-end regression for ice cream brand comparison report fixes."""

from __future__ import annotations

from backend.analytics_module.aggregator import ReportAggregator
from backend.tests.analytics.fixtures.ice_cream_survey import (
    EXPECTED_OL_MEAN,
    EXPECTED_PI_T2B,
    ICE_CREAM_BASE_N,
    ICE_CREAM_BRANDS,
    ICE_CREAM_OWN_BRAND,
    build_ice_cream_survey_data,
)


class TestPhase5IceCreamBrandComparisonRegression:
    def test_brand_comparison_includes_both_brands_with_non_zero_pi(self):
        data = build_ice_cream_survey_data()
        chart = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).brand_comparison_pi_ol()

        assert chart["chart_id"] == "brand_comparison_pi_ol"
        assert chart["chart_type"] == "brand_comparison"
        assert chart["base_n"] == ICE_CREAM_BASE_N
        assert chart["data"]["labels"] == sorted(ICE_CREAM_BRANDS)

        pi_data = chart["data"]["datasets"][0]["data"]
        ol_data = chart["data"]["datasets"][1]["data"]

        assert len(pi_data) == 2
        assert all(v > 0 for v in pi_data), "PI must be non-zero for both brands"

        label_pi = dict(zip(chart["data"]["labels"], pi_data))
        label_ol = dict(zip(chart["data"]["labels"], ol_data))

        assert label_pi["Friday"] == EXPECTED_PI_T2B["Friday"]
        assert label_pi["Squizz"] == EXPECTED_PI_T2B["Squizz"]
        assert label_ol["Friday"] == EXPECTED_OL_MEAN["Friday"]
        assert label_ol["Squizz"] == EXPECTED_OL_MEAN["Squizz"]

    def test_purchase_intent_chart_produced_for_arabic_metrics(self):
        data = build_ice_cream_survey_data()
        chart = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).purchase_intent()

        assert chart["chart_id"] == "purchase_intent"
        assert set(chart["data"]["labels"]) == set(ICE_CREAM_BRANDS)
        values = chart["data"]["datasets"][0]["data"]
        assert len(values) == 2
        assert all(v > 0 for v in values)

    def test_pi_diagnostics_show_full_coverage(self):
        data = build_ice_cream_survey_data()
        chart = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).brand_comparison_pi_ol()
        diag = chart["data"]["metadata"]["pi_diagnostics"]

        assert diag["matched_row_count"] == ICE_CREAM_BASE_N * len(ICE_CREAM_BRANDS)
        assert set(diag["brands_with_pi"]) == set(ICE_CREAM_BRANDS)
        assert diag["brands_missing_pi"] == []

    def test_opportunity_signals_feed_strategic_intelligence_with_non_zero_pi(self):
        data = build_ice_cream_survey_data()
        signals = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).opportunity_signals()

        assert signals, "Opportunity engine requires attribute signals"
        assert all(s.purchase_intent_t2b > 0 for s in signals)
        assert signals[0].purchase_intent_t2b == EXPECTED_PI_T2B["Squizz"]

    def test_shared_pi_map_powers_downstream_analytics(self):
        data = build_ice_cream_survey_data()
        agg = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND)
        pi_map = agg._pi_t2b_by_brand()

        assert pi_map["Squizz"] == EXPECTED_PI_T2B["Squizz"]
        assert pi_map["Friday"] == EXPECTED_PI_T2B["Friday"]

    def test_likability_axis_metadata_matches_inferred_scale(self):
        data = build_ice_cream_survey_data()
        chart = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).brand_comparison_pi_ol()
        y_right = chart["data"]["metadata"]["y_axis_right"]

        assert y_right["unit"] == "1-7"
        assert y_right["domain"] == [1, 7]
        assert y_right["scale_max"] == 7

    def test_two_brand_insight_uses_pairwise_not_correlation(self):
        data = build_ice_cream_survey_data()
        chart = ReportAggregator(data, my_brand=ICE_CREAM_OWN_BRAND).brand_comparison_pi_ol()
        insight = chart.get("insight", "")

        assert "Strong Correlation" not in insight
        assert "Squizz" in insight
