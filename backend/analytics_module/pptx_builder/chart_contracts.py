from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatch
from typing import Any, Callable, Dict, List, Mapping, Optional, Sequence, Tuple


@dataclass(frozen=True)
class SchemaRule:
    path: str
    expected: str
    required: bool = True


@dataclass(frozen=True)
class ChartContract:
    chart_id_pattern: str
    chart_type: str
    source_runner: str
    required_data_schema: Tuple[SchemaRule, ...]
    adapter_ref: str
    builder_registry_key: str
    golden_sample_factory: Callable[[], Dict[str, Any]]
    active_in_compute_all: bool = True

    def matches(self, chart: Mapping[str, Any]) -> bool:
        chart_id = str(chart.get("chart_id") or "")
        chart_type = str(chart.get("chart_type") or "")
        if not chart_id or not chart_type:
            return False
        return fnmatch(chart_id, self.chart_id_pattern) and chart_type == self.chart_type


def _criteria_table_sample() -> Dict[str, Any]:
    return {"raw": [{"criteria_name": "Taste"}], "brands": ["A", "B"], "my_brand": "A"}


def _profile_sample() -> Dict[str, Any]:
    return {"labels": ["Taste"], "datasets": [{"label": "A", "data": [4.2]}]}


def _likeness_sample() -> Dict[str, Any]:
    return {
        "metrics": ["Modern"],
        "labels_left": ["Classic"],
        "labels_right": ["Modern"],
        "datasets": [{"label": "A", "data": [4.1]}],
    }


def _xy_sample() -> Dict[str, Any]:
    return {"datasets": [{"label": "A", "data": [{"x": 4.0, "y": 3.2, "label": "Taste"}]}]}


def _bar_sample() -> Dict[str, Any]:
    return {"labels": ["A", "B"], "datasets": [{"label": "Series", "data": [60, 40]}]}


def _funnel_cards_sample() -> Dict[str, Any]:
    return {"brand_cards": [{"brand": "A", "ratio_labels": [{"label": "Trial", "text": "65%"}]}]}


def _reference_table_sample() -> Dict[str, Any]:
    return {"labels": ["Awareness"], "datasets": [{"label": "A", "data": [85]}]}


def _scorecard_sample() -> Dict[str, Any]:
    return {
        "profile": {
            "Brand": "A",
            "Overall Score": 8.1,
            "T2B %": 64,
            "NPS": 30,
            "Evaluations": 200,
            "Total Sample": 200,
        },
        "strengths": [{"attribute": "Taste", "score": 8.6}],
        "nps": {
            "nps": 30,
            "promoters_pct": 50.0,
            "passives_pct": 30.0,
            "detractors_pct": 20.0,
            "base_n": 120,
        },
    }


def _wordcloud_sample() -> Dict[str, Any]:
    return {"words": [{"text": "taste", "value": 120}]}


def _sigma_intent_sample() -> Dict[str, Any]:
    return {
        "attributes": ["Taste", "Value"],
        "headlines": {"Taste": "Taste drives intent"},
        "datasets": {
            "Taste": [{"x": 0.6, "y": 0.7, "label": "A"}],
            "Value": [{"x": 0.4, "y": 0.6, "label": "A"}],
        },
    }


def _affinity_sample() -> Dict[str, Any]:
    return {"brands": ["A", "B"], "demographics": ["Urban"], "matrix": [[120, 96]]}


def canonical_nps_gauge_sample() -> Dict[str, Any]:
    """Canonical multi-brand NPS gauge payload (matches ``ReportAggregator.nps_recommend``)."""
    return {
        "labels": ["Hero Brand", "Competitor A"],
        "datasets": [
            {"label": "Detractors", "data": [0.2, 0.3]},
            {"label": "Passives", "data": [0.3, 0.4]},
            {"label": "Promoters", "data": [0.5, 0.3]},
        ],
        "nps_scores": {"Hero Brand": 30, "Competitor A": 0},
        "segments": [
            {
                "brand": "Hero Brand",
                "nps": 30,
                "promoters_pct": 50.0,
                "passives_pct": 30.0,
                "detractors_pct": 20.0,
                "base_n": 100,
            },
            {
                "brand": "Competitor A",
                "nps": 0,
                "promoters_pct": 30.0,
                "passives_pct": 40.0,
                "detractors_pct": 30.0,
                "base_n": 80,
            },
        ],
    }


def _gauge_sample() -> Dict[str, Any]:
    return canonical_nps_gauge_sample()


def _verbatim_sample() -> Dict[str, Any]:
    return {
        "themes": [
            {"title": "Taste", "desc": "Respondents repeatedly highlight taste leadership."},
            {"title": "Texture", "desc": "Texture satisfaction remains high."},
        ],
        "quotes": [
            {"text": "The taste is better than alternatives.", "brand": "Hero Brand"},
            {"text": "Texture feels premium and consistent.", "brand": "Hero Brand"},
        ],
    }


def _importance_combined_sample() -> Dict[str, Any]:
    return {
        "main_scatter": {"datasets": [{"label": "Main", "data": [{"x": 0.7, "y": 0.6, "attribute": "Taste"}]}]},
        "sub_scatter": {
            "datasets": [{"label": "Sub", "data": [{"x": 0.5, "y": 0.4, "sub_attribute": "Aftertaste"}]}],
            "drill_attribute": "Taste",
            "top_attributes": ["Aftertaste"],
        },
    }


def _rules(*items: Tuple[str, str]) -> Tuple[SchemaRule, ...]:
    return tuple(SchemaRule(path=path, expected=expected) for path, expected in items)


TASTE_TEST_CONTRACTS: Tuple[ChartContract, ...] = (
    ChartContract("criteria_table", "criteria_table", "criteria_table", _rules(("raw", "list")), "_adapt_criteria_table_data", "criteria_table", _criteria_table_sample),
    ChartContract("brand_profile_snake", "profile_chart", "brand_profile_analytics", _rules(("labels", "list"), ("datasets", "list")), "_adapt_profile_chart_data", "profile_chart", _profile_sample),
    ChartContract("likeness_profile_chart", "likeness_profile", "likeness_profile_chart", _rules(("metrics", "list"), ("datasets", "list")), "_adapt_likeness_profile_data", "likeness_profile", _likeness_sample),
    ChartContract("overall_scatter", "scatter_plot", "overall_scatter", _rules(("datasets", "list")), "_adapt_xy_scatter_data", "scatter_plot", _xy_sample),
    ChartContract("sub_attribute_scatter", "scatter_plot", "sub_attribute_scatter", _rules(("datasets", "list")), "_adapt_xy_scatter_data", "scatter_plot", _xy_sample),
    ChartContract("product_preference", "grouped_bar", "product_preference", _rules(("labels", "list"), ("datasets", "list")), "_adapt_grouped_bar_data", "grouped_bar", _bar_sample),
    ChartContract("demographic_sub_averages", "grouped_bar", "demographic_sub_averages", _rules(("labels", "list"), ("datasets", "list")), "_adapt_grouped_bar_data", "grouped_bar", _bar_sample),
    ChartContract("purchase_funnel", "snake_line", "purchase_funnel_chart", _rules(("labels", "list"), ("datasets", "list")), "_adapt_snake_line_data", "purchase_funnel", _bar_sample),
    ChartContract("overall_switch", "grouped_bar", "overall_switch", _rules(("labels", "list"), ("datasets", "list")), "_adapt_grouped_bar_data", "grouped_bar", _bar_sample),
    ChartContract("switch_per_brand", "grouped_bar", "switch_per_brand", _rules(("labels", "list"), ("datasets", "list")), "_adapt_grouped_bar_data", "grouped_bar", _bar_sample),
    ChartContract("sigma_intent", "sigma_intent_scatter", "enhanced_sigma_intent_analysis", _rules(("attributes", "list"), ("datasets", "dict")), "_adapt_sigma_intent_data", "sigma_intent", _sigma_intent_sample),
    ChartContract("market_position_sigma", "market_position_radar", "market_position_sigma", _rules(("labels", "list"), ("datasets", "list")), "_adapt_radar_data", "market_position_radar", _bar_sample),
    ChartContract("attribute_radar", "radar", "attribute_radar", _rules(("labels", "list"), ("datasets", "list")), "_adapt_radar_data", "radar", _bar_sample),
    ChartContract("audience_affinity", "affinity_heatmap", "audience_affinity_index", _rules(("brands", "list"), ("demographics", "list"), ("matrix", "list")), "_adapt_affinity_heatmap_data", "affinity_heatmap", _affinity_sample),
    ChartContract("competitive_position_matrix", "scatter_bubble", "competitive_position_matrix", _rules(("datasets", "list")), "_adapt_positioning_matrix_data", "scatter_bubble", _xy_sample),
    ChartContract("purchase_intent", "stacked_bar", "purchase_intent", _rules(("labels", "list"), ("datasets", "list")), "_adapt_stacked_bar_data", "stacked_bar", _bar_sample),
    ChartContract("brand_comparison_pi_ol", "brand_comparison", "brand_comparison_pi_ol", _rules(("labels", "list"), ("datasets", "list")), "_adapt_brand_comparison_data", "brand_comparison", _bar_sample),
    ChartContract("brand_awareness", "horizontal_bar", "brand_awareness_stacked", _rules(("labels", "list"), ("datasets", "list")), "_adapt_waterfall_awareness_data", "brand_awareness", _bar_sample),
    ChartContract("purchase_funnel_ratio_cards", "funnel_ratio_cards", "purchase_funnel_ratio_cards", _rules(("brand_cards", "list")), "_adapt_funnel_cards_data", "purchase_funnel_ratio_cards", _funnel_cards_sample),
    ChartContract("purchase_funnel_reference_table", "reference_table", "purchase_funnel_reference_table", _rules(("labels", "list"), ("datasets", "list")), "_adapt_table_data", "reference_table", _reference_table_sample),
    ChartContract("nps_recommend", "gauge", "nps_recommend", _rules(("labels", "list"), ("datasets", "list")), "_adapt_gauge_data", "nps_recommend", _gauge_sample),
    ChartContract("price_sensitivity", "horizontal_bar", "price_sensitivity", _rules(("labels", "list"), ("datasets", "list")), "_adapt_horizontal_bar_data", "horizontal_bar", _bar_sample),
    ChartContract("brand_card_*", "scorecard", "brand_cards", _rules(("profile", "dict"), ("strengths", "list")), "_adapt_scorecard_data", "scorecard", _scorecard_sample),
    ChartContract("open_end_*", "wordcloud", "open_end_clouds", _rules(("words", "list")), "_adapt_wordcloud_data", "wordcloud", _wordcloud_sample),
    ChartContract("verbatim_ai_*", "verbatim_analysis", "WebReportSerializer._serialize_verbatim_analysis", _rules(("themes", "list"), ("quotes", "list")), "_adapt_verbatim_data", "verbatim_analysis", _verbatim_sample),
    ChartContract("importance_combined*", "importance_combined", "importance_combined", _rules(("main_scatter", "dict"), ("sub_scatter", "dict")), "_adapt_importance_combined_data", "importance_combined", _importance_combined_sample, False),
)


def resolve_taste_test_contract(chart: Mapping[str, Any]) -> Optional[ChartContract]:
    for contract in TASTE_TEST_CONTRACTS:
        if contract.matches(chart):
            return contract
    return None


def validate_against_contract(chart: Mapping[str, Any]) -> List[Dict[str, Any]]:
    errors: List[Dict[str, Any]] = []
    contract = resolve_taste_test_contract(chart)
    if contract is None:
        return [
            {
                "code": "contract_not_found",
                "path": "chart_id",
                "message": f"No taste-test contract found for chart_id='{chart.get('chart_id')}' chart_type='{chart.get('chart_type')}'.",
                "expected": "known taste-test contract pattern",
                "actual": {"chart_id": chart.get("chart_id"), "chart_type": chart.get("chart_type")},
            }
        ]

    data = chart.get("data")
    if not isinstance(data, dict):
        return [
            {
                "code": "invalid_data_root",
                "path": "data",
                "message": "Chart data must be an object.",
                "expected": "dict",
                "actual": type(data).__name__,
                "contract": contract.chart_id_pattern,
            }
        ]

    for rule in contract.required_data_schema:
        value, exists = _value_at_path(data, rule.path)
        if not exists:
            errors.append(
                {
                    "code": "missing_required_field",
                    "path": f"data.{rule.path}",
                    "message": f"Missing required field '{rule.path}' for chart contract '{contract.chart_id_pattern}'.",
                    "expected": rule.expected,
                    "actual": None,
                    "contract": contract.chart_id_pattern,
                }
            )
            continue
        actual_kind = _kind_of(value)
        if actual_kind != rule.expected:
            errors.append(
                {
                    "code": "invalid_field_type",
                    "path": f"data.{rule.path}",
                    "message": f"Invalid field kind at '{rule.path}'.",
                    "expected": rule.expected,
                    "actual": actual_kind,
                    "contract": contract.chart_id_pattern,
                }
            )

    return errors


def _value_at_path(data: Mapping[str, Any], path: str) -> Tuple[Any, bool]:
    current: Any = data
    for token in path.split("."):
        if not isinstance(current, Mapping) or token not in current:
            return None, False
        current = current[token]
    return current, True


def _kind_of(value: Any) -> str:
    if isinstance(value, dict):
        return "dict"
    if isinstance(value, list):
        return "list"
    if isinstance(value, str):
        return "str"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    if value is None:
        return "null"
    return type(value).__name__

