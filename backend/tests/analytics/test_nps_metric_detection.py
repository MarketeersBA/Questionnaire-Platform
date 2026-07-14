"""Tests for recommend/NPS metric detection across EN and AR question text."""

import pandas as pd

from backend.analytics_module.nps_metric_detection import (
    is_recommend_nps_metric,
    recommend_nps_row_mask,
)


def test_is_recommend_nps_metric_matches_english_labels():
    assert is_recommend_nps_metric("Likelihood to recommend")
    assert is_recommend_nps_metric("NPS score")


def test_is_recommend_nps_metric_matches_arabic_labels():
    assert is_recommend_nps_metric("ممكن ترشح Squizz ده لحد من صحابك أو قرايبك؟")
    assert is_recommend_nps_metric("قيم توصيتك للمنتج")


def test_is_recommend_nps_metric_rejects_attribute_scales():
    assert not is_recommend_nps_metric("قيم إعجابك العام بSquizz")
    assert not is_recommend_nps_metric("Taste")


def test_recommend_nps_row_mask_filters_dataframe_metrics():
    metrics = pd.Series(
        [
            "Likelihood to recommend",
            "ممكن ترشح Squizz ده لحد من صحابك أو قرايبك؟",
            "قيم إعجابك العام بSquizz",
        ]
    )
    mask = recommend_nps_row_mask(metrics)

    assert mask.tolist() == [True, True, False]
