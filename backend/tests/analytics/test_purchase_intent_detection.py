"""Tests for purchase intent detection and aggregator PI charts."""

from __future__ import annotations

import pandas as pd
import pytest

from backend.analytics_module.aggregator import ReportAggregator
from backend.analytics_module.ingestor import SurveyData
from backend.analytics_module.purchase_intent_detection import (
    build_pi_diagnostics,
    compute_pi_t2b_by_brand,
    filter_purchase_intent_rows,
    purchase_intent_row_mask,
)


def _eval_row(
    *,
    brand: str,
    metric: str,
    attribute: str = "General",
    value: float = 4,
    question_id: str = "",
    response_id: str = "r1",
) -> dict:
    return {
        "response_id": response_id,
        "token": "T1",
        "brand": brand,
        "group": "taste",
        "attribute": attribute,
        "metric": metric,
        "value": value,
        "question_id": question_id,
    }


def _survey_data_from_rows(rows: list[dict], brands: list[str]) -> SurveyData:
    return SurveyData(
        evaluations=pd.DataFrame(rows),
        demographics=pd.DataFrame(),
        purchase_funnel=pd.DataFrame(),
        preferences=pd.DataFrame(),
        open_ends=pd.DataFrame(),
        question_map={},
        response_count=len({r["response_id"] for r in rows}) or 1,
        brands=brands,
        survey_id="test",
        own_brand=brands[0],
    )


class TestPurchaseIntentRowMask:
    def test_detects_english_purchase_intent_metric(self):
        df = pd.DataFrame([_eval_row(brand="A", metric="Likelihood to buy this product")])
        assert purchase_intent_row_mask(df).iloc[0]

    def test_detects_arabic_ice_cream_pi_metric(self):
        df = pd.DataFrame(
            [_eval_row(brand="Squizz", metric="ناوي تشتري Squizz ده بعد كده؟", question_id="tt_q15")]
        )
        assert purchase_intent_row_mask(df).iloc[0]

    def test_detects_canonical_tt_q15_without_english_substrings(self):
        df = pd.DataFrame(
            [_eval_row(brand="Friday", metric="سؤال نية الشراء", question_id="tt_q15")]
        )
        assert purchase_intent_row_mask(df).iloc[0]

    def test_excludes_price_sensitivity_metric_with_arabic_buy(self):
        df = pd.DataFrame(
            [
                _eval_row(
                    brand="Squizz",
                    metric="ممكن تشتري Squizz بسعره ايه؟",
                    question_id="tt_q16",
                    value=25,
                )
            ]
        )
        assert not purchase_intent_row_mask(df).iloc[0]

    def test_detects_pi_via_question_map_inference(self):
        df = pd.DataFrame([_eval_row(brand="A", metric="تقييم عام", question_id="custom_pi_q")])
        qmap = {"custom_pi_q": {"ar_text": "ما مدى احتمالية شرائك لهذا المنتج؟"}}
        assert purchase_intent_row_mask(df, question_map=qmap).iloc[0]


class TestPurchaseIntentT2B:
    def test_compute_t2b_for_ice_cream_fixture(self):
        rows = []
        # Squizz: 10 respondents, all top-2 on 1-7 scale (threshold 6)
        for i in range(10):
            rows.append(
                _eval_row(
                    brand="Squizz",
                    metric="ناوي تشتري Squizz ده بعد كده؟",
                    question_id="tt_q15",
                    value=7,
                    response_id=f"s{i}",
                )
            )
        # Friday: 9/10 top-2
        for i in range(9):
            rows.append(
                _eval_row(
                    brand="Friday",
                    metric="ناوي تشتري Squizz ده بعد كده؟",
                    question_id="tt_q15",
                    value=7,
                    response_id=f"f{i}",
                )
            )
        rows.append(
            _eval_row(
                brand="Friday",
                metric="ناوي تشتري Squizz ده بعد كده؟",
                question_id="tt_q15",
                value=3,
                response_id="f9",
            )
        )

        intent_df = filter_purchase_intent_rows(pd.DataFrame(rows))
        t2b = compute_pi_t2b_by_brand(intent_df, ["Friday", "Squizz"])
        assert t2b["Squizz"] == 100.0
        assert t2b["Friday"] == 90.0


class TestPurchaseIntentDiagnostics:
    def test_brands_missing_pi_are_explicit_when_only_likability_exists(self):
        rows = [
            _eval_row(brand="Friday", metric="Overall liking", attribute="General", value=5, question_id="tt_q14"),
            _eval_row(brand="Squizz", metric="ناوي تشتري Squizz ده بعد كده؟", question_id="tt_q15", value=6),
        ]
        intent_df = filter_purchase_intent_rows(pd.DataFrame(rows))
        diag = build_pi_diagnostics(intent_df, ["Friday", "Squizz"], overall_brands={"Friday", "Squizz"})
        assert diag.brands_with_pi == ["Squizz"]
        assert diag.brands_missing_pi == ["Friday"]
        assert diag.matched_row_count == 1


class TestAggregatorPurchaseIntentCharts:
    def test_purchase_intent_chart_for_arabic_pi(self):
        rows = []
        for i in range(5):
            rows.extend(
                [
                    _eval_row(
                        brand="Squizz",
                        metric="ناوي تشتري Squizz ده بعد كده؟",
                        question_id="tt_q15",
                        value=7,
                        response_id=f"r{i}",
                    ),
                    _eval_row(
                        brand="Friday",
                        metric="ناوي تشتري Squizz ده بعد كده؟",
                        question_id="tt_q15",
                        value=6,
                        response_id=f"r{i}",
                    ),
                ]
            )
        data = _survey_data_from_rows(rows, ["Squizz", "Friday"])
        chart = ReportAggregator(data, my_brand="Squizz").purchase_intent()
        assert chart["chart_id"] == "purchase_intent"
        assert chart["data"]["labels"]
        assert all(v > 0 for v in chart["data"]["datasets"][0]["data"])

    def test_brand_comparison_pi_ol_contract_and_values(self):
        rows = []
        for i in range(10):
            rows.extend(
                [
                    _eval_row(
                        brand="Squizz",
                        metric="ناوي تشتري Squizz ده بعد كده؟",
                        question_id="tt_q15",
                        value=7,
                        response_id=f"r{i}",
                    ),
                    _eval_row(
                        brand="Friday",
                        metric="ناوي تشتري Squizz ده بعد كده؟",
                        question_id="tt_q15",
                        value=7 if i < 9 else 3,
                        response_id=f"r{i}",
                    ),
                    _eval_row(
                        brand="Squizz",
                        metric="قيم إعجابك العام بSquizz",
                        question_id="tt_q14",
                        value=6,
                        response_id=f"r{i}",
                    ),
                    _eval_row(
                        brand="Friday",
                        metric="قيم إعجابك العام بSquizz",
                        question_id="tt_q14",
                        value=5,
                        response_id=f"r{i}",
                    ),
                ]
            )
        data = _survey_data_from_rows(rows, ["Squizz", "Friday"])
        chart = ReportAggregator(data, my_brand="Squizz").brand_comparison_pi_ol()

        assert chart["chart_id"] == "brand_comparison_pi_ol"
        assert chart["chart_type"] == "brand_comparison"
        assert chart["title"] == "Brand Strategic Comparison"
        assert chart["data"]["labels"] == ["Friday", "Squizz"]

        datasets = chart["data"]["datasets"]
        assert datasets[0]["label"] == "Purchase Intent (T2B%)"
        assert datasets[1]["label"] == "Overall Likability"
        assert datasets[0]["data"] == [90.0, 100.0]
        assert datasets[1]["data"] == [5.0, 6.0]

        pi_diag = chart["data"]["metadata"]["pi_diagnostics"]
        assert pi_diag["matched_row_count"] == 20
        assert pi_diag["brands_missing_pi"] == []

    def test_brand_comparison_keeps_brand_with_missing_pi_in_diagnostics(self):
        rows = [
            _eval_row(brand="Friday", metric="قيم إعجابك العام", question_id="tt_q14", value=5),
            _eval_row(brand="Squizz", metric="ناوي تشتري Squizz ده بعد كده؟", question_id="tt_q15", value=6),
            _eval_row(brand="Squizz", metric="قيم إعجابك العام", question_id="tt_q14", value=6),
        ]
        data = _survey_data_from_rows(rows, ["Squizz", "Friday"])
        chart = ReportAggregator(data, my_brand="Squizz").brand_comparison_pi_ol()
        pi_diag = chart["data"]["metadata"]["pi_diagnostics"]

        assert "Friday" in chart["data"]["labels"]
        assert chart["data"]["datasets"][0]["data"][0] == 0.0  # no PI rows for Friday
        assert pi_diag["brands_missing_pi"] == ["Friday"]
        assert pi_diag["brands_with_pi"] == ["Squizz"]
