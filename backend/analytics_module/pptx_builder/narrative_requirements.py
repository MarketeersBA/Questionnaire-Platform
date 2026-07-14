from __future__ import annotations

from typing import Any, Dict, List

from .narrative_expansion import (
    _recommendations_slide_count,
    _strategic_intelligence_slide_count,
    _swot_slide_count,
)
from .narrative_pagination import chunk_sequence, split_text_blocks
from .presentation_planner import SlideIntent, SlideType

SECTION_MARKER_KEYS = {
    "executive_summary": ("executive_summary",),
    "key_findings": ("critical_findings",),
    "opportunity_insights": ("strategic_intelligence", "execution_playbook"),
    "market_position_report": ("market_archetype", "strategic_positioning"),
    "recommendations_4p": ("recommendations_4p",),
    "swot": ("competitive_swot",),
    "strategic_narrative": ("strategic_narrative", "strategic_architecture"),
    "brand_profile": ("brand_profiles",),
    "criteria_table": ("criteria_table",),
    "brand_profile_snake": ("profile_chart",),
    "likeness_profile_chart": ("likeness_profile",),
    "brand_comparison_pi_ol": ("brand_comparison",),
    "purchase_funnel": ("purchase_funnel",),
    "purchase_intent": ("purchase_intent",),
    "brand_awareness": ("brand_awareness",),
    "purchase_funnel_ratio_cards": ("purchase_funnel_ratio_cards",),
    "purchase_funnel_reference_table": ("purchase_funnel_reference_table",),
    "nps_recommend": ("nps_loyalty",),
    "sub_attribute_scatter": ("sub_attribute_scatter",),
    "overall_scatter": ("overall_scatter",),
    "sigma_intent": ("sigma_intent",),
}


def _has_text(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return len(value) > 0
    return bool(value)


def planned_narrative_sections(report_doc: Dict[str, Any], intents: List[SlideIntent]) -> List[Dict[str, Any]]:
    """Describe required narrative sections derived from persisted report payload."""
    planned: List[Dict[str, Any]] = []

    for intent in intents:
        if intent.type == SlideType.STRATEGIC_NARRATIVE:
            planned.append(
                {
                    "section_id": "strategic_narrative",
                    "title": "Strategic Narrative",
                    "markers": ["STRATEGIC ARCHITECTURE", "EXECUTIVE SUMMARY"],
                    "expected_slides": 1,
                }
            )
            continue

        if intent.type == SlideType.EXECUTIVE_SUMMARY:
            data = intent.data or {}
            if _has_text(data.get("executive_summary") or data.get("summary")):
                summary_text = data.get("executive_summary") or data.get("summary", "")
                planned.append(
                    {
                        "section_id": "executive_summary",
                        "title": "Executive Summary",
                        "markers": ["EXECUTIVE SUMMARY"],
                        "expected_slides": max(1, len(split_text_blocks(summary_text, max_chars=900, max_paragraphs=3))),
                    }
                )

            findings = data.get("key_findings") or data.get("findings", [])
            if findings:
                planned.append(
                    {
                        "section_id": "key_findings",
                        "title": "Critical Findings",
                        "markers": ["CRITICAL FINDINGS"],
                        "expected_slides": max(1, len(chunk_sequence(findings, 3))),
                    }
                )

            opportunities = data.get("opportunity_insights") or data.get("opportunities", [])
            if opportunities:
                planned.append(
                    {
                        "section_id": "opportunity_insights",
                        "title": "Opportunity Insights",
                        "markers": ["STRATEGIC INTELLIGENCE", "EXECUTION PLAYBOOK"],
                        "expected_slides": max(1, len(chunk_sequence(opportunities, 2))),
                    }
                )
            continue

        if intent.type == SlideType.STRATEGIC_INTELLIGENCE:
            data = intent.data or {}
            if _has_text(data.get("market_position_report") or data.get("report")):
                planned.append(
                    {
                        "section_id": "market_position_report",
                        "title": "Market Position Report",
                        "markers": ["MARKET ARCHETYPE", "STRATEGIC POSITIONING"],
                        "expected_slides": max(1, _strategic_intelligence_slide_count(data)),
                    }
                )
            continue

        if intent.type == SlideType.SWOT:
            brand = (intent.data or {}).get("brand", "Brand")
            planned.append(
                {
                    "section_id": f"swot::{brand}",
                    "title": f"SWOT: {brand}",
                    "markers": ["COMPETITIVE SWOT"],
                    "expected_slides": max(1, _swot_slide_count(intent.data or {})),
                }
            )
            continue

        if intent.type == SlideType.RECOMMENDATIONS_4P:
            planned.append(
                {
                    "section_id": "recommendations_4p",
                    "title": "4P Recommendations",
                    "markers": ["4P RECOMMENDATIONS"],
                    "expected_slides": max(1, _recommendations_slide_count(intent.data or {})),
                }
            )
            continue

        if intent.type == SlideType.BRAND_PROFILE:
            brand_name = (intent.data or {}).get("brand_data", {}).get("title", "Brand")
            planned.append(
                {
                    "section_id": f"brand_profile::{brand_name}",
                    "title": f"Brand Profile: {brand_name}",
                    "markers": ["BRAND PROFILES"],
                    "expected_slides": 1,
                }
            )
            continue

        if intent.type == SlideType.CONTENT_SLIDE:
            # Content slide presence is validated via render journal + shape parity checks
            # in validator._check_chart_slide_content, not narrative markers.
            continue

    return planned


def section_is_present(
    section: Dict[str, Any],
    text_markers: Dict[str, int],
    narrative_journal: List[Dict[str, Any]],
) -> bool:
    section_id = section["section_id"]
    for entry in narrative_journal:
        if entry.get("section_id") == section_id and entry.get("rendered_slides", 0) > 0:
            return True

    marker_group = "swot" if section_id.startswith("swot::") else section_id
    marker_keys = SECTION_MARKER_KEYS.get(marker_group, ())
    return any(text_markers.get(marker_key, 0) > 0 for marker_key in marker_keys)


def missing_narrative_sections(
    planned_sections: List[Dict[str, Any]],
    text_markers: Dict[str, int],
    narrative_journal: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return [
        section
        for section in planned_sections
        if not section_is_present(section, text_markers, narrative_journal)
    ]
