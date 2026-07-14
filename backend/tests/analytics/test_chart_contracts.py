from backend.analytics_module.pptx_builder.chart_contracts import (
    TASTE_TEST_CONTRACTS,
    resolve_taste_test_contract,
    validate_against_contract,
)


def test_taste_test_contract_registry_contains_required_patterns():
    patterns = {contract.chart_id_pattern for contract in TASTE_TEST_CONTRACTS}
    assert "criteria_table" in patterns
    assert "brand_card_*" in patterns
    assert "open_end_*" in patterns
    assert "verbatim_ai_*" in patterns
    assert "importance_combined*" in patterns


def test_resolve_contract_matches_dynamic_open_end_chart():
    contract = resolve_taste_test_contract(
        {
            "chart_id": "open_end_likes",
            "chart_type": "wordcloud",
            "data": {"words": [{"text": "taste", "value": 10}]},
        }
    )
    assert contract is not None
    assert contract.chart_id_pattern == "open_end_*"
    assert contract.builder_registry_key == "wordcloud"


def test_validate_against_contract_reports_structured_errors():
    errors = validate_against_contract(
        {
            "chart_id": "sigma_intent",
            "chart_type": "sigma_intent_scatter",
            "data": {"datasets": []},
        }
    )
    assert errors
    assert errors[0]["code"] == "missing_required_field"
    assert errors[0]["path"] == "data.attributes"


def test_validate_against_contract_accepts_contract_golden_sample():
    contract = resolve_taste_test_contract(
        {
            "chart_id": "purchase_intent",
            "chart_type": "stacked_bar",
            "data": {},
        }
    )
    assert contract is not None
    chart = {
        "chart_id": "purchase_intent",
        "chart_type": "stacked_bar",
        "data": contract.golden_sample_factory(),
    }
    assert validate_against_contract(chart) == []


def test_validate_against_contract_accepts_brand_card_golden_sample_with_nps():
    contract = resolve_taste_test_contract(
        {
            "chart_id": "brand_card_hero_brand",
            "chart_type": "scorecard",
            "data": {},
        }
    )
    assert contract is not None
    chart = {
        "chart_id": "brand_card_hero_brand",
        "chart_type": "scorecard",
        "data": contract.golden_sample_factory(),
    }

    assert validate_against_contract(chart) == []
    assert chart["data"]["profile"]["NPS"] == 30


def test_validate_against_contract_accepts_nps_gauge_canonical_sample():
    contract = resolve_taste_test_contract(
        {
            "chart_id": "nps_recommend",
            "chart_type": "gauge",
            "data": {},
        }
    )
    assert contract is not None
    chart = {
        "chart_id": "nps_recommend",
        "chart_type": "gauge",
        "data": contract.golden_sample_factory(),
    }

    assert validate_against_contract(chart) == []
    assert chart["data"]["labels"] == ["Hero Brand", "Competitor A"]
    assert chart["data"]["nps_scores"]["Hero Brand"] == 30
    assert len(chart["data"]["datasets"]) == 3

