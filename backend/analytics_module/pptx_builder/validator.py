from __future__ import annotations

import io
import logging
import os
import zipfile
from typing import Any, Dict, List

import pandas as pd

from .chart_resolver import PPTXChartResolver
from .narrative_expansion import estimate_extra_slides_for_intents
from .narrative_requirements import missing_narrative_sections, planned_narrative_sections
from .pptx_export_audit import audit_pptx_bytes, compact_export_audit
from .export_validation_manifest import (
    SHAPE_BASED_CHART_TYPES,
    chart_based_content_intents,
    divider_title_allowance,
    summarize_render_journal,
)
from .hybrid_export.capture_validation import is_image_backed_render
from .validation_gating import (
    PPTXValidationMode,
    apply_validation_gate,
    issue,
    resolve_validation_mode,
)

logger = logging.getLogger(__name__)


class PPTXIntegrityValidator:
    """Deep inspection validator for native PPTX exports."""

    def __init__(self, pptx_stream: io.BytesIO):
        self.pptx_stream = pptx_stream
        self.pptx_stream.seek(0)

    async def validate(
        self,
        report_doc: Dict[str, Any],
        intents: List[Any],
        mode: PPTXValidationMode | str | None = None,
        render_journal: List[Dict[str, Any]] | None = None,
        narrative_journal: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        validation_mode = resolve_validation_mode(mode)
        expected_payloads = report_doc.get("charts", [])
        results: Dict[str, Any] = {
            "valid": False,
            "passes_gate": False,
            "validation_mode": validation_mode.value,
            "is_corrupt": False,
            "data_parity": True,
            "structural_integrity": True,
            "narrative_presence": True,
            "slide_count": 0,
            "unsupported_count": 0,
            "error_placeholder_count": 0,
            "notes_count": 0,
            "layout_warning_count": 0,
            "duplicate_title_count": 0,
            "layout_warnings": [],
            "missing_narrative_sections": [],
            "render_tally": summarize_render_journal(render_journal or []),
            "export_audit": {},
            "validation_errors": [],
            "validation_warnings": [],
            "discrepancies": [],
            "issues": [],
        }

        try:
            pptx_bytes = self.pptx_stream.getvalue()
            artifact = audit_pptx_bytes(pptx_bytes)
            results["export_audit"] = compact_export_audit(artifact)
            results["slide_count"] = artifact["slide_count"]
            results["unsupported_count"] = artifact["unsupported_placeholder_count"]
            results["error_placeholder_count"] = artifact["error_placeholder_count"]
            results["layout_warning_count"] = artifact["layout_warning_count"]
            results["duplicate_title_count"] = artifact["duplicate_title_count"]
            results["layout_warnings"] = artifact.get("layout_warnings", [])
            results["notes_count"] = artifact.get("notes_count", 0)
            results["issues"].extend(
                issue
                for issue in artifact.get("geometry_issues", [])
                if issue.get("code") != "duplicate_title"
            )

            for summary in artifact.get("slide_summaries", []):
                slide_index = summary.get("slide_index")
                if summary.get("has_unsupported_placeholder"):
                    results["issues"].append(
                        issue(
                            "unsupported_placeholder",
                            f"Unsupported renderer placeholder detected on slide {slide_index}.",
                            severity="critical",
                            slide_index=slide_index,
                        )
                    )
                if summary.get("has_error_placeholder"):
                    results["issues"].append(
                        issue(
                            "error_placeholder",
                            f"Error placeholder detected on slide {slide_index}.",
                            severity="critical",
                            slide_index=slide_index,
                        )
                    )

            strategic_expansion = estimate_extra_slides_for_intents(intents)
            expected_min = len(intents)
            expected_max = len(intents) + strategic_expansion + 2
            if not (expected_min <= artifact["slide_count"] <= expected_max):
                results["structural_integrity"] = False
                results["issues"].append(
                    issue(
                        "structural_integrity",
                        (
                            f"Slide count mismatch: expected {expected_min}-{expected_max}, "
                            f"found {artifact['slide_count']}."
                        ),
                        severity="critical",
                    )
                )

            if artifact.get("overview_slide_count", 0) > 1:
                results["structural_integrity"] = False
                results["issues"].append(
                    issue(
                        "duplicate_overview",
                        (
                            "Duplicate overview slides detected: "
                            f"{artifact['overview_slide_count']}."
                        ),
                        severity="critical",
                    )
                )

            resolver = PPTXChartResolver()
            predicted_unsupported = resolver.count_unsupported(report_doc.get("charts", []))
            results["unsupported_count"] = max(results["unsupported_count"], predicted_unsupported)

            results["issues"].extend(
                self._check_required_narrative_presence(
                    report_doc,
                    intents,
                    artifact.get("text_markers", {}),
                    narrative_journal or [],
                )
            )
            missing_narrative = missing_narrative_sections(
                planned_narrative_sections(report_doc, intents),
                artifact.get("text_markers", {}),
                narrative_journal or [],
            )
            results["missing_narrative_sections"] = missing_narrative
            results["issues"].extend(self._check_render_journal(render_journal or []))
            results["issues"].extend(self._check_duplicate_titles(artifact, intents))
            results["issues"].extend(
                self._check_chart_slide_content(artifact, render_journal or [], intents)
            )
            results["issues"].extend(self._check_planned_chart_coverage(report_doc, intents))
            results["issues"].extend(self._check_fallback_table_policy(report_doc))
            results["issues"].extend(self._check_branding_placeholders(report_doc, pptx_bytes))
            results["issues"].extend(
                self._check_ai_sections_when_insights_exist(
                    report_doc,
                    artifact.get("text_markers", {}),
                    narrative_journal or [],
                )
            )

            chart_based_intents = chart_based_content_intents(intents)

            with zipfile.ZipFile(io.BytesIO(pptx_bytes)) as zf:
                embedded_excels = [
                    name for name in zf.namelist() if "embeddings/Microsoft_Excel" in name
                ]
                expected_count = len(chart_based_intents)
                if expected_count > 0:
                    parity_ratio = len(embedded_excels) / expected_count
                    if parity_ratio < 0.9:
                        results["data_parity"] = False
                        results["issues"].append(
                            issue(
                                "data_parity",
                                (
                                    f"Chart data loss risk: found {len(embedded_excels)} embedded "
                                    f"Excels for {expected_count} chart-based slides."
                                ),
                                severity="critical",
                            )
                        )

                for excel_path in embedded_excels[:3]:
                    try:
                        dataframe = pd.read_excel(io.BytesIO(zf.read(excel_path)))
                        if not self._verify_sample(dataframe, expected_payloads):
                            results["data_parity"] = False
                            results["issues"].append(
                                issue(
                                    "data_parity",
                                    f"Data verification failed for embedded workbook: {excel_path}.",
                                    severity="critical",
                                )
                            )
                    except Exception:
                        logger.debug("Skipped embedded workbook sampling for %s", excel_path, exc_info=True)

            if not artifact.get("presentation_readable", False):
                results["issues"].append(
                    issue(
                        "corrupt_package",
                        (
                            "Unable to parse PPTX presentation for geometry audit: "
                            f"{artifact.get('presentation_error', 'unknown error')}"
                        ),
                        severity="critical",
                    )
                )
                results["is_corrupt"] = True

            if not results["structural_integrity"] and not any(
                item["code"] == "structural_integrity" for item in results["issues"]
            ):
                results["issues"].append(
                    issue(
                        "structural_integrity",
                        "Structural integrity checks failed.",
                        severity="critical",
                    )
                )
            if not results["data_parity"] and not any(
                item["code"] == "data_parity" for item in results["issues"]
            ):
                results["issues"].append(
                    issue(
                        "data_parity",
                        "Embedded chart data parity checks failed.",
                        severity="critical",
                    )
                )
            if any(item["code"] == "missing_required_ai_section" for item in results["issues"]):
                results["narrative_presence"] = False

            results["discrepancies"] = [item["message"] for item in results["issues"]]
            return apply_validation_gate(results, validation_mode)

        except zipfile.BadZipFile:
            corrupt_report = {
                **results,
                "valid": False,
                "passes_gate": False,
                "is_corrupt": True,
                "issues": [
                    issue(
                        "corrupt_package",
                        "Invalid ZIP package.",
                        severity="critical",
                    )
                ],
                "discrepancies": ["Invalid ZIP package"],
            }
            return apply_validation_gate(corrupt_report, validation_mode)
        except Exception as exc:
            logger.error("[PPTXIntegrityValidator] Validation failed: %s", exc, exc_info=True)
            failed_report = {
                **results,
                "valid": False,
                "passes_gate": False,
                "issues": [
                    issue(
                        "validator_failure",
                        str(exc),
                        severity="critical",
                    )
                ],
                "discrepancies": [str(exc)],
                "error": str(exc),
            }
            return apply_validation_gate(failed_report, validation_mode)

    def _check_render_journal(self, render_journal: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        for entry in render_journal:
            status = entry.get("render_status")
            chart_id = entry.get("chart_id") or entry.get("pptx_slide_id") or "unknown"
            slide_index = entry.get("slide_index")
            message = entry.get("render_message") or "No render message provided."

            if status == "skipped_empty_data":
                issues.append(
                    issue(
                        "empty_chart_slide",
                        f"Chart '{chart_id}' rendered without native content: {message}",
                        severity="critical",
                        slide_index=slide_index,
                    )
                )
            elif status == "failed":
                issues.append(
                    issue(
                        "chart_render_failed",
                        f"Chart '{chart_id}' failed during native rendering: {message}",
                        severity="critical",
                        slide_index=slide_index,
                    )
                )
        return issues

    def _check_duplicate_titles(
        self,
        artifact: Dict[str, Any],
        intents: List[Any],
    ) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        allowance = divider_title_allowance(intents)

        for duplicate in artifact.get("duplicate_titles", []):
            title = str(duplicate.get("title", "")).strip().upper()
            count = int(duplicate.get("count", 0))
            allowed = max(allowance.get(title, 0), 1)
            excess = count - allowed
            if excess <= 0:
                continue
            issues.append(
                issue(
                    "duplicate_title",
                    (
                        f"Duplicate slide title '{title}' appears {count} times; "
                        f"only {allowed} repetition(s) are allowed for section dividers."
                    ),
                    severity="warning",
                )
            )
        return issues

    def _check_chart_slide_content(
        self,
        artifact: Dict[str, Any],
        render_journal: List[Dict[str, Any]],
        intents: List[Any],
    ) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        slide_summaries = {
            summary.get("slide_index"): summary
            for summary in artifact.get("slide_summaries", [])
            if summary.get("slide_index") is not None
        }

        for entry in render_journal:
            status = entry.get("render_status")
            slide_index = entry.get("slide_index")
            chart_id = entry.get("chart_id") or entry.get("pptx_slide_id") or "unknown"
            chart_type = entry.get("chart_type")
            summary = slide_summaries.get(slide_index, {})

            if status == "rendered" and chart_type not in SHAPE_BASED_CHART_TYPES:
                if is_image_backed_render(entry):
                    picture_count = int(summary.get("picture_count", 0))
                    if picture_count == 0 and not summary.get("has_error_placeholder"):
                        issues.append(
                            issue(
                                "empty_chart_slide",
                                (
                                    f"Chart '{chart_id}' on slide {slide_index} rendered without a captured image shape."
                                ),
                                severity="critical",
                                slide_index=slide_index,
                            )
                        )
                else:
                    chart_count = int(summary.get("chart_count", 0))
                    if chart_count == 0 and not summary.get("has_error_placeholder"):
                        issues.append(
                            issue(
                                "empty_chart_slide",
                                (
                                    f"Chart '{chart_id}' on slide {slide_index} rendered without a native chart shape."
                                ),
                                severity="critical",
                                slide_index=slide_index,
                            )
                        )
            elif status not in {"rendered", "skipped_empty_data", "failed"}:
                issues.append(
                    issue(
                        "empty_chart_slide",
                        f"Chart '{chart_id}' on slide {slide_index} has no render status.",
                        severity="critical",
                        slide_index=slide_index,
                    )
                )

        if not render_journal and chart_based_content_intents(intents):
            issues.append(
                issue(
                    "empty_chart_slide",
                    "Chart slides were planned but no render journal entries were recorded.",
                    severity="critical",
                )
            )

        return issues

    def _check_required_narrative_presence(
        self,
        report_doc: Dict[str, Any],
        intents: List[Any],
        text_markers: Dict[str, int],
        narrative_journal: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        planned = planned_narrative_sections(report_doc, intents)
        missing = missing_narrative_sections(planned, text_markers, narrative_journal)

        for section in missing:
            issues.append(
                issue(
                    "missing_required_ai_section",
                    f"{section['title']} was planned but no narrative slide was found.",
                    severity="critical",
                )
            )

        return issues

    def _check_planned_chart_coverage(self, report_doc: Dict[str, Any], intents: List[Any]) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        source_ids = {
            str(chart.get("chart_id"))
            for chart in (report_doc.get("charts") or [])
            if isinstance(chart, dict) and chart.get("chart_id")
        }
        if not source_ids:
            return issues

        planned_ids: set[str] = set()
        for intent in intents:
            intent_type = getattr(intent.type, "value", None)
            payload = intent.data if isinstance(getattr(intent, "data", None), dict) else {}
            if intent_type == "content_slide":
                chart_id = payload.get("chart_id")
                if chart_id:
                    planned_ids.add(str(chart_id))
            elif intent_type == "strategic_intelligence":
                for chart in payload.get("charts", []) or []:
                    if isinstance(chart, dict) and chart.get("chart_id"):
                        planned_ids.add(str(chart.get("chart_id")))

        orphaned = sorted(planned_ids - source_ids)
        for chart_id in orphaned:
            issues.append(
                issue(
                    "planned_chart_missing",
                    f"Planned chart '{chart_id}' is missing from report payload charts[].",
                    severity="critical",
                )
            )
        return issues

    def _check_fallback_table_policy(self, report_doc: Dict[str, Any]) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        whitelist_raw = os.getenv("PPTX_FALLBACK_TABLE_WHITELIST", "")
        whitelist = {token.strip() for token in whitelist_raw.split(",") if token.strip()}
        for chart in report_doc.get("charts", []) or []:
            if not isinstance(chart, dict):
                continue
            resolution = chart.get("_resolution", {})
            uses_fallback = bool(resolution.get("uses_fallback_table"))
            if not uses_fallback:
                continue
            chart_id = str(chart.get("chart_id") or "")
            chart_type = str(chart.get("chart_type") or "")
            if chart_id in whitelist or chart_type in whitelist:
                continue
            issues.append(
                issue(
                    "fallback_table_not_whitelisted",
                    (
                        f"Chart '{chart_id or chart_type}' resolved to fallback table and is not whitelisted "
                        "via PPTX_FALLBACK_TABLE_WHITELIST."
                    ),
                    severity="critical",
                )
            )
        return issues

    def _check_branding_placeholders(self, report_doc: Dict[str, Any], pptx_bytes: bytes) -> List[Dict[str, Any]]:
        issues: List[Dict[str, Any]] = []
        metadata = report_doc.get("metadata") or {}
        if not isinstance(metadata, dict):
            return issues

        checks = {
            "project_title": str(metadata.get("title") or metadata.get("project_name") or "").strip(),
            "company_name": str(metadata.get("company_name") or metadata.get("brand") or "").strip(),
            "report_date": str(metadata.get("date") or "").strip(),
        }
        expected_tokens = [value.upper() for value in checks.values() if value]
        if not expected_tokens:
            return issues

        with zipfile.ZipFile(io.BytesIO(pptx_bytes)) as zf:
            slide_xml = "\n".join(
                zf.read(name).decode("utf-8", errors="ignore")
                for name in zf.namelist()
                if name.startswith("ppt/slides/slide") and name.endswith(".xml")
            ).upper()

        for token in expected_tokens:
            if token not in slide_xml:
                issues.append(
                    issue(
                        "branding_placeholder_missing",
                        f"Branding placeholder text '{token}' not found in exported slides.",
                        severity="critical",
                    )
                )
        return issues

    def _check_ai_sections_when_insights_exist(
        self,
        report_doc: Dict[str, Any],
        text_markers: Dict[str, int],
        narrative_journal: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        insights = report_doc.get("insights") or {}
        if not isinstance(insights, dict):
            return []

        journal_sections = {str(entry.get("section_id")) for entry in narrative_journal if entry.get("section_id")}
        checks = [
            ("executive_summary", bool(insights.get("executive_summary")), "executive_summary"),
            ("brand_swot", bool(insights.get("brand_swot")), "competitive_swot"),
            ("recommendations_4p", bool(insights.get("recommendations_4p")), "recommendations_4p"),
            ("opportunity_insights", bool(insights.get("opportunity_insights")), "execution_playbook"),
            ("market_position_report", bool(insights.get("market_position_report")), "strategic_positioning"),
        ]

        issues: List[Dict[str, Any]] = []
        for section_id, has_content, marker_key in checks:
            if not has_content:
                continue
            marker_count = int(text_markers.get(marker_key, 0))
            journal_hit = any(section_id in section for section in journal_sections)
            if marker_count <= 0 and not journal_hit:
                issues.append(
                    issue(
                        "missing_required_ai_section",
                        (
                            f"AI section '{section_id}' has report insights but is missing from exported deck "
                            f"(marker='{marker_key}')."
                        ),
                        severity="critical",
                    )
                )
        return issues

    def _verify_sample(self, dataframe: pd.DataFrame, payloads: List[Dict[str, Any]]) -> bool:
        excel_values = set()
        for value in dataframe.values.flatten():
            if isinstance(value, (int, float)) and not pd.isna(value):
                excel_values.add(round(float(value), 2))

        if not excel_values:
            return True

        for payload in payloads:
            source_values = self._extract_source_values(payload.get("data", {}))
            rounded_source = {
                round(float(value), 2) for value in source_values if isinstance(value, (int, float))
            }
            if excel_values.intersection(rounded_source):
                return True

        return False

    def _extract_source_values(self, data: Any) -> set:
        values = set()
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    values.update(self._extract_source_values(item))
                elif isinstance(item, (int, float)):
                    values.add(item)
        elif isinstance(data, dict):
            for value in data.values():
                if isinstance(value, (int, float)):
                    values.add(value)
                elif isinstance(value, (list, dict)):
                    values.update(self._extract_source_values(value))
        return values
