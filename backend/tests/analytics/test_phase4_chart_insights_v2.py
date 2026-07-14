"""Phase 4 — chart_insights.json v2.0 prompt, schema, and parsing contract."""

from __future__ import annotations

import json
from pathlib import Path

from backend.analytics_module.src.ai.orchestrator import PromptOrchestrator
from backend.analytics_module.src.ai.prompt_registry import registry
from backend.analytics_module.src.ai.schemas import get_response_format
from backend.models import SurveyContextBlock

_PROMPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "resources"
    / "analytics"
    / "prompts"
    / "chart_insights.json"
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


class TestPhase4ChartInsightsV2:
    def test_prompt_version_and_required_vars(self):
        payload = json.loads(_PROMPT_PATH.read_text(encoding="utf-8"))
        assert payload["version"] == "2.0.0"

        required = set(payload["validation"]["required_vars"])
        for field in (
            "target_brand",
            "category",
            "survey_objective",
            "testing_protocol",
            "market",
        ):
            assert field in required

        user_base = payload["user_base"]
        assert "--- SURVEY INTELLIGENCE ---" in user_base
        assert "{target_brand}" in user_base
        assert "{category}" in user_base

    def test_system_prompt_documents_recommended_action(self):
        payload = json.loads(_PROMPT_PATH.read_text(encoding="utf-8"))
        system = payload["system"]
        assert "recommended_action" in system
        assert "{target_brand}" in system

    def test_unified_schema_includes_recommended_action(self):
        schema = get_response_format("chart_insights")
        insight_props = schema["json_schema"]["schema"]["properties"]["insights"]["items"]["properties"]
        assert "recommended_action" in insight_props
        required = schema["json_schema"]["schema"]["properties"]["insights"]["items"]["required"]
        assert "recommended_action" in required

    def test_chart_insights_intelligence_embedded_once_in_user_message(self):
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
        assert user_content.count("--- SURVEY INTELLIGENCE ---") == 1
        assert "Client Brand (Target): Squizz" in user_content
        assert "Product Category: Ice Cream / Frozen Desserts" in user_content
        assert "--- ANALYTICAL CONTEXT ---" in user_content

    def test_registry_format_prompt_requires_survey_intelligence_vars(self):
        variables = {
            "target_brand": "Squizz",
            "category": "Ice Cream",
            "survey_objective": "Concept test",
            "testing_protocol": "branded",
            "market": "Egypt",
            "methodology_notes": "n=10",
            "research_type": "taste_test",
            "section": "Overview",
            "chart_title": "PI",
            "chart_type": "bar",
            "brands": "Squizz, Friday",
            "base_n": 10,
            "data_summary": "Squizz leads PI T2B.",
        }
        rendered = registry.format_prompt("chart_insights", variables)
        assert "Squizz" in rendered
        assert "Ice Cream" in rendered
        assert "Squizz leads PI T2B." in rendered

    def test_insight_response_mapping_contract(self):
        """Documents v2 parsing: insights[].recommended_action -> analysis_points."""
        parsed = {
            "headline": "Squizz leads on purchase intent.",
            "insights": [
                {
                    "title": "Intent Gap",
                    "body": "Squizz over-indexes vs Friday.",
                    "sentiment": "positive",
                    "recommended_action": "Scale trial sampling in Cairo retail.",
                    "percentage": None,
                    "quote": None,
                }
            ],
        }
        raw_insights = parsed.get("insights") or parsed.get("analysis_points", [])
        analysis = [
            {
                "title": item.get("title", "Insight"),
                "body": item.get("body", ""),
                "sentiment": item.get("sentiment", "neutral"),
                "recommended_action": item.get("recommended_action") or "",
            }
            for item in raw_insights
        ]
        assert analysis[0]["recommended_action"] == "Scale trial sampling in Cairo retail."
