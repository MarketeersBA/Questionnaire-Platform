from __future__ import annotations

from typing import Any, Dict, List, Optional

from .hybrid_export.capture_validation import (
    capture_metadata_for_chart,
    evaluate_image_backed_forensics,
    index_capture_manifest,
    is_image_backed_render,
)
from .chart_fidelity_matrix import build_chart_fidelity_matrix
from .chart_render_manifest import build_chart_parity_manifest
from .narrative_render_manifest import build_narrative_render_manifest
from .narrative_requirements import SECTION_MARKER_KEYS
from .pptx_export_audit import audit_pptx_bytes, compact_export_audit


def build_chart_forensic_rows(
    *,
    fidelity_matrix: List[Dict[str, Any]],
    normalization_notes: List[Dict[str, Any]],
    render_journal: List[Dict[str, Any]],
    export_audit: Dict[str, Any],
    capture_manifest: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    journal_by_id = {
        entry.get("chart_id"): entry
        for entry in render_journal
        if entry.get("chart_id")
    }
    normalization_by_id = {
        note.get("chart_id"): note
        for note in normalization_notes
        if isinstance(note, dict) and note.get("chart_id")
    }
    slide_summaries = {
        summary.get("slide_index"): summary
        for summary in export_audit.get("slide_summaries", [])
        if summary.get("slide_index") is not None
    }
    capture_by_id = index_capture_manifest(capture_manifest)

    rows: List[Dict[str, Any]] = []
    for matrix_row in fidelity_matrix:
        chart_id = matrix_row["chart_id"]
        journal = journal_by_id.get(chart_id, {})
        slide_index = journal.get("slide_index")
        slide_summary = slide_summaries.get(slide_index, {})
        render_status = journal.get("render_status")
        capture_record = capture_by_id.get(chart_id)
        blocked_reasons: List[str] = []

        if not journal:
            blocked_reasons.append("missing_render_journal")
        elif is_image_backed_render(journal):
            blocked_reasons.extend(
                evaluate_image_backed_forensics(
                    journal_entry=journal,
                    slide_summary=slide_summary,
                    capture_record=capture_record,
                )
            )
        else:
            if render_status in {"failed", "skipped_empty_data"}:
                blocked_reasons.append(render_status)
            if slide_summary.get("has_error_placeholder"):
                blocked_reasons.append("analysis_interrupted")
            if (
                not matrix_row.get("shape_native")
                and render_status == "rendered"
                and int(slide_summary.get("chart_count", 0)) == 0
            ):
                blocked_reasons.append("missing_native_chart_shape")

        rows.append(
            {
                **matrix_row,
                "registry_key": journal.get("registry_key"),
                "render_mode": journal.get("render_mode"),
                "normalization_notes": (normalization_by_id.get(chart_id) or {}).get("notes", []),
                "render_status": render_status,
                "render_message": journal.get("render_message"),
                "slide_index": slide_index,
                "slide_chart_count": slide_summary.get("chart_count", 0),
                "slide_picture_count": slide_summary.get("picture_count", 0),
                "has_error_placeholder": bool(slide_summary.get("has_error_placeholder")),
                "capture": capture_metadata_for_chart(chart_id, capture_manifest),
                "blocked_reasons": blocked_reasons,
                "passed": not blocked_reasons,
            }
        )
    return rows


def build_narrative_forensic_rows(
    *,
    narrative_manifest: Dict[str, Any],
    export_audit: Dict[str, Any],
) -> List[Dict[str, Any]]:
    text_markers = export_audit.get("text_markers", {})
    rows: List[Dict[str, Any]] = []

    for section in narrative_manifest.get("planned_sections", []):
        section_id = section.get("section_id")
        marker_group = "swot" if str(section_id).startswith("swot::") else section_id
        marker_keys = list(SECTION_MARKER_KEYS.get(marker_group, ()))
        marker_hits = {key: int(text_markers.get(key, 0)) for key in marker_keys}
        present = section_id not in narrative_manifest.get("missing_section_ids", [])
        rows.append(
            {
                "section_id": section_id,
                "title": section.get("title"),
                "markers": marker_keys,
                "marker_hits": marker_hits,
                "expected_slides": section.get("expected_slides", 1),
                "present": present,
                "passed": present,
            }
        )
    return rows


def build_export_forensics_manifest(
    *,
    report_doc: Dict[str, Any],
    intents: List[Any],
    preparation_snapshot: Dict[str, Any],
    normalization_notes: List[Dict[str, Any]],
    render_journal: List[Dict[str, Any]],
    narrative_journal: List[Dict[str, Any]],
    certification: Dict[str, Any],
    pptx_bytes: Optional[bytes] = None,
    capture_manifest: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    export_audit = certification.get("export_audit") or {}
    if pptx_bytes and not export_audit:
        export_audit = compact_export_audit(audit_pptx_bytes(pptx_bytes))

    fidelity_matrix = build_chart_fidelity_matrix(report_doc)
    chart_parity = build_chart_parity_manifest(
        screen_chart_ids=[row["chart_id"] for row in fidelity_matrix],
        normalized_charts=report_doc.get("charts", []),
        render_journal=render_journal,
    )
    narrative_manifest = build_narrative_render_manifest(
        report_doc=report_doc,
        intents=intents,
        text_markers=export_audit.get("text_markers", {}),
        narrative_journal=narrative_journal,
    )

    chart_rows = build_chart_forensic_rows(
        fidelity_matrix=fidelity_matrix,
        normalization_notes=normalization_notes,
        render_journal=render_journal,
        export_audit=export_audit,
        capture_manifest=capture_manifest,
    )
    narrative_rows = build_narrative_forensic_rows(
        narrative_manifest=narrative_manifest,
        export_audit=export_audit,
    )

    blocked_charts = [row for row in chart_rows if not row.get("passed")]
    blocked_narrative = [row for row in narrative_rows if not row.get("passed")]

    passes_validation = bool(certification.get("passes_gate"))
    passes_chart_forensics = not blocked_charts
    passes_narrative_forensics = not blocked_narrative

    return {
        "snapshot": preparation_snapshot,
        "chart_fidelity_matrix": fidelity_matrix,
        "chart_forensics": chart_rows,
        "narrative_forensics": narrative_rows,
        "chart_parity": chart_parity,
        "narrative_render_manifest": narrative_manifest,
        "blocked_chart_count": len(blocked_charts),
        "blocked_narrative_count": len(blocked_narrative),
        "blocked_charts": blocked_charts,
        "blocked_narrative": blocked_narrative,
        "capture_validation": capture_manifest or {},
        "passes_chart_forensics": passes_chart_forensics,
        "passes_narrative_forensics": passes_narrative_forensics,
        "passes_forensic_gate": passes_validation and passes_chart_forensics and passes_narrative_forensics,
        "validation_summary": {
            "passes_gate": certification.get("passes_gate"),
            "validation_errors": certification.get("validation_errors", []),
            "validation_warnings": certification.get("validation_warnings", []),
        },
    }
