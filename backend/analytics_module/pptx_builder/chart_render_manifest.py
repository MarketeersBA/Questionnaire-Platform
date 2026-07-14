from __future__ import annotations

from typing import Any, Dict, List, Optional

from .chart_payload_contract import compact_chart_contract
from .presentation_planner import PresentationPlanner, SlideIntent, SlideType


def build_chart_parity_manifest(
    *,
    screen_chart_ids: List[str],
    normalized_charts: List[Dict[str, Any]],
    render_journal: List[Dict[str, Any]],
) -> Dict[str, Any]:
    rendered_ids = [entry.get("chart_id") for entry in render_journal if entry.get("chart_id")]
    rendered_slide_ids = [entry.get("pptx_slide_id") for entry in render_journal if entry.get("pptx_slide_id")]

    missing_from_pptx = [chart_id for chart_id in screen_chart_ids if chart_id not in rendered_ids]
    extra_in_pptx = [chart_id for chart_id in rendered_ids if chart_id not in screen_chart_ids]
    order_mismatch = rendered_ids != [chart_id for chart_id in screen_chart_ids if chart_id in rendered_ids]

    return {
        "screen_chart_ids": screen_chart_ids,
        "rendered_chart_ids": rendered_ids,
        "rendered_pptx_slide_ids": rendered_slide_ids,
        "missing_from_pptx": missing_from_pptx,
        "extra_in_pptx": extra_in_pptx,
        "order_mismatch": order_mismatch,
        "rendered_count": len(render_journal),
        "screen_count": len(screen_chart_ids),
        "chart_contracts": [compact_chart_contract(chart) for chart in normalized_charts],
        "render_journal": render_journal,
    }


def collect_screen_chart_ids(report_doc: Dict[str, Any]) -> List[str]:
    ordered = PresentationPlanner.order_charts(report_doc.get("charts", []) or [])
    return [str(chart.get("chart_id")) for chart in ordered if chart.get("chart_id")]


def collect_render_journal_from_intents(
    intents: List[SlideIntent],
    render_journal: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    if render_journal:
        return render_journal

    planned: List[Dict[str, Any]] = []
    for intent in intents:
        if intent.type == SlideType.CONTENT_SLIDE and isinstance(intent.data, dict):
            planned.append(
                {
                    "chart_id": intent.data.get("chart_id"),
                    "pptx_slide_id": intent.data.get("_pptx_slide_id"),
                    "chart_type": intent.data.get("chart_type"),
                    "title": intent.data.get("title"),
                    "registry_key": (intent.data.get("_resolution") or {}).get("registry_key"),
                    "source": "planned_intent",
                }
            )
        elif intent.type == SlideType.STRATEGIC_INTELLIGENCE and isinstance(intent.data, dict):
            for chart in intent.data.get("charts", []) or []:
                if isinstance(chart, dict):
                    planned.append(
                        {
                            "chart_id": chart.get("chart_id"),
                            "pptx_slide_id": chart.get("_pptx_slide_id"),
                            "chart_type": chart.get("chart_type"),
                            "title": chart.get("title"),
                            "registry_key": (chart.get("_resolution") or {}).get("registry_key"),
                            "source": "planned_strategic_chart",
                        }
                    )
    return planned
