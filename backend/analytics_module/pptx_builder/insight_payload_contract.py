from __future__ import annotations

from typing import Any, Dict


def normalize_insights_for_pptx(report_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Align persisted insight payloads with narrative builders and planner expectations."""
    insights = dict(report_doc.get("insights") or {})
    if not isinstance(insights, dict):
        insights = {}

    if not insights.get("market_position_report") and insights.get("competitive_narrative"):
        insights["market_position_report"] = insights["competitive_narrative"]

    if not insights.get("key_findings") and insights.get("findings"):
        insights["key_findings"] = insights["findings"]

    if not insights.get("opportunity_insights") and insights.get("opportunities"):
        insights["opportunity_insights"] = insights["opportunities"]

    if not insights.get("executive_summary") and insights.get("summary"):
        insights["executive_summary"] = insights["summary"]

    if not insights.get("strategic_narrative") and insights.get("narrative"):
        insights["strategic_narrative"] = insights["narrative"]

    if not insights.get("broad_observations") and insights.get("observations"):
        insights["broad_observations"] = insights["observations"]

    if not insights.get("business_question") and insights.get("project_goal"):
        insights["business_question"] = insights["project_goal"]

    report_doc["insights"] = insights
    return report_doc
