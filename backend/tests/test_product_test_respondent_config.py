"""Tests for respondent survey config normalization (Phase 3)."""

from backend.services.product_test_public_gateway import build_respondent_survey_config


def test_build_respondent_survey_config_merges_snapshot_and_taste_config():
    survey = {
        "taste_test_config": {
            "category": "Legacy Category",
            "testing_protocol": "branded",
            "own_brand": "Legacy Own",
            "internal_brands_data": [{"name": "Legacy Own"}],
            "competitor_brands_data": [{"name": "Legacy Comp"}],
        },
        "product_test_snapshot": {
            "brand_context": {
                "brands": ["Own Brand", "Competitor X"],
                "category": "Foam",
                "testing_protocol": "blind",
                "blind_codes": {"Own Brand": "SAMPLE-A"},
                "own_brand": "Own Brand",
            },
        },
    }

    config = build_respondent_survey_config(survey, survey["product_test_snapshot"])

    assert config["category"] == "Foam"
    assert config["testing_protocol"] == "blind"
    assert config["blind_codes"]["Own Brand"] == "SAMPLE-A"
    assert config["own_brand"] == "Own Brand"
    assert len(config["internal_brands_data"]) >= 1


def test_build_respondent_survey_config_falls_back_to_survey_top_level_brands():
    survey = {
        "internal_brands_data": [{"name": "Top Internal"}],
        "competitor_brands_data": [{"name": "Top Comp"}],
        "customizations": {"category": "Gel"},
    }

    config = build_respondent_survey_config(survey, None)

    assert config["category"] == "Gel"
    assert config["testing_protocol"] == "branded"
    assert config["internal_brands_data"][0]["name"] == "Top Internal"
