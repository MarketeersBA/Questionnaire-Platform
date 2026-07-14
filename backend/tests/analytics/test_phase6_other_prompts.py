"""Phase 6 — Survey intelligence variables across non-chart prompt templates."""

from __future__ import annotations

import json
from pathlib import Path

from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.models import SurveyContextBlock

_PROMPTS_DIR = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "analytics"
    / "prompts"
)


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


class TestPhase6OtherPrompts:
    def test_executive_summary_v2_prompt_contract(self):
        payload = json.loads((_PROMPTS_DIR / "executive_summary.json").read_text(encoding="utf-8"))
        assert payload["version"] == "2.0.0"
        user_base = payload["user_base"]
        assert "Your primary client is {target_brand}" in user_base
        required = set(payload["validation"]["required_vars"])
        assert {"target_brand", "category", "survey_objective", "testing_protocol"} <= required

    def test_recommendations_v2_removes_hardcoded_market(self):
        payload = json.loads((_PROMPTS_DIR / "recommendations.json").read_text(encoding="utf-8"))
        assert payload["version"] == "2.0.0"
        user_base = payload["user_base"]
        assert "Egyptian FMCG" not in user_base
        assert "{market}" in user_base
        assert "{category}" in user_base
        assert "{survey_objective}" in user_base

    def test_opportunity_summary_v12_adds_blind_protocol_rule(self):
        payload = json.loads((_PROMPTS_DIR / "opportunity_summary.json").read_text(encoding="utf-8"))
        assert payload["version"] == "2.0.0"
        user_base = payload["user_base"]
        assert "{testing_protocol}" in user_base
        assert "BLIND" in user_base
        assert "brand heritage" in user_base.lower()
        assert "testing_protocol" in payload["validation"]["required_vars"]

    def test_verbatim_analysis_v13_adds_target_brand_and_protocol(self):
        payload = json.loads((_PROMPTS_DIR / "verbatim_analysis.json").read_text(encoding="utf-8"))
        assert payload["version"] == "2.0.0"
        for field in ("user_base", "user_base_brand_scoped"):
            section = payload[field]
            assert "{target_brand}" in section
            assert "{testing_protocol}" in section
        required = set(payload["validation"]["required_vars"])
        assert {"target_brand", "testing_protocol"} <= required

    def test_executive_summary_orchestrator_injects_client_prefix(self):
        ctx = _ice_cream_context()
        messages = PromptOrchestrator.construct_messages(
            template_key="executive_summary",
            data={"awareness": 80},
            model="gpt-4o",
            research_type="taste_test",
            variables={
                "context": "Slide narrations",
                "insights_summary": "- PI leads for Squizz",
            },
            survey_meta=ctx,
        )
        user_content = messages[1]["content"]
        assert "Your primary client is Squizz" in user_content
        assert "Ice Cream / Frozen Desserts" in user_content
        assert "New product concept test" in user_content
        assert user_content.count("--- SURVEY INTELLIGENCE ---") == 1

    def test_recommendations_registry_formats_survey_context(self):
        rendered = registry.format_prompt(
            "recommendations",
            {
                "target_brand": "Squizz",
                "category": "Ice Cream",
                "market": "Egypt",
                "survey_objective": "Concept test",
                "testing_protocol": "branded",
                "insights_text": "Squizz leads PI T2B.",
            },
        )
        assert "Squizz" in rendered
        assert "Egypt" in rendered
        assert "Concept test" in rendered
        assert "Egyptian FMCG" not in rendered

    def test_opportunity_summary_registry_formats_testing_protocol(self):
        rendered = registry.format_prompt(
            "opportunity_summary",
            {
                "opportunity_data": "[OPPORTUNITY: Taste]",
                "brand_name": "Squizz",
                "category": "Ice Cream",
                "testing_protocol": "blind",
                "sample_n": 10,
            },
        )
        assert "Testing Protocol: blind" in rendered
        assert "BLIND" in rendered

    def test_verbatim_brand_scoped_variant_formats(self):
        rendered = registry.format_prompt(
            "verbatim_analysis",
            {
                "target_brand": "Squizz",
                "testing_protocol": "branded",
                "brand_name": "Squizz",
                "question_type": "Likes",
                "total_responses": 8,
                "base_n": 10,
                "responses_summary": "- Great taste",
            },
            variant="user_base_brand_scoped",
        )
        assert "Client Brand (Target): Squizz" in rendered
        assert "Testing Protocol: branded" in rendered
