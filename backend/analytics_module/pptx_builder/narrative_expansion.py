from __future__ import annotations

from typing import Any, Dict, List

from .market_position_sections import MarketPositionSectionBuilder
from .narrative_pagination import chunk_sequence, split_text_blocks
from .presentation_planner import SlideType


def _executive_summary_slide_count(data: Dict[str, Any]) -> int:
    summary_pages = len(
        split_text_blocks(
            data.get("executive_summary") or data.get("summary", ""),
            max_chars=900,
            max_paragraphs=3,
        )
    )
    findings = data.get("key_findings") or data.get("findings", [])
    findings_pages = len(chunk_sequence(findings, 3)) if findings else 0
    opportunities = data.get("opportunity_insights") or data.get("opportunities", [])
    opportunity_pages = len(chunk_sequence(opportunities, 2)) if opportunities else 0
    return summary_pages + findings_pages + opportunity_pages


def _strategic_intelligence_slide_count(data: Dict[str, Any]) -> int:
    report = data.get("market_position_report") or data.get("report")
    market_pages = MarketPositionSectionBuilder.section_count(report)
    chart_pages = len(data.get("charts", []))
    return market_pages + chart_pages


def _swot_slide_count(data: Dict[str, Any]) -> int:
    swot = data.get("swot", {})
    quadrant_lengths = [
        len(chunk_sequence([str(item) for item in swot.get(key, [])], 4))
        for key in ("strengths", "weaknesses", "opportunities", "threats")
    ]
    return max(quadrant_lengths) if quadrant_lengths else 1


def _recommendations_slide_count(data: Dict[str, Any]) -> int:
    pillars = ("product", "price", "place", "promotion")
    page_counts = [
        len(split_text_blocks(data.get(pillar, ""), max_chars=420)) or 1
        for pillar in pillars
    ]
    return max(page_counts)


def estimate_extra_slides(intent: Any) -> int:
    """Return slide count beyond the single planned intent."""
    data = intent.data or {}
    slide_type = getattr(intent, "type", None)

    if slide_type == SlideType.EXECUTIVE_SUMMARY:
        return max(0, _executive_summary_slide_count(data) - 1)
    if slide_type == SlideType.STRATEGIC_INTELLIGENCE:
        return max(0, _strategic_intelligence_slide_count(data) - 1)
    if slide_type == SlideType.SWOT:
        return max(0, _swot_slide_count(data) - 1)
    if slide_type == SlideType.RECOMMENDATIONS_4P:
        return max(0, _recommendations_slide_count(data) - 1)
    return 0


def estimate_extra_slides_for_intents(intents: List[Any]) -> int:
    return sum(estimate_extra_slides(intent) for intent in intents)
