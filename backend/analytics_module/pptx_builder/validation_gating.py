from __future__ import annotations

import os
from enum import Enum
from typing import Any, Dict, List, Literal

IssueSeverity = Literal["critical", "warning"]


class PPTXValidationMode(str, Enum):
    QA = "qa"
    PRODUCTION = "production"


ALWAYS_CRITICAL_ISSUE_CODES = {
    "corrupt_package",
    "unsupported_placeholder",
    "error_placeholder",
    "missing_required_ai_section",
    "structural_integrity",
    "data_parity",
    "empty_chart_slide",
    "chart_render_failed",
    "validator_failure",
}

PRODUCTION_ONLY_CRITICAL_ISSUE_CODES = {
    "layout_out_of_bounds",
    "duplicate_title",
}


def resolve_validation_mode(explicit: PPTXValidationMode | str | None = None) -> PPTXValidationMode:
    if isinstance(explicit, PPTXValidationMode):
        return explicit
    if isinstance(explicit, str):
        normalized = explicit.strip().lower()
        if normalized in {"production", "prod", "strict"}:
            return PPTXValidationMode.PRODUCTION
        return PPTXValidationMode.QA

    raw = os.environ.get("PPTX_VALIDATION_MODE", "qa").strip().lower()
    if raw in {"production", "prod", "strict"}:
        return PPTXValidationMode.PRODUCTION
    return PPTXValidationMode.QA


def resolve_issue_severity(
    code: str,
    mode: PPTXValidationMode,
    *,
    default: IssueSeverity = "warning",
) -> IssueSeverity:
    if code in ALWAYS_CRITICAL_ISSUE_CODES:
        return "critical"
    if code in PRODUCTION_ONLY_CRITICAL_ISSUE_CODES and mode == PPTXValidationMode.PRODUCTION:
        return "critical"
    return default


def normalize_issues_for_mode(issues: List[Dict[str, Any]], mode: PPTXValidationMode) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for item in issues:
        payload = dict(item)
        payload["severity"] = resolve_issue_severity(
            payload.get("code", ""),
            mode,
            default=payload.get("severity", "warning"),
        )
        normalized.append(payload)
    return normalized


def apply_validation_gate(report: Dict[str, Any], mode: PPTXValidationMode) -> Dict[str, Any]:
    """Apply export gating rules on top of a completed validation report."""
    issues = normalize_issues_for_mode(report.get("issues", []), mode)
    report["issues"] = issues

    critical_issues = [item for item in issues if item.get("severity") == "critical"]
    warning_issues = [item for item in issues if item.get("severity") == "warning"]

    report["validation_mode"] = mode.value
    report["validation_errors"] = [issue["message"] for issue in critical_issues]
    report["validation_warnings"] = [issue["message"] for issue in warning_issues]
    report["layout_warning_count"] = len(report.get("layout_warnings", []))

    if report.get("is_corrupt"):
        report["passes_gate"] = False
        report["valid"] = False
        return report

    if mode == PPTXValidationMode.PRODUCTION:
        report["passes_gate"] = len(critical_issues) == 0
        report["valid"] = report["passes_gate"]
        return report

    report["passes_gate"] = not report.get("is_corrupt")
    report["valid"] = len(critical_issues) == 0
    return report


def issue(
    code: str,
    message: str,
    *,
    severity: IssueSeverity = "warning",
    slide_index: int | None = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "code": code,
        "message": message,
        "severity": severity,
    }
    if slide_index is not None:
        payload["slide_index"] = slide_index
    return payload
