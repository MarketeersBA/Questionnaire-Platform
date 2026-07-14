from __future__ import annotations

from typing import Any, Dict, List

from backend.analytics_module.pptx_builder.chart_fidelity_matrix import (
    CHART_ID_REGISTRY_OVERRIDES,
    SCREEN_CHART_TYPE_TO_REGISTRY,
)
from backend.analytics_module.pptx_builder.chart_contracts import canonical_nps_gauge_sample

KNOWN_REPORT_ID = "69ce229eeed39ea9d5282afa"
KNOWN_BAD_DECK_FILENAME = f"report_{KNOWN_REPORT_ID} (14).pptx"

FRONTEND_CHART_TYPE_TO_BACKEND_KEY: Dict[str, str] = {
    "criteria_table": "criteria_table",
    "grouped_bar": "grouped_bar",
    "stacked_bar": "stacked_bar",
    "preference_bar": "preference_bar",
    "radar": "radar",
    "heatmap": "heatmap",
    "gauge": "gauge",
    "wordcloud": "wordcloud",
    "horizontal_bar": "horizontal_bar",
    "funnel": "funnel",
    "scatter": "scatter",
    "scatter_plot": "scatter_plot",
    "profile_chart": "profile_chart",
    "likeness_profile": "likeness_profile",
    "funnel_ratio_cards": "funnel_ratio_cards",
    "snake_line": "snake_line",
    "reference_table": "reference_table",
    "table": "table",
    "scorecard": "scorecard",
    "line": "line",
    "verbatim_analysis": "verbatim_analysis",
    "sigma_intent_scatter": "sigma_intent_scatter",
    "brand_comparison": "brand_comparison",
    "scatter_bubble": "scatter_bubble",
    "affinity_heatmap": "affinity_heatmap",
    "market_position_radar": "market_position_radar",
}

FRONTEND_CHART_ID_OVERRIDES: Dict[str, str] = {
    "brand_awareness": "brand_awareness",
    "purchase_funnel": "purchase_funnel",
    "purchase_funnel_ratio_cards": "purchase_funnel_ratio_cards",
    "nps_recommend": "nps_recommend",
    "sigma_intent": "sigma_intent",
}

REPRESENTATIVE_SCREEN_CHARTS: List[Dict[str, Any]] = [
    {
        "chart_id": "criteria_table",
        "chart_type": "criteria_table",
        "title": "Criteria Table",
        "expected_backend_key": "criteria_table",
    },
    {
        "chart_id": "brand_profile_snake",
        "chart_type": "profile_chart",
        "title": "Brand Profile",
        "expected_backend_key": "profile_chart",
    },
    {
        "chart_id": "likeness_profile_chart",
        "chart_type": "likeness_profile",
        "title": "Likeness Profile",
        "expected_backend_key": "likeness_profile",
    },
    {
        "chart_id": "product_preference",
        "chart_type": "grouped_bar",
        "title": "Product Preference",
        "expected_backend_key": "grouped_bar",
    },
    {
        "chart_id": "purchase_funnel",
        "chart_type": "snake_line",
        "title": "Conversion Thresholds",
        "expected_backend_key": "purchase_funnel",
    },
    {
        "chart_id": "brand_awareness",
        "chart_type": "horizontal_bar",
        "title": "Brand Awareness",
        "expected_backend_key": "brand_awareness",
    },
    {
        "chart_id": "purchase_funnel_ratio_cards",
        "chart_type": "funnel_ratio_cards",
        "title": "Funnel Ratio Cards",
        "expected_backend_key": "purchase_funnel_ratio_cards",
    },
    {
        "chart_id": "purchase_intent",
        "chart_type": "stacked_bar",
        "title": "Purchase Intent",
        "expected_backend_key": "stacked_bar",
    },
    {
        "chart_id": "attribute_radar",
        "chart_type": "radar",
        "title": "Attribute Radar",
        "expected_backend_key": "radar",
    },
    {
        "chart_id": "nps_recommend",
        "chart_type": "gauge",
        "title": "NPS Recommendation",
        "expected_backend_key": "nps_recommend",
    },
    {
        "chart_id": "importance_combined",
        "chart_type": "importance_combined",
        "title": "Importance",
        "expected_backend_key": "importance_combined",
    },
    {
        "chart_id": "sigma_intent",
        "chart_type": "sigma_intent_scatter",
        "title": "Sigma Intent",
        "expected_backend_key": "sigma_intent",
    },
    {
        "chart_id": "market_position_sigma",
        "chart_type": "market_position_radar",
        "title": "Market Position Sigma",
        "expected_backend_key": "market_position_radar",
    },
    {
        "chart_id": "audience_affinity",
        "chart_type": "affinity_heatmap",
        "title": "Audience Affinity",
        "expected_backend_key": "affinity_heatmap",
    },
    {
        "chart_id": "competitive_position_matrix",
        "chart_type": "scatter_bubble",
        "title": "Competitive Position Matrix",
        "expected_backend_key": "scatter_bubble",
    },
    {
        "chart_id": "open_end_likes",
        "chart_type": "wordcloud",
        "title": "Open End Likes",
        "expected_backend_key": "wordcloud",
    },
    {
        "chart_id": "brand_card_hero_brand",
        "chart_type": "scorecard",
        "title": "Brand Card",
        "expected_backend_key": "scorecard",
    },
]


PROTEIN_BAR_SCREEN_CHARTS: List[Dict[str, Any]] = [
    {"chart_id": "criteria_table", "chart_type": "criteria_table", "title": "Criteria — Overall"},
    {"chart_id": "brand_profile_snake", "chart_type": "profile_chart", "title": "Brand Performance Profile"},
    {"chart_id": "likeness_profile_chart", "chart_type": "likeness_profile", "title": "Likeness Profile Chart"},
    {"chart_id": "importance_combined", "chart_type": "importance_combined", "title": "Importance"},
    {"chart_id": "purchase_funnel", "chart_type": "snake_line", "title": "Conversion Thresholds"},
    {"chart_id": "sigma_intent", "chart_type": "sigma_intent_scatter", "title": "Attribute Sigma vs Purchase Intent"},
    {"chart_id": "market_position_sigma", "chart_type": "market_position_radar", "title": "Market Positioning Intelligence"},
    {"chart_id": "audience_affinity", "chart_type": "affinity_heatmap", "title": "Audience Affinity Index (AAI)"},
    {"chart_id": "competitive_position_matrix", "chart_type": "scatter_bubble", "title": "Competitive Positioning Matrix"},
    {"chart_id": "purchase_intent", "chart_type": "stacked_bar", "title": "Purchase Intent"},
    {"chart_id": "brand_comparison_pi_ol", "chart_type": "brand_comparison", "title": "Brand Strategic Comparison"},
    {"chart_id": "brand_awareness", "chart_type": "horizontal_bar", "title": "Brand Awareness"},
    {"chart_id": "purchase_funnel_ratio_cards", "chart_type": "funnel_ratio_cards", "title": "Purchase Funnel — Ratio Cards"},
    {"chart_id": "purchase_funnel_reference_table", "chart_type": "reference_table", "title": "Reference Table"},
    {"chart_id": "nps_recommend", "chart_type": "gauge", "title": "Net Promoter Score"},
    {"chart_id": "brand_card_abu_auf", "chart_type": "scorecard", "title": "Abu Auf"},
    {"chart_id": "brand_card_haj_arfaa", "chart_type": "scorecard", "title": "Haj Arfaa"},
    {"chart_id": "brand_card_cadbury", "chart_type": "scorecard", "title": "Cadbury"},
    {"chart_id": "open_end_likes", "chart_type": "wordcloud", "title": "What Respondents Liked"},
    {"chart_id": "open_end_dislikes", "chart_type": "wordcloud", "title": "What Respondents Disliked"},
    {"chart_id": "open_end_improvements", "chart_type": "wordcloud", "title": "Suggestions for Improvement"},
]


def _default_chart_data(chart: Dict[str, Any]) -> Dict[str, Any]:
    chart_type = chart.get("chart_type")
    chart_id = chart.get("chart_id")

    if chart_type == "criteria_table":
        return {
            "brands": ["Hero Brand", "Competitor A"],
            "my_brand": "Hero Brand",
            "raw": [
                {
                    "criteria_name": "Taste",
                    "significance": 0.9,
                    "brand_scores": {"Hero Brand": 4.5, "Competitor A": 3.8},
                    "diff": 0.7,
                }
            ],
        }
    if chart_type == "likeness_profile":
        return {
            "metrics": ["Modern", "Premium"],
            "labels_left": ["Traditional", "Value"],
            "labels_right": ["Modern", "Premium"],
            "datasets": [{"label": "Hero Brand", "data": [4.2, 3.9]}],
        }
    if chart_type in {"gauge", "nps_recommend"} or chart_id == "nps_recommend":
        return canonical_nps_gauge_sample()
    if chart_type in {"scorecard", "brand_summary"}:
        return {
            "profile": {
                "Brand": chart.get("title", "Hero Brand"),
                "Overall Score": 8.1,
                "T2B %": 64,
                "NPS": 30,
                "Evaluations": 412,
                "Total Sample": 412,
            },
            "strengths": [
                {"attribute": "Taste", "score": 8.6},
                {"attribute": "Texture", "score": 8.1},
            ],
            "nps": {
                "nps": 30,
                "promoters_pct": 50.0,
                "passives_pct": 30.0,
                "detractors_pct": 20.0,
                "base_n": 412,
            },
        }
    if chart_type in {"wordcloud", "verbatim_cloud", "open_end_likes"}:
        return {
            "words": [
                {"text": "taste", "value": 120},
                {"text": "value", "value": 80},
                {"text": "quality", "value": 60},
            ]
        }
    if chart_type in {"funnel_ratio_cards", "purchase_funnel_ratio_cards"}:
        return {
            "brand_cards": [
                {
                    "brand": "Hero Brand",
                    "ratio_labels": [
                        {"label": "Awareness", "text": "85%"},
                        {"label": "Trial", "text": "65%"},
                    ],
                }
            ]
        }
    if chart_type in {"sigma_intent_scatter"}:
        return {
            "attributes": ["Taste", "Value"],
            "default_attribute": "Taste",
            "datasets": {
                "Taste": [
                    {"brand": "Hero Brand", "x": 0.8, "y": 72.0, "raw_mean": 4.5, "n": 412, "category_mean": 4.1, "category_std": 0.3},
                    {"brand": "Competitor A", "x": 0.2, "y": 61.0, "raw_mean": 4.2, "n": 398, "category_mean": 4.1, "category_std": 0.3},
                ],
                "Value": [
                    {"brand": "Hero Brand", "x": -0.1, "y": 72.0, "raw_mean": 3.9, "n": 412, "category_mean": 4.0, "category_std": 0.3},
                    {"brand": "Competitor A", "x": 0.4, "y": 61.0, "raw_mean": 4.3, "n": 398, "category_mean": 4.0, "category_std": 0.3},
                ],
            },
            "correlations": {"Taste": 0.74, "Value": 0.42},
            "headlines": {
                "Taste": "Strong primary purchase-intent driver.",
                "Value": "Secondary driver with competitive pressure.",
            },
        }
    if chart_type in {"scatter_plot", "scatter", "scatter_bubble"}:
        return {
            "datasets": [
                {
                    "label": "Hero Brand",
                    "data": [{"x": 4.5, "y": 3.8, "label": "Hero Brand"}],
                }
            ]
        }
    if chart_type in {"brand_comparison"}:
        return {
            "labels": ["Purchase Intent", "Overall Liking"],
            "datasets": [
                {"label": "Abu Auf", "data": [0.72, 0.81]},
                {"label": "Cadbury", "data": [0.58, 0.74]},
            ],
        }
    if chart_type in {"reference_table"}:
        return {
            "labels": ["Awareness", "Trial", "Loyalty"],
            "datasets": [
                {"label": "Abu Auf", "data": [85.0, 65.0, 22.0]},
                {"label": "Cadbury", "data": [62.0, 48.0, 18.0]},
            ],
        }
    if chart_type in {"affinity_heatmap"}:
        return {
            "brands": ["Hero Brand", "Competitor A"],
            "demographics": ["Urban Core", "Suburban Families"],
            "matrix": [[0.82, 0.64], [0.55, 0.48]],
        }
    if chart_type in {"market_position_radar"}:
        return {
            "labels": ["Taste", "Value", "Trust"],
            "datasets": [
                {"label": "Hero Brand", "data": [4.5, 3.8, 4.2]},
                {"label": "Competitor A", "data": [3.8, 4.1, 3.6]},
            ],
        }
    if chart_type in {"importance_combined"}:
        return {
            "main_scatter": {
                "datasets": [
                    {
                        "label": "Hero Brand",
                        "data": [{"x": 0.82, "y": 71.0, "attribute": "Taste"}],
                    }
                ]
            },
            "sub_scatter": {
                "datasets": [
                    {
                        "label": "Hero Brand",
                        "data": [{"x": 0.73, "y": 69.0, "sub_attribute": "Aftertaste", "main_attribute": "Taste"}],
                    }
                ],
                "drill_attribute": "Taste",
                "top_attributes": ["Aftertaste"],
            },
        }
    return {
        "labels": ["Own Brand", "Competitor A", "Competitor B"],
        "datasets": [{"label": chart.get("title", "Series"), "data": [0.8, 0.5, 0.3]}],
    }


def expected_backend_key(chart: Dict[str, Any]) -> str:
    chart_id = chart.get("chart_id")
    chart_type = chart.get("chart_type") or "table"
    explicit = chart.get("expected_backend_key")
    if explicit:
        return str(explicit)
    if chart_id in CHART_ID_REGISTRY_OVERRIDES:
        return CHART_ID_REGISTRY_OVERRIDES[chart_id]
    if chart_id in FRONTEND_CHART_ID_OVERRIDES:
        return FRONTEND_CHART_ID_OVERRIDES[chart_id]
    return FRONTEND_CHART_TYPE_TO_BACKEND_KEY.get(
        chart_type,
        SCREEN_CHART_TYPE_TO_REGISTRY.get(chart_type, "table"),
    )


def chart_titles_from_report(report_doc: Dict[str, Any]) -> List[str]:
    return [str(chart.get("title", "")).strip() for chart in report_doc.get("charts", []) if chart.get("title")]


def charts_with_deep_analysis(report_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
    charts: List[Dict[str, Any]] = []
    for chart in report_doc.get("charts", []):
        deep_analysis = chart.get("ai_deep_analysis")
        if isinstance(deep_analysis, str) and deep_analysis.strip():
            charts.append(chart)
        elif isinstance(deep_analysis, list) and deep_analysis:
            charts.append(chart)
    return charts


def build_representative_screen_report() -> Dict[str, Any]:
    charts = []
    for index, chart in enumerate(REPRESENTATIVE_SCREEN_CHARTS):
        payload = {
            **chart,
            "ai_headline": f"Headline for {chart['title']}",
            "data": _default_chart_data(chart),
        }
        if index == 0:
            payload["ai_deep_analysis"] = [
                {
                    "title": "Recall",
                    "body": "Hero brand leads the category on aided awareness.",
                }
            ]
        charts.append(payload)

    return {
        "project_name": "Marketeers Taste Benchmark",
        "brand": "Hero Brand",
        "metadata": {
            "title": "Marketeers Taste Benchmark",
            "brand": "Hero Brand",
            "brands": ["Hero Brand", "Competitor A", "Competitor B"],
            "total_responses": 412,
            "base_n": 400,
            "research_type": "Taste Test",
        },
        "charts": charts,
        "insights": _shared_golden_insights(),
    }


def _shared_golden_insights() -> Dict[str, Any]:
    return {
        "executive_summary": "Hero Brand leads on taste while value remains contested.",
        "key_findings": [
            {"label": "Taste leadership", "finding": "Hero Brand leads on sensory appeal."},
            {"label": "Value gap", "finding": "Competitor A closes the value gap."},
        ],
        "opportunity_insights": [
            {
                "title": "Defend taste leadership",
                "insight": "Own brand leads on sensory appeal.",
                "strategic_category": "Product",
                "impact": "High",
                "actions": [{"action": "Reinforce hero taste cues in packaging."}],
                "gap_magnitude": 1.2,
                "attribute": "Taste",
            }
        ],
        "market_position_report": {
            "market_position": "Leader",
            "position_confidence": "High",
            "target_audience_profile": "Urban professionals seeking premium taste.",
            "audience_segments": [
                {
                    "segment_name": "Urban Core",
                    "rationale": "High affinity with hero brand taste cues.",
                    "affinity_score": 88,
                }
            ],
            "competitive_stance": "Hero Brand leads on taste while competitors close the value gap.",
            "strategic_implications": [
                "Defend taste leadership",
                "Close value gap",
                "Expand trial",
            ],
        },
        "brand_swot": {
            "Hero Brand": {
                "strengths": ["Taste leadership"],
                "weaknesses": ["Value perception"],
                "opportunities": ["Expand trial"],
                "threats": ["Competitor value messaging"],
            }
        },
        "recommendations_4p": {
            "product": "Reinforce hero taste cues in packaging.",
            "price": "Introduce value-tier bundle.",
            "place": "Expand premium retail presence.",
            "promotion": "Lead with sensory proof points.",
        },
    }


def build_protein_bar_screen_report() -> Dict[str, Any]:
    charts = []
    for chart in PROTEIN_BAR_SCREEN_CHARTS:
        charts.append(
            {
                **chart,
                "ai_headline": f"Headline for {chart['title']}",
                "data": _default_chart_data(chart),
            }
        )

    return {
        "project_name": "Protein Bar Taste Benchmark",
        "brand": "Abu Auf",
        "metadata": {
            "title": "Protein Bar Taste Benchmark",
            "brand": "Abu Auf",
            "brands": ["Abu Auf", "Haj Arfaa", "Cadbury"],
            "total_responses": 412,
            "base_n": 400,
            "research_type": "Taste Test",
            "survey_id": KNOWN_REPORT_ID,
        },
        "charts": charts,
        "insights": _shared_golden_insights(),
    }


def build_acceptance_generation_report() -> Dict[str, Any]:
    """Stable golden report used for real-template export smoke comparisons."""
    return {
        "project_name": "Marketeers Taste Benchmark",
        "brand": "Hero Brand",
        "metadata": {
            "title": "Marketeers Taste Benchmark",
            "brand": "Hero Brand",
            "brands": ["Hero Brand", "Competitor A", "Competitor B"],
            "total_responses": 412,
            "base_n": 400,
            "research_type": "Taste Test",
        },
        "charts": [
            {
                "chart_id": "brand_awareness",
                "chart_type": "horizontal_bar",
                "title": "Brand Equity Awareness",
                "ai_headline": "Dominant market presence observed with 85% recall.",
                "ai_deep_analysis": [
                    {
                        "title": "Recall",
                        "body": "Hero brand leads the category on aided awareness.",
                    }
                ],
                "data": {
                    "labels": ["Own Brand", "Competitor A", "Competitor B"],
                    "datasets": [{"label": "Awareness", "data": [0.85, 0.45, 0.12]}],
                },
            },
            {
                "chart_id": "purchase_intent",
                "chart_type": "stacked_bar",
                "title": "Purchase Intent",
                "ai_headline": "Intent remains strongest for the hero brand.",
                "data": {
                    "labels": ["Own Brand", "Competitor A", "Competitor B"],
                    "datasets": [{"label": "Intent", "data": [0.72, 0.48, 0.31]}],
                },
            },
            {
                "chart_id": "purchase_funnel",
                "chart_type": "snake_line",
                "title": "Conversion Thresholds",
                "ai_headline": "Significant drop-off between trial and loyalty phases.",
                "data": {
                    "labels": ["Awareness", "Trial", "Loyalty"],
                    "datasets": [{"label": "Funnel", "data": [1.0, 0.65, 0.22]}],
                },
            },
            {
                "chart_id": "market_position_sigma",
                "chart_type": "market_position_radar",
                "title": "Market Position Sigma",
                "data": {
                    "labels": ["Taste", "Value", "Trust"],
                    "datasets": [
                        {"label": "Hero Brand", "data": [4.5, 3.8, 4.2]},
                        {"label": "Competitor A", "data": [3.8, 4.1, 3.6]},
                    ],
                },
            },
        ],
        "insights": {
            "executive_summary": "Hero Brand leads on taste while value remains contested.",
            "key_findings": [
                {"label": "Taste leadership", "finding": "Hero Brand leads on sensory appeal."},
            ],
            "opportunity_insights": [
                {
                    "title": "Defend taste leadership",
                    "insight": "Own brand leads on sensory appeal.",
                    "strategic_category": "Product",
                    "impact": "High",
                    "actions": [{"action": "Reinforce hero taste cues in packaging."}],
                    "gap_magnitude": 1.2,
                    "attribute": "Taste",
                }
            ],
            "market_position_report": {
                "market_position": "Leader",
                "position_confidence": "High",
                "target_audience_profile": "Urban professionals seeking premium taste.",
                "audience_segments": [
                    {
                        "segment_name": "Urban Core",
                        "rationale": "High affinity with hero brand taste cues.",
                        "affinity_score": 88,
                    }
                ],
                "competitive_stance": "Hero Brand leads on taste while competitors close the value gap.",
                "strategic_implications": ["Defend taste leadership", "Close value gap", "Expand trial"],
            },
            "brand_swot": {
                "Hero Brand": {
                    "strengths": ["Taste leadership"],
                    "weaknesses": ["Value perception"],
                    "opportunities": ["Expand trial"],
                    "threats": ["Competitor value messaging"],
                }
            },
            "recommendations_4p": {
                "product": "Reinforce hero taste cues in packaging.",
                "price": "Introduce value-tier bundle.",
                "place": "Expand premium retail presence.",
                "promotion": "Lead with sensory proof points.",
            },
        },
    }


def build_known_report_fixture() -> Dict[str, Any]:
    """Alias for the known-report golden smoke fixture."""
    return build_acceptance_generation_report()
