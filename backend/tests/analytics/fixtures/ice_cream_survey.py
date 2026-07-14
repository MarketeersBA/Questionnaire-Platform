"""
Ice cream taste-test fixture (Squizz vs Friday, N=10).

Mirrors survey 6a4b858261f51908cc98195c flat_evaluations naming for regression tests.
"""

from __future__ import annotations

from typing import List

import pandas as pd

from backend.analytics_module.ingestor import SurveyData

ICE_CREAM_SURVEY_ID = "6a4b858261f51908cc98195c"
ICE_CREAM_BRANDS = ["Squizz", "Friday"]
ICE_CREAM_OWN_BRAND = "Squizz"
ICE_CREAM_BASE_N = 10

PI_METRIC_AR = "ناوي تشتري Squizz ده بعد كده؟"
OL_METRIC_AR = "قيم إعجابك العام بSquizz"
PI_QUESTION_ID = "tt_q15"
OL_QUESTION_ID = "tt_q14"

EXPECTED_PI_T2B = {"Friday": 90.0, "Squizz": 100.0}
EXPECTED_OL_MEAN = {"Friday": 5.0, "Squizz": 6.0}


def ice_cream_eval_row(
    *,
    brand: str,
    metric: str,
    value: float,
    question_id: str,
    attribute: str = "General",
    response_id: str,
) -> dict:
    return {
        "response_id": response_id,
        "token": response_id,
        "brand": brand,
        "group": "taste",
        "attribute": attribute,
        "metric": metric,
        "value": value,
        "question_id": question_id,
    }


def build_ice_cream_scale_rows() -> List[dict]:
    """10 respondents × 2 brands with Arabic PI + overall liking metrics."""
    rows: List[dict] = []
    for i in range(ICE_CREAM_BASE_N):
        rid = f"ice_r{i}"
        rows.append(
            ice_cream_eval_row(
                brand="Squizz",
                metric=PI_METRIC_AR,
                question_id=PI_QUESTION_ID,
                value=7,
                response_id=rid,
            )
        )
        rows.append(
            ice_cream_eval_row(
                brand="Friday",
                metric=PI_METRIC_AR,
                question_id=PI_QUESTION_ID,
                value=7 if i < 9 else 3,
                response_id=rid,
            )
        )
        rows.append(
            ice_cream_eval_row(
                brand="Squizz",
                metric=OL_METRIC_AR,
                question_id=OL_QUESTION_ID,
                value=6,
                response_id=rid,
            )
        )
        rows.append(
            ice_cream_eval_row(
                brand="Friday",
                metric=OL_METRIC_AR,
                question_id=OL_QUESTION_ID,
                value=5,
                response_id=rid,
            )
        )
    return rows


def build_ice_cream_survey_data() -> SurveyData:
    rows = build_ice_cream_scale_rows()
    return SurveyData(
        evaluations=pd.DataFrame(rows),
        demographics=pd.DataFrame(),
        purchase_funnel=pd.DataFrame(),
        preferences=pd.DataFrame(),
        open_ends=pd.DataFrame(),
        question_map={},
        response_count=ICE_CREAM_BASE_N,
        brands=list(ICE_CREAM_BRANDS),
        survey_id=ICE_CREAM_SURVEY_ID,
        own_brand=ICE_CREAM_OWN_BRAND,
    )


def ice_cream_brand_card_profile() -> dict:
    return {
        "Brand": "Friday",
        "Overall Score": 4.25,
        "T2B %": 2.7,
        "NPS": 30,
        "Evaluations": 260,
    }
