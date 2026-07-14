import pytest
from backend.analytics_module.pptx_builder.presentation_planner import PresentationPlanner, SlideType
from backend.analytics_module.pptx_builder.chart_resolver import PPTXChartResolver
from backend.tests.analytics.pptx_acceptance_contract import build_representative_screen_report


@pytest.fixture
def sample_report():
    return {
        "project_name": "Test Project",
        "brand": "Test Brand",
        "charts": [
            {"chart_id": "brand_awareness", "chart_type": "horizontal_bar", "title": "Awareness"},
            {"chart_id": "purchase_intent", "chart_type": "stacked_bar", "title": "Intent"},
            {"chart_id": "market_position_sigma", "chart_type": "radar", "title": "Sigma"},
            {"chart_id": "audience_affinity", "chart_type": "affinity_heatmap", "title": "Affinity"},
        ],
        "metadata": {
            "title": "Test Title",
            "brand": "Test Brand",
            "brands": ["Brand A", "Brand B"],
        },
        "insights": {
            "executive_summary": "Summary text",
            "brand_swot": {"Brand A": {"strengths": ["S1"]}},
        },
    }


def test_define_slide_intents_order(sample_report):
    intents = PresentationPlanner.define_slide_intents(sample_report)
    intent_types = [i.type for i in intents]

    assert intent_types[0] == SlideType.COVER
    assert SlideType.SURVEY_OVERVIEW in intent_types
    assert SlideType.EXECUTIVE_SUMMARY in intent_types
    assert SlideType.CLOSING in intent_types
    assert SlideType.SECTION_DIVIDER in intent_types


def test_strategic_isolation(sample_report):
    intents = PresentationPlanner.define_slide_intents(sample_report)
    strategic_slides = [i for i in intents if i.type == SlideType.STRATEGIC_INTELLIGENCE]
    assert len(strategic_slides) > 0

    strat_charts = strategic_slides[0].data.get("charts", [])
    strat_ids = [c["chart_id"] for c in strat_charts]
    assert "market_position_sigma" in strat_ids
    assert "audience_affinity" in strat_ids


def test_grouping_logic(sample_report):
    intents = PresentationPlanner.define_slide_intents(sample_report)
    divider_intents = [i for i in intents if i.type == SlideType.SECTION_DIVIDER]
    titles = [i.title for i in divider_intents if i.title]
    assert any("Purchase Funnel" in t for t in titles)


def test_content_slide_count_matches_supported_charts_in_simple_flow():
    resolver = PPTXChartResolver()
    report = {
        "charts": [
            {"chart_id": "c1", "chart_type": "horizontal_bar", "title": "Chart 1", "data": {"labels": ["A"], "datasets": [{"label": "S", "data": [1]}]}},
            {"chart_id": "c2", "chart_type": "grouped_bar", "title": "Chart 2", "data": {"labels": ["A"], "datasets": [{"label": "S", "data": [1]}]}},
            {"chart_id": "c3", "chart_type": "scatter_plot", "title": "Chart 3", "data": {"datasets": [{"label": "S", "data": [{"x": 1, "y": 2}]}]}},
        ],
        "metadata": {"title": "Test"},
        "insights": {},
    }
    intents = PresentationPlanner.define_slide_intents(report)
    content_intents = [intent for intent in intents if intent.type == SlideType.CONTENT_SLIDE]
    supported_chart_count = sum(1 for chart in report["charts"] if resolver.is_supported(chart))

    assert len(content_intents) == supported_chart_count


def test_planner_parity_between_report_charts_and_slide_intents():
    report = build_representative_screen_report()
    intents = PresentationPlanner.define_slide_intents(report)
    resolver = PPTXChartResolver()

    report_chart_ids = {
        str(chart["chart_id"])
        for chart in report.get("charts", [])
        if isinstance(chart, dict) and chart.get("chart_id")
    }
    planned_chart_ids = set()
    for intent in intents:
        if intent.type == SlideType.CONTENT_SLIDE:
            chart_id = (intent.data or {}).get("chart_id")
            if chart_id:
                planned_chart_ids.add(str(chart_id))
        elif intent.type == SlideType.STRATEGIC_INTELLIGENCE:
            for chart in (intent.data or {}).get("charts", []):
                if isinstance(chart, dict) and chart.get("chart_id"):
                    planned_chart_ids.add(str(chart["chart_id"]))

    assert planned_chart_ids
    assert planned_chart_ids.issubset(report_chart_ids)

    insights = report.get("insights", {})
    intent_types = {intent.type for intent in intents}
    if insights.get("executive_summary"):
        assert SlideType.EXECUTIVE_SUMMARY in intent_types
    if insights.get("brand_swot"):
        assert SlideType.SWOT in intent_types
    if insights.get("recommendations_4p"):
        assert SlideType.RECOMMENDATIONS_4P in intent_types
    if insights.get("opportunity_insights"):
        assert SlideType.STRATEGIC_NARRATIVE in intent_types


def test_sigma_intent_emits_fallback_content_slide_when_attributes_missing():
    report = {
        "charts": [
            {
                "chart_id": "sigma_intent",
                "chart_type": "sigma_intent_scatter",
                "title": "Interactive Analysis: Attribute Sigma vs Purchase Intent",
                "data": {
                    "attributes": [],
                    "datasets": {"Taste": [{"x": 0.8, "y": 72, "brand": "A"}]},
                    "default_attribute": "Taste",
                    "headlines": {"Taste": "Taste drives intent"},
                },
            }
        ],
        "metadata": {"title": "Test"},
        "insights": {},
    }
    intents = PresentationPlanner.define_slide_intents(report)
    sigma_slides = [
        intent
        for intent in intents
        if intent.type == SlideType.CONTENT_SLIDE and (intent.data or {}).get("chart_id") == "sigma_intent"
    ]
    assert len(sigma_slides) == 1
    datasets = sigma_slides[0].data.get("data", {}).get("datasets", [])
    assert isinstance(datasets, list)
    assert datasets and datasets[0]["label"] == "Taste"
