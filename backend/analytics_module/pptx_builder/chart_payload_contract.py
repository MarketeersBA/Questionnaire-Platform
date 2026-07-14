from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from .chart_payload_adapters import adapt_chart_data_for_builder
from .chart_contracts import validate_against_contract
from .chart_resolver import PPTXChartResolver

CONTRACT_FIELDS = (
    "chart_id",
    "chart_type",
    "title",
    "subtitle",
    "data",
    "insight",
    "ai_headline",
    "ai_deep_analysis",
)


@dataclass(frozen=True)
class PPTXReportPreparation:
    snapshot: Dict[str, Any]
    report_doc: Dict[str, Any]
    normalized_charts: List[Dict[str, Any]]
    normalization_notes: List[Dict[str, Any]]


def capture_report_export_snapshot(report_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Capture the persisted screen-report payload before export mutation."""
    charts = [chart for chart in (report_doc.get("charts") or []) if isinstance(chart, dict)]
    insights = report_doc.get("insights") if isinstance(report_doc.get("insights"), dict) else {}

    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "report_id": str(report_doc.get("_id") or report_doc.get("report_id") or ""),
        "project_name": report_doc.get("project_name"),
        "brand": report_doc.get("brand"),
        "chart_count": len(charts),
        "chart_ids": [chart.get("chart_id") for chart in charts],
        "chart_types": [chart.get("chart_type") for chart in charts],
        "insights_keys": sorted(insights.keys()),
        "payload_hash": _hash_payload({"charts": charts, "insights": insights}),
        "charts": copy.deepcopy(charts),
    }


def prepare_report_for_pptx(
    report_doc: Dict[str, Any],
    resolver: Optional[PPTXChartResolver] = None,
) -> PPTXReportPreparation:
    snapshot = capture_report_export_snapshot(report_doc)
    chart_resolver = resolver or PPTXChartResolver()
    normalized_charts: List[Dict[str, Any]] = []
    normalization_notes: List[Dict[str, Any]] = []

    for index, chart in enumerate(snapshot["charts"]):
        normalized, notes = normalize_chart_for_pptx(chart, index, chart_resolver)
        normalized_charts.append(normalized)
        if notes:
            normalization_notes.append(
                {
                    "chart_id": normalized.get("chart_id"),
                    "chart_type": normalized.get("chart_type"),
                    "registry_key": normalized.get("_resolution", {}).get("registry_key"),
                    "notes": notes,
                }
            )

    prepared_report = copy.deepcopy(report_doc)
    prepared_report["charts"] = normalized_charts
    return PPTXReportPreparation(
        snapshot=snapshot,
        report_doc=prepared_report,
        normalized_charts=normalized_charts,
        normalization_notes=normalization_notes,
    )


def normalize_chart_for_pptx(
    chart: Dict[str, Any],
    index: int,
    resolver: Optional[PPTXChartResolver] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    chart_resolver = resolver or PPTXChartResolver()
    contract = _extract_contract_chart(chart, index)
    contract_errors = validate_against_contract(contract)
    if contract_errors:
        contract["_contract_errors"] = contract_errors
    resolution = chart_resolver.resolve(contract)
    adapted_data, adapter_notes = adapt_chart_data_for_builder(resolution.registry_key, contract)
    adapted_data, shape_notes = _normalize_builder_data_shape(
        resolution.registry_key,
        adapted_data,
    )
    adapter_notes.extend(shape_notes)

    contract["data"] = adapted_data
    contract["_resolution"] = {
        "registry_key": resolution.registry_key,
        "source": resolution.source,
        "uses_fallback_table": resolution.uses_fallback_table,
    }
    contract["_pptx_slide_id"] = _build_pptx_slide_id(contract)
    if contract_errors:
        adapter_notes.append("contract_validation_failed")
    return contract, adapter_notes


def compact_chart_contract(chart: Dict[str, Any]) -> Dict[str, Any]:
    compact = {field: chart.get(field) for field in CONTRACT_FIELDS}
    compact["pptx_slide_id"] = chart.get("_pptx_slide_id")
    compact["resolution"] = chart.get("_resolution", {})
    return compact


def _extract_contract_chart(chart: Dict[str, Any], index: int) -> Dict[str, Any]:
    chart_id = chart.get("chart_id") or chart.get("id") or f"chart_{index + 1}"
    chart_type = chart.get("chart_type") or chart.get("type") or "table"
    title = chart.get("title") or chart.get("name") or f"Chart {index + 1}"
    subtitle = chart.get("subtitle")
    data = chart.get("data") if isinstance(chart.get("data"), dict) else {}
    insight = _as_text(chart.get("insight") or chart.get("neural_insight"))
    ai_headline = _as_text(
        chart.get("ai_headline")
        or chart.get("insight_headline")
        or chart.get("headline")
    )
    ai_deep_analysis = _as_deep_analysis(
        chart.get("ai_deep_analysis")
        or chart.get("deep_analysis")
        or chart.get("analysis_points")
    )

    return {
        "chart_id": str(chart_id),
        "chart_type": str(chart_type),
        "title": str(title),
        "subtitle": subtitle,
        "data": copy.deepcopy(data),
        "insight": insight,
        "ai_headline": ai_headline,
        "ai_deep_analysis": ai_deep_analysis,
    }


def _build_pptx_slide_id(chart: Dict[str, Any]) -> str:
    return f"{chart.get('chart_id')}::{chart.get('chart_type')}"


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_deep_analysis(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        return [{"text": value.strip()}]
    if isinstance(value, dict):
        return [value]
    return []


def _hash_payload(payload: Dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:16]


def _normalize_builder_data_shape(
    registry_key: str,
    data: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    if not isinstance(data, dict):
        return {}, ["builder_data_not_object"]

    normalized = copy.deepcopy(data)

    if registry_key == "importance_combined":
        main_scatter = normalized.get("main_scatter")
        sub_scatter = normalized.get("sub_scatter")
        if isinstance(main_scatter, dict):
            normalized_main, main_notes = _normalize_builder_data_shape("scatter_plot", main_scatter)
            normalized["main_scatter"] = normalized_main
            notes.extend(f"importance_main::{note}" for note in main_notes)
        if isinstance(sub_scatter, dict):
            normalized_sub, sub_notes = _normalize_builder_data_shape(
                "scatter_plot",
                {"datasets": sub_scatter.get("datasets", [])},
            )
            normalized["sub_scatter"] = {
                **sub_scatter,
                "datasets": normalized_sub.get("datasets", []),
            }
            notes.extend(f"importance_sub::{note}" for note in sub_notes)
        return normalized, notes

    if registry_key in {"sigma_intent", "sigma_intent_scatter"}:
        datasets = normalized.get("datasets")
        if isinstance(datasets, dict):
            for attribute, points in list(datasets.items()):
                if not isinstance(points, list):
                    datasets[attribute] = []
                    continue
                for point in points:
                    if not isinstance(point, dict):
                        continue
                    point["x"] = _to_float(point.get("x", 0))
                    point["y"] = _to_float(point.get("y", 0))
                    if "label" not in point:
                        point["label"] = point.get("brand") or point.get("name") or attribute
            notes.append("normalized_sigma_dict_points")
            return normalized, notes
        return _normalize_builder_data_shape("scatter_plot", normalized)

    if registry_key in {"scatter", "scatter_plot", "scatter_bubble", "positioning_matrix"}:
        datasets = normalized.get("datasets")
        if isinstance(datasets, list):
            for dataset in datasets:
                if not isinstance(dataset, dict):
                    continue
                points = dataset.get("data")
                if not isinstance(points, list):
                    dataset["data"] = []
                    continue
                for point in points:
                    if not isinstance(point, dict):
                        continue
                    point["x"] = _to_float(point.get("x", 0))
                    point["y"] = _to_float(point.get("y", 0))
            notes.append("normalized_xy_numeric_points")
        return normalized, notes

    if registry_key in {"affinity_heatmap"}:
        brands = normalized.get("brands")
        demographics = normalized.get("demographics")
        matrix = normalized.get("matrix")
        if isinstance(brands, list) and isinstance(demographics, list) and isinstance(matrix, list):
            expected_columns = len(brands)
            expected_rows = len(demographics)
            fixed_rows = []
            for row in matrix[:expected_rows]:
                if not isinstance(row, list):
                    row = []
                numeric_row = [_to_float(v) for v in row[:expected_columns]]
                if len(numeric_row) < expected_columns:
                    numeric_row.extend([0.0] * (expected_columns - len(numeric_row)))
                fixed_rows.append(numeric_row)
            while len(fixed_rows) < expected_rows:
                fixed_rows.append([0.0] * expected_columns)
            normalized["matrix"] = fixed_rows
            notes.append("normalized_affinity_heatmap_matrix")
        return normalized, notes

    if registry_key in {"brand_awareness", "awareness_waterfall", "awareness_trial_usage"}:
        labels = normalized.get("labels")
        datasets = normalized.get("datasets")
        if isinstance(labels, list) and isinstance(datasets, list):
            canonical = []
            target_len = len(labels)
            for idx, expected in enumerate(("TOM", "Other_Unaided", "Aided")):
                existing = datasets[idx] if idx < len(datasets) and isinstance(datasets[idx], dict) else {}
                values = existing.get("data", []) if isinstance(existing.get("data"), list) else []
                normalized_values = [_to_float(v) for v in values[:target_len]]
                if len(normalized_values) < target_len:
                    normalized_values.extend([0.0] * (target_len - len(normalized_values)))
                canonical.append({"label": expected, "data": normalized_values})
            normalized["datasets"] = canonical
            notes.append("normalized_waterfall_awareness_series")
        return normalized, notes

    labels = normalized.get("labels")
    datasets = normalized.get("datasets")
    if isinstance(labels, list) and isinstance(datasets, list):
        target_len = len(labels)
        changed = False
        for dataset in datasets:
            if not isinstance(dataset, dict):
                continue
            values = dataset.get("data")
            if not isinstance(values, list):
                dataset["data"] = [0.0] * target_len
                changed = True
                notes.append("filled_missing_dataset_values")
                continue
            truncated = values[:target_len]
            numeric_values = [_to_float(v) for v in truncated]
            if numeric_values != truncated:
                changed = True
            if len(numeric_values) < target_len:
                numeric_values.extend([0.0] * (target_len - len(numeric_values)))
                changed = True
                notes.append("padded_dataset_values_to_label_count")
            dataset["data"] = numeric_values
        if changed:
            notes.append("normalized_category_numeric_values")
        return normalized, notes

    return normalized, notes


def _to_float(value: Any) -> float:
    if isinstance(value, bool):
        return float(int(value))
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except Exception:
        return 0.0
