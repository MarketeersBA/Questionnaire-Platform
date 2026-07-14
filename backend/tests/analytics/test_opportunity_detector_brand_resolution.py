"""Phase 1 — OpportunityDetector brand resolution regression."""

from __future__ import annotations

from unittest.mock import MagicMock

import pandas as pd

from backend.analytics_module.ingestor import SurveyData
from backend.analytics_module.src.ai.opportunity_detector import OpportunityDetector


def _empty_survey_data(*, brands: list[str]) -> SurveyData:
    return SurveyData(
        evaluations=pd.DataFrame(),
        demographics=pd.DataFrame(),
        purchase_funnel=pd.DataFrame(),
        preferences=pd.DataFrame(),
        open_ends=pd.DataFrame(),
        question_map={},
        response_count=0,
        brands=list(brands),
        survey_id="test",
        own_brand=brands[0] if brands else "",
    )


class TestOpportunityDetectorBrandResolution:
    def test_blueprint_own_brand_does_not_raise_name_error(self):
        data = _empty_survey_data(brands=["Squizz", "Friday"])
        survey_meta = {
            "blueprint": {
                "own_brand": "Squizz",
                "brands": [
                    {"name": "Squizz", "role": "own"},
                    {"name": "Friday", "role": "competitor"},
                ],
            }
        }

        detector = OpportunityDetector(data, survey_meta)
        target, competitors = detector._resolve_target_brand()

        assert target == "Squizz"
        assert competitors == ["Friday"]

    def test_meta_competitors_used_when_discovered_brands_empty(self):
        data = _empty_survey_data(brands=[])
        survey_meta = {
            "my_brand": "Squizz",
            "blueprint": {
                "brands": [
                    {"name": "Squizz", "role": "internal"},
                    {"name": "Friday", "role": "competitor"},
                ],
            },
        }

        detector = OpportunityDetector(data, survey_meta)
        target, competitors = detector._resolve_target_brand()

        assert target == "Squizz"
        assert competitors == ["Friday"]

    def test_get_context_reflects_resolved_scope(self):
        data = _empty_survey_data(brands=["Squizz", "Friday"])
        detector = OpportunityDetector(
            data,
            {"my_brand": "Squizz", "blueprint": {"brands": []}},
        )

        ctx = detector.get_context()

        assert ctx["target_brand"] == "Squizz"
        assert ctx["competitors"] == ["Friday"]
        assert ctx["has_competitors"] is True
