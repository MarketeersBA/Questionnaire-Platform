"""
`testing_protocol: 'blind'` + `blind_codes` is a creator-facing feature
(ParametersStep lets a creator type a code per brand) that `compose_survey_schema`
never read for taste test: every section title and question kept showing the
real brand name regardless of protocol, unlike product test's
`resolve_brand_display_name`. That produced surveys where the section title
said one blind code ("مربع") while a question a few taps later said another
("دايرة") — the creator had configured both as codes for two different real
brands, and neither ever reached the composed schema.
"""
from __future__ import annotations

import pytest

from backend.services.orchestration_service import OrchestrationService

MASTER_DATA = {
    "fixed": [
        {
            "question_id": "tt_q_overall",
            "main_att": "Overall",
            "ar_text": "ايه تقييمك لشكل المنتج ككل؟",
            "en_text": "What do you think of the product shape overall?",
            "question_type": "Scale 1-10",
            "timing": "After Taste",
            "question_status": "fixed",
        }
    ]
}


@pytest.fixture
def svc(monkeypatch):
    service = OrchestrationService()

    async def fake_fetch(self, selections):
        return {"data": MASTER_DATA, "meta": {"question_id_prefix": "tt"}}

    monkeypatch.setattr(OrchestrationService, "fetch_taste_test_master_data", fake_fetch)
    return service


def _base_survey(**tt_overrides):
    tt_config = {
        "category": "juice",
        "language": "ar",
        "internal_brands_data": [{"name": "Squizz"}],
        "competitor_brands_data": [{"name": "Kiks"}],
        "attributes": {},
        **tt_overrides,
    }
    return {
        "config": {},
        "selected_modules": ["taste_test"],
        "taste_test_config": tt_config,
    }


@pytest.mark.asyncio
async def test_branded_protocol_shows_the_real_name_everywhere(svc):
    schema = await svc.compose_survey_schema(_base_survey(testing_protocol="branded"))
    sections = schema["layer2_structure"]["sections"]
    titles = " | ".join(s["title"] for s in sections)
    assert "Squizz" in titles
    assert "Kiks" in titles
    assert "دايرة" not in titles
    assert "مربع" not in titles


@pytest.mark.asyncio
async def test_blind_protocol_shows_the_configured_code_everywhere_for_that_brand(svc):
    schema = await svc.compose_survey_schema(
        _base_survey(testing_protocol="blind", blind_codes={"Squizz": "دايرة", "Kiks": "مربع"})
    )
    sections = schema["layer2_structure"]["sections"]

    squizz_sections = [s for s in sections if s.get("brand") == "Squizz"]
    kiks_sections = [s for s in sections if s.get("brand") == "Kiks"]
    assert squizz_sections
    assert kiks_sections

    for s in squizz_sections:
        assert "دايرة" in s["title"]
        assert "Squizz" not in s["title"]
        for q in s["questions"]:
            assert "Squizz" not in q["text"]

    for s in kiks_sections:
        assert "مربع" in s["title"]
        assert "Kiks" not in s["title"]
        for q in s["questions"]:
            assert "Kiks" not in q["text"]


@pytest.mark.asyncio
async def test_blind_protocol_ids_and_brand_pipeline_key_stay_on_the_real_name(svc):
    schema = await svc.compose_survey_schema(
        _base_survey(testing_protocol="blind", blind_codes={"Squizz": "دايرة", "Kiks": "مربع"})
    )
    sections = schema["layer2_structure"]["sections"]
    squizz_section = next(s for s in sections if s.get("brand") == "Squizz")
    assert squizz_section["brand"] == "Squizz"
    for q in squizz_section["questions"]:
        assert "دايرة" not in q["id"]


@pytest.mark.asyncio
async def test_overall_preference_options_are_blind_coded_with_real_names_kept_for_scoring(svc):
    schema = await svc.compose_survey_schema(
        _base_survey(testing_protocol="blind", blind_codes={"Squizz": "دايرة", "Kiks": "مربع"})
    )
    sections = schema["layer2_structure"]["sections"]
    preference = next(s for s in sections if s["title"] == "التفضيل")
    q = preference["questions"][0]
    assert q["options"] == ["دايرة", "مربع"]
    assert q["questionMeta"]["brandOptions"] == ["Squizz", "Kiks"]
