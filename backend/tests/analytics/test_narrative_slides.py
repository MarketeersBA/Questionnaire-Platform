from backend.analytics_module.pptx_builder.market_position_sections import MarketPositionSectionBuilder
from backend.analytics_module.pptx_builder.narrative_expansion import estimate_extra_slides
from backend.analytics_module.pptx_builder.narrative_pagination import chunk_sequence, split_text_blocks
from backend.analytics_module.pptx_builder.presentation_planner import SlideIntent, SlideType


def test_market_position_report_is_split_into_explicit_sections():
    payload = {
        "market_position": "Leader",
        "position_confidence": "High",
        "target_audience_profile": "Urban professionals seeking premium taste.",
        "audience_segments": [
            {"segment_name": "Urban Core", "rationale": "High affinity", "affinity_score": 88},
            {"segment_name": "Suburban Families", "rationale": "Growing trial", "affinity_score": 72},
            {"segment_name": "Students", "rationale": "Price sensitive", "affinity_score": 61},
            {"segment_name": "Seniors", "rationale": "Lower reach", "affinity_score": 44},
        ],
        "competitive_stance": "Own brand leads on taste while competitors close the gap on value.",
        "strategic_implications": ["Defend taste leadership", "Close value gap", "Expand trial"],
    }

    sections = MarketPositionSectionBuilder.from_payload(payload)
    kinds = [section.kind for section in sections]

    assert "archetype" in kinds
    assert "audience_profile" in kinds
    assert "audience_segments" in kinds
    assert "competitive_stance" in kinds
    assert "strategic_implications" in kinds
    assert len([section for section in sections if section.kind == "audience_segments"]) == 2


def test_executive_summary_intent_expands_for_paginated_narrative():
    long_summary = " ".join(["Insight"] * 250)
    intent = SlideIntent(
        SlideType.EXECUTIVE_SUMMARY,
        data={
            "executive_summary": long_summary,
            "key_findings": [{"label": "A", "finding": "One"}, {"label": "B", "finding": "Two"}],
            "opportunity_insights": [{"title": "O1", "insight": "D1"}, {"title": "O2", "insight": "D2"}],
        },
    )

    assert estimate_extra_slides(intent) >= 2
    assert len(split_text_blocks(long_summary, max_chars=900, max_paragraphs=3)) >= 2
    assert len(chunk_sequence(intent.data["opportunity_insights"], 2)) == 1
