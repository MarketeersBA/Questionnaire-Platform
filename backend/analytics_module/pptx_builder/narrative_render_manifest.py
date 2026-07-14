from __future__ import annotations

from typing import Any, Dict, List

from .narrative_requirements import missing_narrative_sections, planned_narrative_sections
from .presentation_planner import SlideIntent


def build_narrative_render_manifest(
    *,
    report_doc: Dict[str, Any],
    intents: List[SlideIntent],
    text_markers: Dict[str, int],
    narrative_journal: List[Dict[str, Any]],
) -> Dict[str, Any]:
    planned = planned_narrative_sections(report_doc, intents)
    missing = missing_narrative_sections(planned, text_markers, narrative_journal)

    return {
        "planned_sections": planned,
        "rendered_sections": narrative_journal,
        "missing_sections": missing,
        "missing_section_ids": [section["section_id"] for section in missing],
        "passes_narrative_gate": len(missing) == 0,
    }
