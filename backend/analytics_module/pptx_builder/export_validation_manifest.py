from __future__ import annotations

from typing import Any, Dict, List, Optional

from .hybrid_export.capture_validation import summarize_capture_manifest
from .presentation_planner import SlideIntent, SlideType


SHAPE_BASED_CHART_TYPES = {
    "criteria_table",
    "funnel_ratio_cards",
    "funnel_cards",
    "purchase_funnel_ratio_cards",
    "scorecard",
    "brand_summary",
    "verbatim_analysis",
    "verbatim_summary",
    "qualitative_analysis",
    "wordcloud",
    "verbatim_cloud",
    "affinity_heatmap",
    "table",
    "reference_table",
}


def summarize_render_journal(render_journal: List[Dict[str, Any]]) -> Dict[str, int]:
    rendered_chart_count = 0
    failed_chart_count = 0
    skipped_empty_data_count = 0
    image_capture_count = 0
    native_render_count = 0

    for entry in render_journal:
        status = entry.get("render_status")
        if status == "rendered":
            rendered_chart_count += 1
        elif status == "failed":
            failed_chart_count += 1
        elif status == "skipped_empty_data":
            skipped_empty_data_count += 1

        render_mode = entry.get("render_mode") or entry.get("registry_key")
        if render_mode == "image_capture":
            image_capture_count += 1
        else:
            native_render_count += 1

    return {
        "rendered_chart_count": rendered_chart_count,
        "failed_chart_count": failed_chart_count,
        "skipped_empty_data_count": skipped_empty_data_count,
        "image_capture_count": image_capture_count,
        "native_render_count": native_render_count,
    }


def build_export_manifest(
    *,
    report_id: str,
    generated_at: str,
    template_hash: str,
    certification: Dict[str, Any],
    report_doc: Dict[str, Any],
    preparation_snapshot: Dict[str, Any],
    chart_normalization_notes: List[str],
    chart_parity: Dict[str, Any],
    narrative_render_manifest: Dict[str, Any],
    layout_geometry: Dict[str, Any],
    actual_slide_count: int,
    capture_manifest: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    export_audit = certification.get("export_audit", {})
    render_tally = certification.get("render_tally", {})
    capture_validation = summarize_capture_manifest(capture_manifest)

    return {
        "report_id": str(report_id),
        "generated_at": generated_at,
        "template_hash": template_hash,
        "validation_mode": certification.get("validation_mode"),
        "passes_gate": certification.get("passes_gate", False),
        "total_slides": certification.get("slide_count", actual_slide_count),
        "rendered_chart_count": render_tally.get("rendered_chart_count", 0),
        "failed_chart_count": render_tally.get("failed_chart_count", 0),
        "skipped_empty_data_count": render_tally.get("skipped_empty_data_count", 0),
        "image_capture_count": render_tally.get("image_capture_count", 0),
        "native_render_count": render_tally.get("native_render_count", 0),
        "capture_validation": capture_validation,
        "capture_manifest": capture_manifest or {},
        "chart_count": len(report_doc.get("charts", [])),
        "unsupported_count": certification.get("unsupported_count", 0),
        "error_placeholder_count": certification.get("error_placeholder_count", 0),
        "notes_count": export_audit.get("notes_count", certification.get("notes_count", 0)),
        "duplicate_title_count": certification.get("duplicate_title_count", 0),
        "layout_warning_count": certification.get("layout_warning_count", 0),
        "layout_warnings": certification.get("layout_warnings", []),
        "missing_narrative_sections": certification.get("missing_narrative_sections", []),
        "validation_errors": certification.get("validation_errors", []),
        "validation_warnings": certification.get("validation_warnings", []),
        "validation_summary": certification,
        "export_audit": export_audit,
        "report_payload_snapshot": preparation_snapshot,
        "chart_normalization_notes": chart_normalization_notes,
        "chart_parity": chart_parity,
        "narrative_render_manifest": narrative_render_manifest,
        "layout_geometry": layout_geometry,
        "planner_version": "2.0_hardened",
    }


def divider_title_allowance(intents: List[SlideIntent]) -> Dict[str, int]:
    allowance: Dict[str, int] = {}
    for intent in intents:
        if intent.type != SlideType.SECTION_DIVIDER:
            continue
        title = (intent.title or "").strip().upper()
        if title:
            allowance[title] = allowance.get(title, 0) + 1
    return allowance


def chart_based_content_intents(intents: List[SlideIntent]) -> List[SlideIntent]:
    chart_intents: List[SlideIntent] = []
    for intent in intents:
        if intent.type != SlideType.CONTENT_SLIDE:
            continue
        chart_type = (intent.data or {}).get("chart_type")
        if chart_type in SHAPE_BASED_CHART_TYPES:
            continue
        chart_intents.append(intent)
    return chart_intents
