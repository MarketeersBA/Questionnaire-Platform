from backend.analytics_module.pptx_builder.narrative_requirements import (
    missing_narrative_sections,
    planned_narrative_sections,
    section_is_present,
)
from backend.analytics_module.pptx_builder.presentation_planner import PresentationPlanner


def test_planned_narrative_sections_include_required_ai_blocks():
    report_doc = {
        "charts": [],
        "insights": {
            "executive_summary": "Summary text",
            "key_findings": [{"label": "A", "finding": "One"}],
            "opportunity_insights": [{"title": "O1", "insight": "D1"}],
            "market_position_report": {"market_position": "Leader"},
            "brand_swot": {"Hero Brand": {"strengths": ["S1"]}},
            "recommendations_4p": {"product": "Improve packaging"},
        },
    }

    intents = PresentationPlanner.define_slide_intents(report_doc)
    planned = planned_narrative_sections(report_doc, intents)
    section_ids = {section["section_id"] for section in planned}

    assert "executive_summary" in section_ids
    assert "key_findings" in section_ids
    assert "opportunity_insights" in section_ids
    assert "market_position_report" in section_ids
    assert any(section_id.startswith("swot::") for section_id in section_ids)
    assert "recommendations_4p" in section_ids


def test_missing_narrative_sections_detects_absent_markers():
    planned = [
        {
            "section_id": "executive_summary",
            "title": "Executive Summary",
            "markers": ["EXECUTIVE SUMMARY"],
            "expected_slides": 1,
        }
    ]

    missing = missing_narrative_sections(planned, {"executive_summary": 0}, [])
    assert missing[0]["section_id"] == "executive_summary"


def test_section_is_present_uses_render_journal():
    section = {
        "section_id": "key_findings",
        "title": "Critical Findings",
        "markers": ["CRITICAL FINDINGS"],
        "expected_slides": 1,
    }

    assert section_is_present(
        section,
        {"critical_findings": 0},
        [{"section_id": "key_findings", "rendered_slides": 2}],
    )
