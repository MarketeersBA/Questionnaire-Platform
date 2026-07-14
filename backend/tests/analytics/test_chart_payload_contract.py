from backend.analytics_module.pptx_builder.chart_payload_adapters import adapt_chart_data_for_builder
from backend.analytics_module.pptx_builder.chart_payload_contract import (
    capture_report_export_snapshot,
    normalize_chart_for_pptx,
    prepare_report_for_pptx,
)
from backend.analytics_module.pptx_builder.chart_render_manifest import build_chart_parity_manifest
from backend.analytics_module.pptx_builder.chart_resolver import PPTXChartResolver
from backend.analytics_module.pptx_builder.presentation_planner import PresentationPlanner


def test_capture_report_export_snapshot_preserves_chart_ids():
    report_doc = {
        "_id": "abc123",
        "project_name": "Protein Bar",
        "charts": [
            {"chart_id": "purchase_intent", "chart_type": "stacked_bar", "title": "Intent", "data": {}},
            {"chart_id": "brand_awareness", "chart_type": "horizontal_bar", "title": "Awareness", "data": {}},
        ],
        "insights": {"executive_summary": "Summary"},
    }

    snapshot = capture_report_export_snapshot(report_doc)

    assert snapshot["chart_ids"] == ["purchase_intent", "brand_awareness"]
    assert snapshot["chart_count"] == 2
    assert snapshot["charts"][0]["title"] == "Intent"
    assert snapshot["payload_hash"]


def test_normalize_chart_contract_fields_and_resolution():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "brand_awareness",
            "chart_type": "stacked_bar",
            "title": "Awareness",
            "subtitle": "Top of mind",
            "insight": "Strong recall",
            "ai_headline": "Recall leads the category",
            "ai_deep_analysis": [{"text": "Defend awareness"}],
            "data": {
                "labels": ["Own Brand", "Competitor A"],
                "datasets": [{"label": "Awareness", "data": [0.8, 0.4]}],
            },
        },
        0,
    )

    assert chart["chart_id"] == "brand_awareness"
    assert chart["chart_type"] == "stacked_bar"
    assert chart["title"] == "Awareness"
    assert chart["subtitle"] == "Top of mind"
    assert chart["insight"] == "Strong recall"
    assert chart["ai_headline"] == "Recall leads the category"
    assert chart["ai_deep_analysis"] == [{"text": "Defend awareness"}]
    assert chart["_resolution"]["registry_key"] == "brand_awareness"
    assert chart["_pptx_slide_id"] == "brand_awareness::stacked_bar"
    assert "normalized_awareness_waterfall_segments" in notes


def test_nps_adapter_transposes_segment_rows_to_brand_rows():
    adapted, notes = adapt_chart_data_for_builder(
        "nps_recommend",
        {
            "chart_id": "nps_recommend",
            "title": "NPS",
            "data": {
                "labels": ["Promoters_Pct", "Passives_Pct", "Detractors_Pct"],
                "datasets": [
                    {"label": "Own Brand", "data": [0.5, 0.3, 0.2]},
                    {"label": "Competitor A", "data": [0.4, 0.4, 0.2]},
                ],
            },
        },
    )

    assert adapted["labels"] == ["Own Brand", "Competitor A"]
    assert adapted["datasets"][0]["label"] == "Detractors"
    assert adapted["datasets"][1]["label"] == "Passives"
    assert adapted["datasets"][2]["label"] == "Promoters"
    assert "transposed_nps_segment_rows_to_brand_rows" in notes


def test_nps_adapter_passthrough_canonical_payload():
    canonical = {
        "labels": ["Friday", "Squizz"],
        "datasets": [
            {"label": "Detractors", "data": [0.6, 0.7]},
            {"label": "Passives", "data": [0.3, 0.3]},
            {"label": "Promoters", "data": [0.1, 0.0]},
        ],
        "nps_scores": {"Friday": -50, "Squizz": -70},
        "segments": [
            {"brand": "Friday", "nps": -50, "promoters_pct": 10.0, "passives_pct": 30.0, "detractors_pct": 60.0, "base_n": 10},
            {"brand": "Squizz", "nps": -70, "promoters_pct": 0.0, "passives_pct": 30.0, "detractors_pct": 70.0, "base_n": 10},
        ],
    }
    adapted, notes = adapt_chart_data_for_builder(
        "nps_recommend",
        {
            "chart_id": "nps_recommend",
            "title": "Net Promoter Score",
            "data": canonical,
        },
    )

    assert "transposed_nps_segment_rows_to_brand_rows" not in notes
    assert adapted["labels"] == canonical["labels"]
    assert adapted["datasets"] == canonical["datasets"]
    assert adapted["nps_scores"] == canonical["nps_scores"]
    assert adapted["segments"] == canonical["segments"]


def test_normalize_chart_nps_recommend_canonical_passthrough_to_builder():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "nps_recommend",
            "chart_type": "gauge",
            "title": "Net Promoter Score",
            "data": {
                "labels": ["Brand A"],
                "datasets": [
                    {"label": "Detractors", "data": [0.5]},
                    {"label": "Passives", "data": [0.0]},
                    {"label": "Promoters", "data": [0.5]},
                ],
                "nps_scores": {"Brand A": 0},
            },
        },
        0,
    )

    assert chart["_resolution"]["registry_key"] == "nps_recommend"
    assert chart["data"]["labels"] == ["Brand A"]
    assert chart["data"]["nps_scores"] == {"Brand A": 0}
    assert "transposed_nps_segment_rows_to_brand_rows" not in notes


def test_scorecard_adapter_converts_profile_payload():
    adapted, notes = adapt_chart_data_for_builder(
        "scorecard",
        {
            "chart_id": "brand_card_hero_brand",
            "title": "Brand Card",
            "data": {
                "profile": {
                    "Brand": "Hero Brand",
                    "Total Sample": 412,
                    "Awareness": 0.85,
                }
            },
        },
    )

    assert adapted["brand"] == "Hero Brand"
    assert adapted["n_size"] == 412
    assert any(metric["label"] == "Awareness" for metric in adapted["metrics"])
    assert "converted_profile_to_scorecard_metrics" in notes


def test_scorecard_adapter_passes_nps_profile_metric_through():
    adapted, notes = adapt_chart_data_for_builder(
        "scorecard",
        {
            "chart_id": "brand_card_hero_brand",
            "title": "Hero Brand",
            "data": {
                "profile": {
                    "Brand": "Hero Brand",
                    "Overall Score": 8.1,
                    "T2B %": 64,
                    "NPS": 30,
                    "Evaluations": 412,
                },
                "nps": {
                    "nps": 30,
                    "promoters_pct": 50.0,
                    "passives_pct": 30.0,
                    "detractors_pct": 20.0,
                    "base_n": 120,
                },
            },
        },
    )

    nps_metric = next(metric for metric in adapted["metrics"] if metric["label"] == "NPS")
    assert nps_metric["value"] == 30
    assert any(metric["label"] == "Overall Score" for metric in adapted["metrics"])
    assert "converted_profile_to_scorecard_metrics" in notes


def test_prepare_report_for_pptx_replaces_charts_with_normalized_contract():
    report_doc = {
        "charts": [
            {
                "chart_id": "overall_scatter",
                "chart_type": "scatter_plot",
                "title": "Scatter",
                "data": {
                    "datasets": [
                        {
                            "label": "Own Brand",
                            "data": [{"x": 1, "y": 2, "attribute": "Taste"}],
                        }
                    ]
                },
            }
        ]
    }

    preparation = prepare_report_for_pptx(report_doc)

    assert preparation.report_doc["charts"][0]["data"]["datasets"][0]["data"][0]["label"] == "Taste"
    assert preparation.snapshot["chart_ids"] == ["overall_scatter"]


def test_chart_parity_manifest_compares_screen_ids_to_render_journal():
    screen_ids = ["purchase_intent", "brand_awareness", "missing_chart"]
    normalized = [
        {"chart_id": "purchase_intent", "chart_type": "stacked_bar", "_pptx_slide_id": "purchase_intent::stacked_bar"},
        {"chart_id": "brand_awareness", "chart_type": "horizontal_bar", "_pptx_slide_id": "brand_awareness::horizontal_bar"},
    ]
    render_journal = [
        {
            "pptx_slide_id": "purchase_intent::stacked_bar",
            "slide_index": 5,
            "chart_id": "purchase_intent",
            "chart_type": "stacked_bar",
            "title": "Intent",
            "registry_key": "stacked_bar",
        },
        {
            "pptx_slide_id": "brand_awareness::horizontal_bar",
            "slide_index": 6,
            "chart_id": "brand_awareness",
            "chart_type": "horizontal_bar",
            "title": "Awareness",
            "registry_key": "brand_awareness",
        },
    ]

    parity = build_chart_parity_manifest(
        screen_chart_ids=screen_ids,
        normalized_charts=normalized,
        render_journal=render_journal,
    )

    assert parity["missing_from_pptx"] == ["missing_chart"]
    assert parity["rendered_chart_ids"] == ["purchase_intent", "brand_awareness"]
    assert parity["rendered_pptx_slide_ids"] == [
        "purchase_intent::stacked_bar",
        "brand_awareness::horizontal_bar",
    ]
    assert parity["order_mismatch"] is False


def test_resolver_describes_export_contract():
    resolver = PPTXChartResolver()
    summary = resolver.describe_export_contract(
        {"chart_id": "brand_awareness", "chart_type": "horizontal_bar", "title": "Awareness"}
    )

    assert summary["registry_key"] == "brand_awareness"
    assert summary["source"] == "chart_id_override"
    assert summary["uses_fallback_table"] is False


def test_planner_uses_normalized_chart_slide_ids():
    report_doc = {
        "charts": [
            {"chart_id": "purchase_intent", "chart_type": "stacked_bar", "title": "Intent", "data": {}},
        ],
        "metadata": {"title": "Test"},
        "insights": {},
    }
    preparation = prepare_report_for_pptx(report_doc)
    intents = PresentationPlanner.define_slide_intents(preparation.report_doc)
    content = [intent for intent in intents if intent.type.value == "content_slide"]

    assert content[0].data["_pptx_slide_id"] == "purchase_intent::stacked_bar"


def test_normalize_chart_for_pptx_includes_contract_errors_for_invalid_payload():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "sigma_intent",
            "chart_type": "sigma_intent_scatter",
            "title": "Sigma",
            "data": {"datasets": []},
        },
        0,
    )
    assert chart.get("_contract_errors")
    assert any(error["path"] == "data.attributes" for error in chart["_contract_errors"])
    assert "contract_validation_failed" in notes


def test_importance_combined_adapter_preserves_main_and_sub_scatter_payloads():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "importance_combined_1",
            "chart_type": "importance_combined",
            "title": "Importance: Taste",
            "data": {
                "main_scatter": {
                    "datasets": [{"label": "Main", "data": [{"x": 0.8, "y": 0.6, "attribute": "Taste"}]}]
                },
                "sub_scatter": {
                    "datasets": [{"label": "Sub", "data": [{"x": 0.7, "y": 0.5, "sub_attribute": "Aftertaste"}]}],
                    "drill_attribute": "Taste",
                    "top_attributes": ["Aftertaste"],
                },
            },
        },
        0,
    )
    assert chart["_resolution"]["registry_key"] == "importance_combined"
    assert "main_scatter" in chart["data"]
    assert "sub_scatter" in chart["data"]
    assert isinstance(chart["data"]["main_scatter"]["datasets"], list)
    assert isinstance(chart["data"]["sub_scatter"]["datasets"], list)
    assert not any(note.startswith("importance_main_scatter_missing") for note in notes)


def test_brand_awareness_adapter_normalizes_tom_other_aided_segments():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "brand_awareness",
            "chart_type": "stacked_bar",
            "title": "Brand Awareness",
            "data": {
                "labels": ["Brand A", "Brand B"],
                "datasets": [
                    {"label": "Top of Mind", "data": [0.2, 0.15]},
                    {"label": "Unaided", "data": [0.3, 0.25]},
                    {"label": "Total Aided", "data": [0.35, 0.4]},
                ],
            },
        },
        0,
    )
    labels = [dataset["label"] for dataset in chart["data"]["datasets"]]
    assert labels == ["TOM", "Other_Unaided", "Aided"]
    assert "normalized_awareness_waterfall_segments" in notes
    assert "normalized_waterfall_awareness_series" in notes


def test_sigma_intent_adapter_preserves_dict_datasets_for_planner_chunking():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "sigma_intent",
            "chart_type": "sigma_intent_scatter",
            "title": "Sigma",
            "data": {
                "attributes": ["Taste", "Value"],
                "default_attribute": "Taste",
                "datasets": {
                    "Taste": [{"x": 0.9, "y": 65, "brand": "A"}],
                    "Value": [{"x": 0.4, "y": 61, "brand": "A"}],
                },
            },
        },
        0,
    )
    assert chart.get("_contract_errors") is None
    assert isinstance(chart["data"]["datasets"], dict)
    assert "Taste" in chart["data"]["datasets"]
    assert chart["data"]["datasets"]["Taste"][0]["x"] == 0.9
    assert "normalized_sigma_attribute_datasets" in notes or "normalized_sigma_dict_points" in notes


def test_affinity_heatmap_shape_normalization_pads_rows_and_columns():
    chart, notes = normalize_chart_for_pptx(
        {
            "chart_id": "audience_affinity",
            "chart_type": "affinity_heatmap",
            "title": "Affinity",
            "data": {
                "brands": ["A", "B", "C"],
                "demographics": ["Urban", "Rural"],
                "matrix": [[120, "90"], [80]],
            },
        },
        0,
    )
    matrix = chart["data"]["matrix"]
    assert len(matrix) == 2
    assert len(matrix[0]) == 3
    assert len(matrix[1]) == 3
    assert matrix[0][1] == 90.0
    assert "normalized_affinity_heatmap_matrix" in notes
