from __future__ import annotations

from typing import Any, Callable, Dict, List, Tuple

NPS_SEGMENT_LABELS = {"Promoters_Pct", "Passives_Pct", "Detractors_Pct", "Promoters", "Passives", "Detractors"}


def adapt_chart_data_for_builder(registry_key: str, chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    """Transform frontend-shaped chart payloads into builder-native data."""
    data = chart.get("data")
    if not isinstance(data, dict):
        return {}, ["data_not_object"]

    adapter = _ADAPTER_BY_REGISTRY.get(registry_key, _adapt_category_chart_data)
    return adapter(data, chart)


def _adapt_category_chart_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    normalized = dict(data)

    if "labels" in normalized and "datasets" in normalized:
        return normalized, notes

    if "rows" in normalized and "columns" in normalized:
        rows = normalized.get("rows") or []
        columns = normalized.get("columns") or []
        labels = [str(row[0]) if row else "" for row in rows]
        datasets = []
        for column_index, column_name in enumerate(columns):
            values = []
            for row in rows:
                if len(row) > column_index + 1:
                    values.append(row[column_index + 1])
            datasets.append({"label": str(column_name), "data": values})
        notes.append("converted_rows_columns_to_labels_datasets")
        return {"labels": labels, "datasets": datasets}, notes

    if "matrix" in normalized and isinstance(normalized["matrix"], dict):
        matrix = normalized["matrix"]
        labels = [str(label) for label in matrix.keys()]
        datasets = [{"label": chart.get("title") or "Series", "data": list(matrix.values())}]
        notes.append("converted_matrix_to_labels_datasets")
        return {"labels": labels, "datasets": datasets}, notes

    notes.append("category_chart_missing_labels_datasets")
    return normalized, notes


def _adapt_grouped_bar_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_horizontal_bar_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_stacked_bar_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_snake_line_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_brand_comparison_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_radar_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    return _adapt_category_chart_data(data, chart)


def _adapt_xy_scatter_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    datasets = data.get("datasets")
    if not isinstance(datasets, list):
        return dict(data), ["scatter_missing_datasets"]

    normalized_datasets = []
    for dataset in datasets:
        if not isinstance(dataset, dict):
            continue
        points = dataset.get("data", [])
        normalized_points = []
        for point in points:
            if isinstance(point, dict):
                normalized_points.append(
                    {
                        "x": point.get("x", point.get("x_val", point.get("impact", 0))),
                        "y": point.get("y", point.get("y_val", point.get("performance", 0))),
                        "label": point.get(
                            "label",
                            point.get("name", point.get("brand", point.get("attribute"))),
                        ),
                    }
                )
            else:
                normalized_points.append({"x": 0, "y": 0})
        normalized_datasets.append(
            {
                "label": dataset.get("label", chart.get("title") or "Series"),
                "data": normalized_points,
            }
        )

    if normalized_datasets:
        notes.append("normalized_scatter_points")
    return {"datasets": normalized_datasets}, notes


def _adapt_sigma_intent_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    normalized: Dict[str, Any] = dict(data)
    datasets = data.get("datasets")

    if isinstance(datasets, dict):
        normalized_points_by_attr: Dict[str, List[Dict[str, Any]]] = {}
        for attribute, points in datasets.items():
            if not isinstance(points, list):
                continue
            adapted, scatter_notes = _adapt_xy_scatter_data(
                {"datasets": [{"label": str(attribute), "data": points}]},
                chart,
            )
            normalized_series = adapted.get("datasets", [])
            normalized_points_by_attr[str(attribute)] = (
                normalized_series[0].get("data", []) if normalized_series else []
            )
            notes.extend(scatter_notes)
        normalized["datasets"] = normalized_points_by_attr
        notes.append("normalized_sigma_attribute_datasets")
        return normalized, notes

    if isinstance(datasets, list):
        adapted, scatter_notes = _adapt_xy_scatter_data({"datasets": datasets}, chart)
        normalized["datasets"] = adapted.get("datasets", [])
        notes.extend(scatter_notes)
        return normalized, notes

    normalized["datasets"] = []
    notes.append("sigma_missing_datasets")
    return normalized, notes


def _adapt_gauge_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    labels = data.get("labels") or []
    datasets = data.get("datasets") or []
    if labels and all(str(label) in NPS_SEGMENT_LABELS for label in labels) and datasets:
        brands = [str(dataset.get("label", f"Brand {index + 1}")) for index, dataset in enumerate(datasets)]
        promoters = []
        passives = []
        detractors = []
        for dataset in datasets:
            values = dataset.get("data", [])
            detractors.append(values[2] if len(values) > 2 else 0)
            passives.append(values[1] if len(values) > 1 else 0)
            promoters.append(values[0] if len(values) > 0 else 0)
        return {
            "labels": brands,
            "datasets": [
                {"label": "Detractors", "data": detractors},
                {"label": "Passives", "data": passives},
                {"label": "Promoters", "data": promoters},
            ],
            "nps_scores": data.get("nps_scores", {}),
        }, ["transposed_nps_segment_rows_to_brand_rows"]

    adapted, notes = _adapt_category_chart_data(data, chart)
    if "nps_scores" not in adapted and isinstance(data.get("nps_scores"), dict):
        adapted["nps_scores"] = data["nps_scores"]
    return adapted, notes


def _adapt_wordcloud_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if isinstance(data.get("words"), list):
        words = []
        for item in data["words"]:
            if not isinstance(item, dict):
                continue
            words.append(
                {
                    "text": item.get("text") or item.get("term") or item.get("label"),
                    "value": item.get("value", item.get("weight", item.get("count", 0))),
                }
            )
        return {"words": words, **{key: value for key, value in data.items() if key != "words"}}, []

    terms = data.get("terms") or data.get("items")
    if isinstance(terms, list):
        words = []
        for item in terms:
            if isinstance(item, dict):
                words.append(
                    {
                        "text": item.get("text") or item.get("term") or item.get("label"),
                        "value": item.get("value", item.get("count", 0)),
                    }
                )
        return {"words": words, **{key: value for key, value in data.items() if key not in {"terms", "items"}}}, [
            "converted_terms_to_words"
        ]

    return dict(data), ["wordcloud_missing_words"]


def _adapt_scorecard_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if isinstance(data.get("metrics"), list) and data["metrics"]:
        return dict(data), []

    profile = data.get("profile")
    if isinstance(profile, dict):
        metrics = []
        for label, value in profile.items():
            if str(label).lower() in {"brand", "total sample"}:
                continue
            metrics.append({"label": str(label), "value": value})
        return {
            "brand": profile.get("Brand") or chart.get("title") or "Brand",
            "n_size": profile.get("Total Sample", data.get("n_size", 0)),
            "metrics": metrics or [{"label": key, "value": value} for key, value in profile.items()],
        }, ["converted_profile_to_scorecard_metrics"]

    return dict(data), ["scorecard_missing_metrics"]


def _adapt_verbatim_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if isinstance(data.get("brands"), dict) or data.get("synthesis") or data.get("analysis"):
        return dict(data), []
    return dict(data), ["verbatim_missing_brand_payload"]


def _adapt_criteria_table_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if isinstance(data.get("raw"), list) and data.get("raw"):
        return dict(data), []
    return _adapt_table_data(data, chart)


def _adapt_table_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if "rows" in data and "columns" in data:
        return dict(data), []
    if isinstance(data.get("table"), dict):
        table = data["table"]
        return {
            "columns": table.get("columns", []),
            "rows": table.get("rows", []),
        }, ["unwrapped_nested_table"]
    return dict(data), ["table_missing_rows_columns"]


def _adapt_heatmap_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if isinstance(data.get("rows"), list) and isinstance(data.get("columns"), list):
        return dict(data), []
    if isinstance(data.get("matrix"), list):
        return dict(data), []
    return _adapt_category_chart_data(data, chart)


def _adapt_profile_chart_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    normalized = dict(data)

    if "labels" in normalized and "datasets" in normalized:
        datasets = []
        for dataset in normalized.get("datasets", []):
            if not isinstance(dataset, dict):
                continue
            datasets.append(
                {
                    "label": dataset.get("label") or dataset.get("brand") or chart.get("title") or "Series",
                    "brand": dataset.get("brand") or dataset.get("label"),
                    "data": dataset.get("data", []),
                    "is_benchmark": dataset.get("is_benchmark", False),
                }
            )
        normalized["datasets"] = datasets
        return normalized, notes

    adapted, notes = _adapt_category_chart_data(data, chart)
    for dataset in adapted.get("datasets", []):
        if isinstance(dataset, dict) and "brand" not in dataset:
            dataset["brand"] = dataset.get("label")
    return adapted, notes


def _adapt_likeness_profile_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    normalized = dict(data)

    metrics = normalized.get("metrics")
    datasets = normalized.get("datasets", [])
    if not metrics and normalized.get("labels"):
        metrics = normalized["labels"]
        notes.append("derived_likeness_metrics_from_labels")

    if not datasets and normalized.get("labels") and normalized.get("datasets") is None:
        pass

    if not metrics and datasets:
        first_dataset = datasets[0] if datasets else {}
        metrics = [f"Metric {index + 1}" for index in range(len(first_dataset.get("data", [])))]
        notes.append("derived_likeness_metrics_from_dataset_length")

    if metrics and datasets:
        normalized["metrics"] = metrics
        normalized["labels_left"] = normalized.get("labels_left") or [""] * len(metrics)
        normalized["labels_right"] = normalized.get("labels_right") or [""] * len(metrics)
        for dataset in datasets:
            if isinstance(dataset, dict) and "brand" not in dataset:
                dataset["brand"] = dataset.get("label")
        return normalized, notes

    return normalized, ["likeness_profile_missing_metrics_or_datasets"]


def _adapt_funnel_cards_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    brand_cards = data.get("brand_cards") or data.get("ratios") or []
    normalized_cards: List[Dict[str, Any]] = []

    for card in brand_cards:
        if not isinstance(card, dict):
            continue
        ratios = card.get("ratio_labels") or card.get("ratios") or []
        normalized_ratios = []
        for ratio in ratios:
            if isinstance(ratio, dict):
                label = ratio.get("label") or ratio.get("ratio_key") or "Ratio"
                text = ratio.get("text")
                if text is None and ratio.get("value") is not None:
                    value = ratio.get("value")
                    text = f"{value:.0f}%" if isinstance(value, (int, float)) and value > 1 else f"{value * 100:.0f}%"
                normalized_ratios.append({"label": label, "text": text or "0%"})
            elif isinstance(ratio, str):
                normalized_ratios.append({"label": ratio, "text": ratio})
        normalized_cards.append(
            {
                "brand": card.get("brand") or chart.get("title") or "Brand",
                "ratio_labels": normalized_ratios,
                "stage_bars": card.get("stage_bars", []),
            }
        )

    if normalized_cards:
        notes.append("normalized_funnel_ratio_cards")
        return {"brand_cards": normalized_cards}, notes

    return dict(data), ["funnel_cards_missing_brand_cards"]


def _adapt_affinity_heatmap_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    if data.get("demographics") and data.get("brands") and data.get("matrix"):
        return dict(data), []

    heatmap_points = data.get("heatmap")
    if isinstance(heatmap_points, list) and heatmap_points:
        brands = data.get("brands") or sorted({str(point.get("brand")) for point in heatmap_points if point.get("brand")})
        demographics = sorted(
            {f"{point.get('field')}: {point.get('segment')}" for point in heatmap_points if point.get("segment")}
        )
        matrix: List[List[float]] = []
        for demographic in demographics:
            row: List[float] = []
            for brand in brands:
                match = next(
                    (
                        point
                        for point in heatmap_points
                        if f"{point.get('field')}: {point.get('segment')}" == demographic and str(point.get("brand")) == str(brand)
                    ),
                    None,
                )
                row.append(float(match.get("aai", 0)) if isinstance(match, dict) else 0.0)
            matrix.append(row)
        return {
            "brands": brands,
            "demographics": demographics,
            "matrix": matrix,
        }, ["converted_affinity_heatmap_points_to_matrix"]

    if isinstance(data.get("matrix"), list):
        return dict(data), []

    return _adapt_category_chart_data(data, chart)


def _adapt_positioning_matrix_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    adapted, notes = _adapt_xy_scatter_data(data, chart)
    datasets = adapted.get("datasets", [])
    normalized_any = False
    for dataset in datasets:
        if not isinstance(dataset, dict):
            continue
        normalized_points = []
        for point in dataset.get("data", []):
            if not isinstance(point, dict):
                continue
            normalized_points.append(
                {
                    "x": point.get("x", point.get("x_val", 0)),
                    "y": point.get("y", point.get("y_val", 0)),
                    "size": point.get("size", point.get("n", point.get("bubble_size", 10))),
                    "label": point.get("label", point.get("brand", dataset.get("label"))),
                    "brand": point.get("brand", dataset.get("label")),
                }
            )
        dataset["data"] = normalized_points
        if normalized_points:
            normalized_any = True
    if normalized_any:
        notes.append("normalized_positioning_matrix_points")
    return adapted, notes


def _adapt_waterfall_awareness_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    adapted, notes = _adapt_category_chart_data(data, chart)
    labels = adapted.get("labels", [])
    datasets = adapted.get("datasets", [])
    if not isinstance(labels, list) or not isinstance(datasets, list) or not datasets:
        return adapted, notes

    alias_order = [
        ("TOM", {"TOM", "Top of Mind", "Top-of-Mind", "top_of_mind", "tom"}),
        ("Other_Unaided", {"Other_Unaided", "Other Unaided", "Unaided", "other_unaided"}),
        ("Aided", {"Aided", "Total Aided", "aided"}),
    ]
    by_alias: Dict[str, Dict[str, Any]] = {}
    remaining = []
    for dataset in datasets:
        if not isinstance(dataset, dict):
            continue
        label = str(dataset.get("label", "")).strip()
        normalized_label = label.replace("-", " ").replace("_", " ").lower()
        matched = False
        for alias, variants in alias_order:
            if label in variants or normalized_label in {v.replace("-", " ").replace("_", " ").lower() for v in variants}:
                by_alias[alias] = dataset
                matched = True
                break
        if not matched:
            remaining.append(dataset)

    # Index-based fallback when labels are generic
    ordered = []
    for idx, (alias, _variants) in enumerate(alias_order):
        if alias in by_alias:
            ordered.append({"label": alias, "data": by_alias[alias].get("data", [])})
        elif idx < len(remaining):
            ordered.append({"label": alias, "data": remaining[idx].get("data", [])})
        else:
            ordered.append({"label": alias, "data": [0.0] * len(labels)})
    adapted["datasets"] = ordered
    notes.append("normalized_awareness_waterfall_segments")
    return adapted, notes


def _adapt_importance_combined_data(data: Dict[str, Any], chart: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str]]:
    notes: List[str] = []
    normalized = dict(data)

    main_scatter = normalized.get("main_scatter")
    if isinstance(main_scatter, dict):
        adapted_main, main_notes = _adapt_xy_scatter_data(main_scatter, chart)
        normalized["main_scatter"] = adapted_main
        notes.extend(f"importance_main::{note}" for note in main_notes)
    else:
        notes.append("importance_main_scatter_missing")

    sub_scatter = normalized.get("sub_scatter")
    if isinstance(sub_scatter, dict):
        sub_for_xy = {"datasets": sub_scatter.get("datasets", [])}
        adapted_sub, sub_notes = _adapt_xy_scatter_data(sub_for_xy, chart)
        normalized["sub_scatter"] = {
            **sub_scatter,
            "datasets": adapted_sub.get("datasets", []),
        }
        notes.extend(f"importance_sub::{note}" for note in sub_notes)
    else:
        notes.append("importance_sub_scatter_missing")

    return normalized, notes


_ADAPTER_BY_REGISTRY: Dict[str, Callable[[Dict[str, Any], Dict[str, Any]], Tuple[Dict[str, Any], List[str]]]] = {
    "criteria_table": _adapt_criteria_table_data,
    "grouped_bar": _adapt_grouped_bar_data,
    "horizontal_bar": _adapt_horizontal_bar_data,
    "stacked_bar": _adapt_stacked_bar_data,
    "snake_line": _adapt_snake_line_data,
    "purchase_funnel": _adapt_snake_line_data,
    "market_position_radar": _adapt_radar_data,
    "radar": _adapt_radar_data,
    "brand_comparison": _adapt_brand_comparison_data,
    "reference_table": _adapt_table_data,
    "purchase_funnel_reference_table": _adapt_table_data,
    "funnel_reference_table": _adapt_table_data,
    "table": _adapt_table_data,
    "scatter": _adapt_xy_scatter_data,
    "scatter_plot": _adapt_xy_scatter_data,
    "sigma_intent_scatter": _adapt_sigma_intent_data,
    "sigma_intent": _adapt_sigma_intent_data,
    "scatter_bubble": _adapt_positioning_matrix_data,
    "positioning_matrix": _adapt_positioning_matrix_data,
    "bubble_chart": _adapt_positioning_matrix_data,
    "profile_chart": _adapt_profile_chart_data,
    "likeness_profile": _adapt_likeness_profile_data,
    "line": _adapt_likeness_profile_data,
    "funnel_ratio_cards": _adapt_funnel_cards_data,
    "funnel_cards": _adapt_funnel_cards_data,
    "purchase_funnel_ratio_cards": _adapt_funnel_cards_data,
    "gauge": _adapt_gauge_data,
    "nps_gauge": _adapt_gauge_data,
    "nps_recommend": _adapt_gauge_data,
    "wordcloud": _adapt_wordcloud_data,
    "verbatim_cloud": _adapt_wordcloud_data,
    "open_end_likes": _adapt_wordcloud_data,
    "open_end_dislikes": _adapt_wordcloud_data,
    "open_end_improvements": _adapt_wordcloud_data,
    "scorecard": _adapt_scorecard_data,
    "brand_summary": _adapt_scorecard_data,
    "verbatim_analysis": _adapt_verbatim_data,
    "verbatim_summary": _adapt_verbatim_data,
    "qualitative_analysis": _adapt_verbatim_data,
    "heatmap": _adapt_heatmap_data,
    "affinity_heatmap": _adapt_affinity_heatmap_data,
    "brand_performance_matrix": _adapt_heatmap_data,
    "brand_attribute_matrix": _adapt_heatmap_data,
    "brand_awareness": _adapt_waterfall_awareness_data,
    "awareness_waterfall": _adapt_waterfall_awareness_data,
    "awareness_trial_usage": _adapt_waterfall_awareness_data,
    "importance_combined": _adapt_importance_combined_data,
}
