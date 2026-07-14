"""Phase 2 — SurveyContextBlock extraction and prompt variable contract."""

from __future__ import annotations

from backend.models import SurveyContextBlock
from backend.tests.analytics.fixtures.ice_cream_survey import (
    ICE_CREAM_BASE_N,
    ICE_CREAM_BRANDS,
    ICE_CREAM_OWN_BRAND,
)


def _ice_cream_survey_doc() -> dict:
    return {
        "company_name": "Squizz Ice Cream",
        "category": "Ice Cream / Frozen Desserts",
        "survey_objective": "taste_new_product",
        "survey_objective_other": "",
        "market": "Egypt",
        "blueprint": {
            "own_brand": ICE_CREAM_OWN_BRAND,
            "category": "Blueprint Ice Cream",
            "brands": [
                {"name": "Squizz", "role": "internal"},
                {"name": "Friday", "role": "competitor"},
            ],
        },
        "taste_test_config": {
            "category": "Taste Config Ice Cream",
            "testing_protocol": "branded",
            "internal_brands_data": [{"name": "Squizz", "role": "internal"}],
            "competitor_brands_data": [{"name": "Friday", "role": "competitor"}],
        },
        "internal_brands_data": [{"name": "Squizz", "role": "internal"}],
        "competitor_brands_data": [{"name": "Friday", "role": "competitor"}],
    }


class TestSurveyContextBlockFromSurveyDoc:
    def test_ice_cream_full_extraction(self):
        ctx = SurveyContextBlock.from_survey_doc(
            _ice_cream_survey_doc(),
            my_brand=ICE_CREAM_OWN_BRAND,
            base_n=ICE_CREAM_BASE_N,
            brands=ICE_CREAM_BRANDS,
        )

        assert ctx.target_brand == "Squizz"
        assert ctx.category == "Blueprint Ice Cream"
        assert ctx.survey_objective == "New product concept test"
        assert ctx.testing_protocol == "branded"
        assert ctx.market == "Egypt"
        assert ctx.base_n == 10
        assert ctx.brand_count == 2
        assert ctx.methodology_notes == "BRANDED test, 10 respondents, 2 brands"

    def test_target_brand_falls_back_to_my_brand(self):
        doc = {"taste_test_config": {"internal_brands_data": []}}
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="FallbackBrand", base_n=5)

        assert ctx.target_brand == "FallbackBrand"
        assert ctx.methodology_notes == "BRANDED test, 5 respondents, 0 brands"

    def test_target_brand_from_taste_internal_brands_alias(self):
        doc = {
            "taste_test_config": {
                "internal_brands": [{"name": "Squizz"}],
            }
        }
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="", base_n=1)

        assert ctx.target_brand == "Squizz"

    def test_category_priority_blueprint_over_survey(self):
        doc = {
            "category": "Survey Category",
            "blueprint": {"category": "Blueprint Category"},
            "taste_test_config": {"category": "Taste Category"},
        }
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="X", base_n=1)

        assert ctx.category == "Blueprint Category"

    def test_category_falls_back_to_survey_field(self):
        doc = {"category": "Ice Cream / Frozen Desserts"}
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="X", base_n=1)

        assert ctx.category == "Ice Cream / Frozen Desserts"

    def test_survey_objective_other_when_selected(self):
        doc = {
            "survey_objective": "other",
            "survey_objective_other": "Compare Squizz vs Friday after reformulation",
        }
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="Squizz", base_n=10)

        assert ctx.survey_objective == "Compare Squizz vs Friday after reformulation"

    def test_testing_protocol_from_product_test_config(self):
        doc = {
            "product_test_config": {"testing_protocol": "blind"},
            "product_test_snapshot": {
                "brand_context": {"testing_protocol": "branded"},
            },
        }
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="X", base_n=3)

        assert ctx.testing_protocol == "blind"

    def test_testing_protocol_invalid_value_normalizes_to_branded(self):
        doc = {"taste_test_config": {"testing_protocol": "unknown_protocol"}}
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="X", base_n=1)

        assert ctx.testing_protocol == "branded"

    def test_market_from_customizations(self):
        doc = {"customizations": {"market": "Saudi Arabia"}}
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="X", base_n=1)

        assert ctx.market == "Saudi Arabia"

    def test_brand_count_from_explicit_brands_argument(self):
        doc = {}
        ctx = SurveyContextBlock.from_survey_doc(
            doc,
            my_brand="Squizz",
            base_n=10,
            brands=["Friday", "Squizz"],
        )

        assert ctx.brand_count == 2
        assert "2 brands" in ctx.methodology_notes

    def test_brand_count_from_survey_brand_lists_when_no_explicit_brands(self):
        doc = {
            "internal_brands_data": [{"name": "Squizz"}],
            "competitor_brands_data": [{"name": "Friday"}],
        }
        ctx = SurveyContextBlock.from_survey_doc(doc, my_brand="Squizz", base_n=10)

        assert ctx.brand_count == 2

    def test_to_prompt_variables_includes_all_ai_fields(self):
        ctx = SurveyContextBlock(
            target_brand="Squizz",
            category="Ice Cream",
            survey_objective="New product concept test",
            testing_protocol="branded",
            market="Egypt",
            base_n=10,
            brand_count=2,
            methodology_notes="BRANDED test, 10 respondents, 2 brands",
        )

        variables = ctx.to_prompt_variables()

        assert variables["target_brand"] == "Squizz"
        assert variables["brand_name"] == "Squizz"
        assert variables["category"] == "Ice Cream"
        assert variables["survey_objective"] == "New product concept test"
        assert variables["testing_protocol"] == "branded"
        assert variables["market"] == "Egypt"
        assert variables["base_n"] == "10"
        assert variables["brand_count"] == "2"
        assert "BRANDED test" in variables["methodology_notes"]

    def test_methodology_notes_singular_labels(self):
        ctx = SurveyContextBlock.from_survey_doc(
            {},
            my_brand="Squizz",
            base_n=1,
            brands=["Squizz"],
        )

        assert ctx.methodology_notes == "BRANDED test, 1 respondent, 1 brand"
