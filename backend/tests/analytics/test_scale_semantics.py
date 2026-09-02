"""
Metrics must follow the scale's meaning, not its length.

Two 1-5 scales can be opposites: a sensory scale where 3 is the target, and a
purchase-intent ladder where 5 is. Reporting Top-2-Box on the first counts
"too salty" as a win. These tests pin the metric each shape is allowed to
produce, and — the part that was actually broken in production — that every
threshold is drawn from the question's own maximum.
"""
from __future__ import annotations

import pytest

from backend.analytics_module.chart_insight_engine import build_scale_context
from backend.analytics_module.scale_semantics import (
    M_B2B,
    M_JUST_RIGHT,
    M_NET_SKEW,
    M_T2B,
    M_TOO_LITTLE,
    M_TOO_MUCH,
    ScaleSpec,
    compute_metrics,
    resolve_scale_spec,
    to_prompt_dict,
)

SENSORY_LABELS = ["مش مملح كفاية", "مش مملح", "مناسب لى", "مملح", "مملح جدا"]
INTENT_LABELS = [
    "Definitely would not buy",
    "Would not buy",
    "Might buy",
    "Would buy",
    "Definitely would buy",
]

CENTERED = ScaleSpec(shape="centered", min=1, max=5, ideal_point=3, labels=SENSORY_LABELS)
MONOTONIC = ScaleSpec(shape="monotonic", min=1, max=5, ideal_point=5, labels=INTENT_LABELS)
HEDONIC = ScaleSpec(shape="hedonic", min=1, max=10, ideal_point=10)


# ── Resolution ─────────────────────────────────────────────────────────────


def test_resolves_frontend_camel_case_snapshot_metadata():
    """`template_snapshot_l2` stores camelCase, written by orchestration_service."""
    spec = resolve_scale_spec(
        {
            "scaleShape": "centered",
            "scaleMax": 5,
            "min": 1,
            "pointLabels": SENSORY_LABELS,
            "idealPoint": 3,
        },
        question_id="tt_taste_salty",
        source="snapshot",
    )
    assert spec.shape == "centered"
    assert (spec.min, spec.max, spec.ideal_point) == (1, 5, 3)
    assert spec.labels == SENSORY_LABELS
    assert spec.labels_align


def test_resolves_library_snake_case_metadata():
    spec = resolve_scale_spec(
        {"scale_shape": "hedonic", "scale_min": 1, "scale_max": 10, "ideal_point": 10}
    )
    assert spec.shape == "hedonic"
    assert spec.max == 10


@pytest.mark.parametrize(
    "shape,expected_ideal",
    [("centered", 3), ("hedonic", 5), ("monotonic", 5)],
)
def test_ideal_point_is_derived_when_absent(shape, expected_ideal):
    """Matches orchestration_service so the report and the respondent UI agree."""
    spec = resolve_scale_spec({"scale_shape": shape, "scale_min": 1, "scale_max": 5})
    assert spec.ideal_point == expected_ideal


def test_unknown_shape_is_not_guessed():
    """Guessing inverts a score's meaning; 'unknown' only forfeits a claim."""
    spec = resolve_scale_spec({"scaleMax": 5})
    assert spec.shape == "unknown"
    assert not spec.is_known
    assert to_prompt_dict(spec) is None


def test_inverted_range_degrades_to_unknown_rather_than_inventing_a_span():
    spec = resolve_scale_spec({"scale_shape": "hedonic", "scale_min": 5, "scale_max": 1})
    assert spec.shape == "unknown"


# ── Centered: Just Right, never T2B ────────────────────────────────────────


def test_centered_reports_just_right_and_never_t2b():
    # 2x too little, 5x just right, 3x too much
    values = [1, 2] + [3] * 5 + [4, 5, 5]
    metrics = compute_metrics(values, CENTERED)

    assert metrics[M_JUST_RIGHT] == 50.0
    assert metrics[M_TOO_LITTLE] == 20.0
    assert metrics[M_TOO_MUCH] == 30.0
    assert M_T2B not in metrics, "Top-2-Box on a centered scale scores 'too much' as success"


def test_centered_net_skew_is_signed_toward_too_much():
    """The sign is what tells a client which way to reformulate."""
    too_salty = compute_metrics([4, 4, 5, 5, 3], CENTERED)
    too_bland = compute_metrics([1, 1, 2, 2, 3], CENTERED)

    assert too_salty[M_NET_SKEW] > 0
    assert too_bland[M_NET_SKEW] < 0


def test_centered_mean_is_flagged_non_directional():
    """1s and 5s average to the ideal while describing a product nobody liked."""
    metrics = compute_metrics([1, 1, 5, 5], CENTERED)
    assert metrics["mean"] == 3.0
    assert metrics["mean_is_directional"] is False
    assert metrics[M_JUST_RIGHT] == 0.0


# ── Monotonic and hedonic: T2B from this question's own max ────────────────


def test_monotonic_t2b_uses_its_own_max_not_a_global_one():
    metrics = compute_metrics([5, 5, 4, 3, 1], MONOTONIC)
    assert metrics["t2b_threshold"] == 4
    assert metrics[M_T2B] == 60.0
    assert metrics["mean_is_directional"] is True


def test_hedonic_t2b_threshold_is_nine_on_a_ten_point_scale():
    metrics = compute_metrics([10, 9, 8, 7, 1], HEDONIC)
    assert metrics["t2b_threshold"] == 9
    assert metrics[M_T2B] == 40.0
    assert metrics[M_B2B] == 20.0


def test_same_values_score_oppositely_under_the_two_five_point_shapes():
    """
    The bug this module exists to prevent, stated as one assertion: identical
    responses on two identically-sized scales must not produce the same verdict.
    """
    values = [5, 5, 5, 5]
    centered = compute_metrics(values, CENTERED)
    monotonic = compute_metrics(values, MONOTONIC)

    assert centered[M_JUST_RIGHT] == 0.0  # every respondent said "too much"
    assert centered[M_TOO_MUCH] == 100.0
    assert monotonic[M_T2B] == 100.0  # every respondent said "definitely would buy"


def test_metrics_carry_base_size_and_low_base_flag():
    small = compute_metrics([5] * 12, HEDONIC)
    large = compute_metrics([5] * 40, HEDONIC)

    assert small["n"] == 12 and small["low_base"] is True
    assert large["n"] == 40 and large["low_base"] is False


def test_confidence_interval_is_attached_to_the_headline_proportion():
    metrics = compute_metrics([10] * 20 + [1] * 20, HEDONIC)
    low, high = metrics["ci95"]
    assert 0 <= low < 50 < high <= 100


# ── Degenerate input ───────────────────────────────────────────────────────


@pytest.mark.parametrize("values", [[], None, ["", None, "n/a"]])
def test_no_numeric_values_yields_a_zero_base_not_a_crash(values):
    metrics = compute_metrics(values, CENTERED)
    assert metrics["n"] == 0
    assert M_JUST_RIGHT not in metrics


def test_open_end_scales_produce_no_numeric_metrics():
    metrics = compute_metrics([1, 2, 3], ScaleSpec(shape="open_end", min=1, max=5))
    assert metrics["n"] == 0 or M_T2B not in metrics
    assert M_JUST_RIGHT not in metrics


def test_booleans_are_not_counted_as_scale_values():
    assert compute_metrics([True, False, 3], MONOTONIC)["n"] == 1


# ── The wiring that was missing ────────────────────────────────────────────


def test_prompt_dict_feeds_build_scale_context_end_to_end():
    """
    The whole point of `to_prompt_dict`: its output is what turns the god
    prompt's scale section from dead text into a live instruction. Previously
    nothing produced this block, so every chart prompt said "NOT PROVIDED".
    """
    rendered = build_scale_context({"scale": to_prompt_dict(CENTERED)})

    assert "NOT PROVIDED" not in rendered
    assert "CENTERED" in rendered
    assert "Do NOT use Top-2-Box" in rendered
    assert "3 = مناسب لى [IDEAL]" in rendered


def test_prompt_dict_for_monotonic_does_not_read_as_centered():
    rendered = build_scale_context({"scale": to_prompt_dict(MONOTONIC)})
    assert "MONOTONIC" in rendered
    assert "CENTERED" not in rendered


def test_mismatched_label_count_is_dropped_rather_than_misaligned():
    """A short label list would otherwise slide every label onto the wrong point."""
    spec = ScaleSpec(shape="centered", min=1, max=5, ideal_point=3, labels=["low", "high"])
    payload = to_prompt_dict(spec)
    assert payload["labels"] == []
    assert "did not match" in payload["interpretation_note"]
