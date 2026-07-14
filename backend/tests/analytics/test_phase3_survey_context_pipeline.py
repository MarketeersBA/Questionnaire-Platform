"""Phase 3 — SurveyContextBlock threading through PromptOrchestrator and AI engines."""

from __future__ import annotations

from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.models import SurveyContextBlock


def _ice_cream_context() -> SurveyContextBlock:
    return SurveyContextBlock(
        target_brand="Squizz",
        category="Ice Cream / Frozen Desserts",
        survey_objective="New product concept test",
        testing_protocol="branded",
        market="Egypt",
        base_n=10,
        brand_count=2,
        methodology_notes="BRANDED test, 10 respondents, 2 brands",
    )


class TestPhase3SurveyContextPipeline:
    def test_construct_messages_injects_survey_intelligence_block(self):
        ctx = _ice_cream_context()
        messages = PromptOrchestrator.construct_messages(
            template_key="chart_insights",
            data={"labels": ["Friday", "Squizz"], "datasets": []},
            model="gpt-4o",
            research_type="taste_test",
            variables={
                "section": "Executive Summary",
                "chart_title": "Brand Strategic Comparison",
                "chart_type": "brand_comparison",
                "brands": "Friday, Squizz",
                "base_n": 10,
            },
            survey_meta=ctx,
        )

        user_content = messages[1]["content"]
        assert "--- SURVEY INTELLIGENCE ---" in user_content
        assert "Client Brand (Target): Squizz" in user_content
        assert "Product Category: Ice Cream / Frozen Desserts" in user_content
        assert "Survey Objective: New product concept test" in user_content
        assert "Testing Protocol: branded" in user_content
        assert "Market: Egypt" in user_content
        assert "BRANDED test, 10 respondents, 2 brands" in user_content
        assert "--- ANALYTICAL CONTEXT ---" in user_content
        assert "Brand Scope: Squizz" in user_content

    def test_construct_messages_exposes_template_variables(self):
        ctx = _ice_cream_context()
        messages = PromptOrchestrator.construct_messages(
            template_key="executive_summary",
            data={"awareness": 80},
            model="gpt-4o",
            research_type="taste_test",
            variables={"context": "slide narrations", "insights_summary": "summary"},
            survey_meta=ctx,
        )

        user_content = messages[1]["content"]
        assert "target_brand" not in user_content  # merged into formatted template / context block
        assert "Squizz" in user_content
        assert "Ice Cream / Frozen Desserts" in user_content

    def test_construct_messages_without_survey_meta_keeps_legacy_context(self):
        messages = PromptOrchestrator.construct_messages(
            template_key="slide_insights",
            data={"value": 1},
            model="gpt-4o",
            research_type="standard",
            variables={"slide_id": "chart_1", "brand_name": "Friday"},
        )

        user_content = messages[1]["content"]
        assert "--- SURVEY INTELLIGENCE ---" not in user_content
        assert "--- ANALYTICAL CONTEXT ---" in user_content
        assert "Brand Scope: Friday" in user_content
