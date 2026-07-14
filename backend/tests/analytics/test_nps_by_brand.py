"""Unit tests for shared NPS-by-brand aggregation helpers."""

import pandas as pd
import pytest

from backend.analytics_module.aggregator import NpsBrandMetrics, ReportAggregator
from backend.analytics_module.ingestor import SurveyData


def _survey_data(
    evaluations: pd.DataFrame,
    *,
    brands: list[str],
    response_count: int = 1,
) -> SurveyData:
    return SurveyData(
        evaluations=evaluations,
        demographics=pd.DataFrame(),
        purchase_funnel=pd.DataFrame(),
        preferences=pd.DataFrame(),
        open_ends=pd.DataFrame(),
        question_map={},
        response_count=response_count,
        brands=brands,
        brand_master_list=brands,
        brand_alias_map={},
        survey_id="s1",
        own_brand=brands[0],
        category="Snacks",
    )


def _eval_row(
    response_id: str,
    brand: str,
    metric: str,
    value: float,
    *,
    attribute: str = "General",
) -> dict:
    return {
        "response_id": response_id,
        "brand": brand,
        "group": "g1",
        "attribute": attribute,
        "metric": metric,
        "value": value,
        "question_id": "q1",
    }


def test_nps_segments_from_scores_uses_0_10_thresholds():
  scores = pd.Series([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  metrics = ReportAggregator._nps_segments_from_scores(scores, scale_max=10)

  assert metrics == {
      "nps": -40,
      "promoters_pct": 20.0,
      "passives_pct": 20.0,
      "detractors_pct": 60.0,
      "base_n": 10,
  }


def test_nps_segments_from_scores_uses_5_point_thresholds():
  scores = pd.Series([5, 4, 3, 2, 1])
  metrics = ReportAggregator._nps_segments_from_scores(scores, scale_max=5)

  assert metrics == {
      "nps": 0,
      "promoters_pct": 40.0,
      "passives_pct": 20.0,
      "detractors_pct": 40.0,
      "base_n": 5,
  }


def test_nps_segments_from_scores_empty_scores_returns_zeros():
  metrics = ReportAggregator._nps_segments_from_scores(pd.Series([None, None], dtype=object))

  assert metrics["nps"] == 0
  assert metrics["base_n"] == 0


def test_recommend_nps_frame_filters_only_recommend_metrics():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Likelihood to recommend", 9),
          _eval_row("r1", "Brand A", "Taste", 8),
          _eval_row("r2", "Brand B", "NPS", 7),
          _eval_row("r3", "Brand C", "ممكن ترشح Squizz ده لحد من صحابك أو قرايبك؟", 10),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A", "Brand B", "Brand C"]), my_brand="Brand A")
  frame = agg._recommend_nps_frame()

  assert len(frame) == 3


def test_compute_nps_by_brand_omits_brands_without_recommend_rows():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Likelihood to recommend", 10),
          _eval_row("r1", "Brand A", "Likelihood to recommend", 9),
          _eval_row("r2", "Brand B", "Taste", 8),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A", "Brand B"]), my_brand="Brand A")
  nps_by_brand = agg._compute_nps_by_brand()

  assert set(nps_by_brand.keys()) == {"Brand A"}
  assert nps_by_brand["Brand A"]["nps"] == 100
  assert nps_by_brand["Brand A"]["base_n"] == 2


def test_nps_recommend_returns_empty_when_no_recommend_data():
  evals = pd.DataFrame([_eval_row("r1", "Brand A", "Taste", 8)])
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A"]), my_brand="Brand A")

  assert agg.nps_recommend() == {}


def test_nps_recommend_emits_canonical_gauge_payload():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Likelihood to recommend", 10),
          _eval_row("r2", "Brand A", "Likelihood to recommend", 6),
          _eval_row("r3", "Brand B", "NPS score", 9),
          _eval_row("r4", "Brand B", "NPS score", 8),
          _eval_row("r5", "Brand C", "Taste", 7),
      ]
  )
  brands = ["Brand A", "Brand B", "Brand C"]
  agg = ReportAggregator(_survey_data(evals, brands=brands, response_count=5), my_brand="Brand A")

  nps_by_brand = agg._compute_nps_by_brand()
  chart = agg.nps_recommend()
  gauge_data = chart["data"]

  assert chart["chart_id"] == "nps_recommend"
  assert chart["chart_type"] == "gauge"
  assert chart["brands"] == ["Brand A", "Brand B"]
  assert chart["base_n"] == 5

  assert gauge_data["labels"] == ["Brand A", "Brand B"]
  assert [series["label"] for series in gauge_data["datasets"]] == [
      "Detractors",
      "Passives",
      "Promoters",
  ]

  assert gauge_data["datasets"][0]["data"] == [
      round(nps_by_brand["Brand A"]["detractors_pct"] / 100.0, 4),
      round(nps_by_brand["Brand B"]["detractors_pct"] / 100.0, 4),
  ]
  assert gauge_data["datasets"][1]["data"] == [
      round(nps_by_brand["Brand A"]["passives_pct"] / 100.0, 4),
      round(nps_by_brand["Brand B"]["passives_pct"] / 100.0, 4),
  ]
  assert gauge_data["datasets"][2]["data"] == [
      round(nps_by_brand["Brand A"]["promoters_pct"] / 100.0, 4),
      round(nps_by_brand["Brand B"]["promoters_pct"] / 100.0, 4),
  ]

  assert gauge_data["nps_scores"] == {
      "Brand A": nps_by_brand["Brand A"]["nps"],
      "Brand B": nps_by_brand["Brand B"]["nps"],
  }
  assert gauge_data["segments"] == [
      {"brand": brand, **nps_by_brand[brand]}
      for brand in brands
      if brand in nps_by_brand
  ]

  for series in gauge_data["datasets"]:
      for value in series["data"]:
          assert 0.0 <= value <= 1.0


def test_build_nps_gauge_data_preserves_brand_order_from_self_brands():
  metrics_a: NpsBrandMetrics = {
      "nps": 10,
      "promoters_pct": 60.0,
      "passives_pct": 30.0,
      "detractors_pct": 10.0,
      "base_n": 5,
  }
  metrics_b: NpsBrandMetrics = {
      "nps": -20,
      "promoters_pct": 20.0,
      "passives_pct": 40.0,
      "detractors_pct": 40.0,
      "base_n": 4,
  }
  nps_by_brand = {"Brand B": metrics_b, "Brand A": metrics_a}
  payload = ReportAggregator._build_nps_gauge_data(
      nps_by_brand,
      brand_order=["Brand A", "Brand B", "Brand C"],
  )

  assert payload["labels"] == ["Brand A", "Brand B"]
  assert payload["nps_scores"] == {"Brand A": 10, "Brand B": -20}
  assert payload["datasets"][0]["data"] == [0.1, 0.4]
  assert payload["datasets"][1]["data"] == [0.3, 0.4]
  assert payload["datasets"][2]["data"] == [0.6, 0.2]


@pytest.mark.parametrize(
    ("scores", "expected_nps"),
    [
        (pd.Series([10, 10, 10]), 100),
        (pd.Series([1, 1, 1]), -100),
        (pd.Series([9, 7, 6]), 0),
    ],
)
def test_nps_segments_parametrized(scores: pd.Series, expected_nps: int):
  metrics: NpsBrandMetrics = ReportAggregator._nps_segments_from_scores(scores, scale_max=10)
  assert metrics["nps"] == expected_nps


def test_infer_nps_scale_max_defaults_to_10_when_empty():
  assert ReportAggregator._infer_nps_scale_max(pd.Series([], dtype=float)) == 10


def test_infer_nps_scale_max_detects_five_point_survey():
  assert ReportAggregator._infer_nps_scale_max(pd.Series([1, 3, 5])) == 5
  assert ReportAggregator._infer_nps_scale_max(pd.Series([8, 9, 10])) == 10


def test_compute_nps_by_brand_uses_global_scale_max_not_per_brand_max():
  """Brand with only 1-5 scores must use 0-10 thresholds when frame max > 5."""
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand High", "Likelihood to recommend", 10),
          _eval_row("r2", "Brand Low", "Likelihood to recommend", 1),
          _eval_row("r3", "Brand Low", "Likelihood to recommend", 2),
          _eval_row("r4", "Brand Low", "Likelihood to recommend", 3),
          _eval_row("r5", "Brand Low", "Likelihood to recommend", 4),
          _eval_row("r6", "Brand Low", "Likelihood to recommend", 5),
      ]
  )
  agg = ReportAggregator(
      _survey_data(evals, brands=["Brand High", "Brand Low"], response_count=6),
      my_brand="Brand High",
  )
  nps_by_brand = agg._compute_nps_by_brand()

  assert nps_by_brand["Brand Low"]["nps"] == -100
  assert nps_by_brand["Brand Low"]["detractors_pct"] == 100.0
  per_brand_wrong = ReportAggregator._nps_segments_from_scores(
      pd.Series([1, 2, 3, 4, 5]),
      scale_max=5,
  )
  assert per_brand_wrong["nps"] == 0


# ── brand_cards() NPS integration (Phase 2) ────────────────────────────────


def test_brand_cards_includes_nps_after_t2b_when_recommend_data_exists():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Taste", 8, attribute="Taste"),
          _eval_row("r1", "Brand A", "Aroma", 7, attribute="Aroma"),
          _eval_row("r2", "Brand A", "Likelihood to recommend", 10),
          _eval_row("r3", "Brand A", "Likelihood to recommend", 9),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A"], response_count=3), my_brand="Brand A")
  cards = agg.brand_cards()

  assert len(cards) == 1
  profile = cards[0]["data"]["profile"]
  assert list(profile.keys()) == ["Brand", "Overall Score", "T2B %", "NPS", "Evaluations"]
  assert profile["NPS"] == 100
  assert profile["Evaluations"] == 4


def test_brand_cards_omits_nps_key_when_no_recommend_data():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Taste", 8),
          _eval_row("r2", "Brand A", "Aroma", 7),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A"]), my_brand="Brand A")
  profile = agg.brand_cards()[0]["data"]["profile"]

  assert "NPS" not in profile
  assert "nps" not in agg.brand_cards()[0]["data"]


def test_brand_cards_stores_nps_context_separate_from_evaluations_count():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Taste", 8),
          _eval_row("r2", "Brand A", "Aroma", 7),
          _eval_row("r3", "Brand A", "Likelihood to recommend", 10),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A"], response_count=3), my_brand="Brand A")
  card = agg.brand_cards()[0]

  assert card["data"]["profile"]["Evaluations"] == 3
  assert card["data"]["nps"]["base_n"] == 1
  assert card["data"]["nps"]["nps"] == 100
  assert card["data"]["nps"]["promoters_pct"] == 100.0


def test_brand_cards_nps_varies_by_brand():
  evals = pd.DataFrame(
      [
          _eval_row("r1", "Brand A", "Taste", 8),
          _eval_row("r2", "Brand A", "Likelihood to recommend", 10),
          _eval_row("r3", "Brand B", "Taste", 7),
      ]
  )
  agg = ReportAggregator(_survey_data(evals, brands=["Brand A", "Brand B"], response_count=3), my_brand="Brand A")
  cards = {card["title"]: card for card in agg.brand_cards()}

  assert cards["Brand A"]["data"]["profile"]["NPS"] == 100
  assert "NPS" not in cards["Brand B"]["data"]["profile"]
  assert "nps" not in cards["Brand B"]["data"]


# ── Phase 5: legacy parity + contract alignment ────────────────────────────


def _legacy_inline_nps_by_brand(
    agg: ReportAggregator,
    rec_df: pd.DataFrame,
    *,
    scale_max: int,
) -> dict[str, dict]:
    """Reference loop using a single survey-wide scale ceiling (intended behavior)."""
    result: dict[str, dict] = {}
    for brand in agg.brands:
        brand_df = rec_df[rec_df["brand"] == brand]
        if brand_df.empty:
            continue

        scores = brand_df["value"].dropna()
        if scale_max <= 5:
            promoters = (scores >= 4).sum()
            detractors = (scores <= 2).sum()
        else:
            promoters = (scores >= 9).sum()
            detractors = (scores <= 6).sum()

        total = len(scores)
        nps = round(((promoters - detractors) / total) * 100) if total > 0 else 0
        result[brand] = {
            "nps": nps,
            "promoters_pct": round(promoters / total * 100, 1) if total > 0 else 0,
            "passives_pct": round((total - promoters - detractors) / total * 100, 1) if total > 0 else 0,
            "detractors_pct": round(detractors / total * 100, 1) if total > 0 else 0,
            "base_n": total,
        }
    return result


def test_compute_nps_by_brand_matches_legacy_inline_reference():
    evals = pd.DataFrame(
        [
            _eval_row("r1", "Brand A", "Likelihood to recommend", 10),
            _eval_row("r2", "Brand A", "Likelihood to recommend", 6),
            _eval_row("r3", "Brand B", "NPS score", 9),
            _eval_row("r4", "Brand B", "NPS score", 8),
            _eval_row("r5", "Brand C", "Taste", 7),
            _eval_row("r6", "Brand D", "Recommend", 4),
            _eval_row("r7", "Brand D", "Recommend", 2),
        ]
    )
    agg = ReportAggregator(
        _survey_data(evals, brands=["Brand A", "Brand B", "Brand C", "Brand D"], response_count=7),
        my_brand="Brand A",
    )
    rec_df = agg._recommend_nps_frame()
    scale_max = ReportAggregator._infer_nps_scale_max(rec_df["value"])

    assert agg._compute_nps_by_brand(rec_df) == _legacy_inline_nps_by_brand(
        agg,
        rec_df,
        scale_max=scale_max,
    )


def test_brand_cards_profile_nps_matches_compute_nps_by_brand():
    evals = pd.DataFrame(
        [
            _eval_row("r1", "Brand A", "Taste", 8),
            _eval_row("r2", "Brand A", "Likelihood to recommend", 10),
            _eval_row("r3", "Brand A", "Likelihood to recommend", 9),
            _eval_row("r4", "Brand B", "Taste", 7),
        ]
    )
    agg = ReportAggregator(_survey_data(evals, brands=["Brand A", "Brand B"], response_count=4), my_brand="Brand A")
    nps_by_brand = agg._compute_nps_by_brand()
    cards = {card["title"]: card for card in agg.brand_cards()}

    assert cards["Brand A"]["data"]["profile"]["NPS"] == nps_by_brand["Brand A"]["nps"]
    assert cards["Brand A"]["data"]["nps"] == nps_by_brand["Brand A"]
    assert "NPS" not in cards["Brand B"]["data"]["profile"]

