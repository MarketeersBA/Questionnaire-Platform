"""
The criteria table must measure each attribute on its own scale.

This is a regression suite for two bugs that were live in production:

  1. The Top-2-Box threshold came from ``df["value"].max() - 1`` — a single
     maximum taken across every scale in the survey at once. A taste test mixes
     1-5 sensory scales with a 1-10 hedonic "Overall" question, which made the
     threshold 9 and scored **every 1-5 attribute at 0%**.

  2. Top-2-Box was applied to centered sensory scales, where the top two boxes
     mean "too much" — so an over-salted product read as a success.

``test_five_point_attributes_are_not_zeroed_by_a_ten_point_question`` is the
one that fails against the original implementation.
"""
from __future__ import annotations

import pandas as pd
import pytest

from backend.analytics_module.aggregator import ReportAggregator
from backend.analytics_module.ingestor import SurveyData

MY_BRAND = "OurBrand"
COMPETITOR = "TheirBrand"

# A 1-5 centered sensory scale (3 = just right) and a 1-10 hedonic one.
SALT_LABELS = ["Not salty at all", "Not salty", "Just right", "Salty", "Far too salty"]

REGISTRY = [
    {
        "main_att": "Taste",
        "supp_att": "Saltiness",
        "en_text": "How salty is it?",
        "question_id": "tt_taste_salty",
        "role": "sub",
        "scale_shape": "centered",
        "scale_min": 1,
        "scale_max": 5,
        "ideal_point": 3,
        "point_labels": SALT_LABELS,
    },
    {
        "main_att": "Overall",
        "supp_att": "Overall Liking",
        "en_text": "Overall, how much do you like it?",
        "question_id": "tt_overall_liking",
        "role": "main",
        "scale_shape": "hedonic",
        "scale_min": 1,
        "scale_max": 10,
        "ideal_point": 10,
        "point_labels": [],
    },
]


def _evaluations(rows):
    return pd.DataFrame(
        rows,
        columns=["response_id", "brand", "group", "attribute", "metric", "value", "question_id"],
    )


def _build_data(rows) -> SurveyData:
    evaluations = _evaluations(rows)
    empty = pd.DataFrame()
    return SurveyData(
        evaluations=evaluations,
        demographics=empty,
        purchase_funnel=empty,
        preferences=empty,
        open_ends=empty,
        question_map={},
        response_count=evaluations["response_id"].nunique(),
        brands=sorted(evaluations["brand"].unique().tolist()),
        own_brand=MY_BRAND,
    )


def _mixed_scale_rows(n: int = 40):
    """
    Both brands score identically well, on two differently-sized scales.

    Saltiness: everyone answers 3 — perfectly Just Right on a centered scale.
    Overall liking: everyone answers 9 — inside Top-2-Box on a 1-10 scale.
    """
    rows = []
    for i in range(n):
        for brand in (MY_BRAND, COMPETITOR):
            rows.append([f"r{i}", brand, "internal", "Saltiness", "Saltiness", 3, "tt_taste_salty"])
            rows.append([f"r{i}", brand, "internal", "Overall Liking", "Overall Liking", 9, "tt_overall_liking"])
    return rows


def _aggregate(rows, registry=REGISTRY):
    data = _build_data(rows)
    return ReportAggregator(
        data,
        my_brand=MY_BRAND,
        attribute_registry=registry,
        research_type="taste_test",
    ).criteria_table()


def _row(table, name):
    return next(r for r in table["data"]["raw"] if r["criteria_name"] == name)


# ── The production bug ─────────────────────────────────────────────────────


def test_five_point_attributes_are_not_zeroed_by_a_ten_point_question():
    """
    Every respondent gave Saltiness the ideal answer. Under the old global-max
    threshold (max=10 → T2B floor 9) this attribute scored 0% for every brand,
    because a 1-5 scale can never reach 9.
    """
    table = _aggregate(_mixed_scale_rows())
    salt = _row(table, "Saltiness")

    assert salt["brand_scores"][MY_BRAND] == 100.0
    assert salt["brand_scores"][COMPETITOR] == 100.0
    assert salt["metric_kind"] == "Just Right %"


def test_the_ten_point_attribute_is_still_measured_correctly_alongside_it():
    table = _aggregate(_mixed_scale_rows())
    overall = _row(table, "Overall Liking")

    assert overall["metric_kind"] == "T2B %"
    assert overall["brand_scores"][MY_BRAND] == 100.0
    assert overall["brand_metrics"][MY_BRAND]["t2b_threshold"] == 9


def test_each_attribute_reports_its_own_metric_kind():
    table = _aggregate(_mixed_scale_rows())
    kinds = {r["criteria_name"]: r["metric_kind"] for r in table["data"]["raw"]}

    assert kinds == {"Saltiness": "Just Right %", "Overall Liking": "T2B %"}
    # A mixed table cannot carry one shared column header.
    assert table["data"]["mixed_metrics"] is True
    assert sorted(table["metadata"]["metric_kinds"]) == ["Just Right %", "T2B %"]


# ── Centered scales must never report Top-2-Box ────────────────────────────


def test_an_over_salted_product_does_not_read_as_a_success():
    """
    Everyone says "far too salty" (5). Top-2-Box would score that 100%; Just
    Right correctly scores it 0% and the skew points at the cause.
    """
    rows = []
    for i in range(40):
        rows.append([f"r{i}", MY_BRAND, "internal", "Saltiness", "Saltiness", 5, "tt_taste_salty"])
    table = _aggregate(rows)
    salt = _row(table, "Saltiness")

    assert salt["brand_scores"][MY_BRAND] == 0.0
    metrics = salt["brand_metrics"][MY_BRAND]
    assert metrics["too_much_pct"] == 100.0
    assert metrics["net_skew"] > 0        # skewed toward "too much"
    assert "t2b_pct" not in metrics


def test_centered_scale_carries_no_t2b_anywhere_in_the_payload():
    table = _aggregate(_mixed_scale_rows())
    salt = _row(table, "Saltiness")
    for brand_metrics in salt["brand_metrics"].values():
        assert "t2b_pct" not in brand_metrics
        assert "just_right_pct" in brand_metrics


# ── Significance vs importance ─────────────────────────────────────────────


def test_importance_and_significance_are_distinct_fields():
    """
    `significance` was a Pearson correlation with overall liking that the prompt
    layer read as a statistical test. The correlation keeps its value under
    `importance`; `significance_test` now holds an actual test.
    """
    table = _aggregate(_mixed_scale_rows())
    row = _row(table, "Saltiness")

    assert "importance" in row
    assert row["significance"] == row["importance"]  # legacy field, unchanged value
    assert "significance_test" in row


def test_an_identical_gap_is_not_called_significant():
    table = _aggregate(_mixed_scale_rows())
    test = _row(table, "Overall Liking")["significance_test"]

    assert test is not None
    assert test["significant"] is False
    assert test["band"] == "ns"
    assert test["tested_pair"] == [MY_BRAND, COMPETITOR]


def test_a_real_gap_at_an_adequate_base_is_flagged_significant():
    rows = []
    for i in range(60):
        # Our brand: 85% in T2B. Competitor: 25%.
        ours = 9 if i < 51 else 4
        theirs = 9 if i < 15 else 4
        rows.append([f"r{i}", MY_BRAND, "internal", "Overall Liking", "Overall Liking", ours, "tt_overall_liking"])
        rows.append([f"r{i}", COMPETITOR, "internal", "Overall Liking", "Overall Liking", theirs, "tt_overall_liking"])

    test = _row(_aggregate(rows), "Overall Liking")["significance_test"]
    assert test["significant"] is True
    assert test["band"] in ("p<.05", "p<.01")


def test_low_base_is_flagged_on_the_significance_test():
    rows = []
    for i in range(8):
        for brand in (MY_BRAND, COMPETITOR):
            rows.append([f"r{i}", brand, "internal", "Overall Liking", "Overall Liking", 9, "tt_overall_liking"])

    table = _aggregate(rows)
    assert table["metadata"]["low_base"] is True


# ── Prompt wiring ──────────────────────────────────────────────────────────


def test_metadata_carries_precomputed_metrics_for_the_ai_to_cite():
    """The AI is told to cite these rather than compute anything itself."""
    metrics = _aggregate(_mixed_scale_rows())["metadata"]["metrics"]

    assert set(metrics) == {"Saltiness", "Overall Liking"}
    assert metrics["Saltiness"]["metric_kind"] == "Just Right %"
    assert metrics["Saltiness"]["by_brand"][MY_BRAND] == 100.0


def test_base_sizes_travel_with_the_metrics():
    metadata = _aggregate(_mixed_scale_rows())["metadata"]
    assert metadata["base_n_by_brand"] == {MY_BRAND: 40, COMPETITOR: 40}
    assert metadata["low_base"] is False


# ── Degraded input ─────────────────────────────────────────────────────────


def test_attributes_with_no_registry_entry_degrade_to_means_and_are_reported():
    """
    An unresolved scale must not be guessed at. It falls back to a mean, and
    says so, rather than silently picking a direction.
    """
    rows = [
        [f"r{i}", MY_BRAND, "internal", "Mystery", "Mystery", 4, "unknown_q"]
        for i in range(30)
    ]
    table = _aggregate(rows, registry=[])
    row = _row(table, "Mystery")

    assert row["metric_kind"] == "Mean"
    assert row["scale_shape"] == "unknown"
    assert "Mystery" in table["metadata"]["unresolved_scales"]
    # With no known shape there is no scale block, so the prompt keeps its
    # explicit "do not assume a direction" fallback.
    assert "scale" not in table["metadata"]


def test_empty_dataset_returns_no_chart_rather_than_raising():
    assert _aggregate([]) == {}


@pytest.mark.parametrize("value", ["n/a", None])
def test_non_numeric_answers_are_excluded_from_scale_metrics(value):
    rows = [[f"r{i}", MY_BRAND, "internal", "Saltiness", "Saltiness", 3, "tt_taste_salty"] for i in range(30)]
    rows.append(["rX", MY_BRAND, "internal", "Saltiness", "Saltiness", value, "tt_taste_salty"])

    salt = _row(_aggregate(rows), "Saltiness")
    assert salt["brand_metrics"][MY_BRAND]["n"] == 30
