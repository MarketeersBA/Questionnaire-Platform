"""
Tests for the scale definition sent to the chart-insight model.

The reporting prompt asks the model to classify a scale from its answer labels
rather than from its length. That only works if the labels actually reach the
prompt, and it is actively harmful if the prompt claims labels exist when they
do not — a wrong classification inverts the meaning of every score on the chart
(a 3 is ideal on a sensory scale, lukewarm on purchase intent).
"""

import re

import pytest

from backend.analytics_module.chart_insight_engine import build_scale_context

SENSORY_LABELS = ["مش مملح كفاية", "مش مملح", "مناسب لى", "مملح", "مملح جدا"]
INTENT_LABELS = [
    "Definitely would not buy",
    "Would not buy",
    "Might buy",
    "Would buy",
    "Definitely would buy",
]


def _centered(**overrides):
    scale = {
        "shape": "centered",
        "min": 1,
        "max": 5,
        "ideal_point": 3,
        "labels": SENSORY_LABELS,
    }
    scale.update(overrides)
    return {"scale": scale}


# ── Centered (sensory) ──────────────────────────────────────────────────────

def test_centered_scale_names_the_midpoint_as_ideal():
    out = build_scale_context(_centered())
    assert "CENTERED" in out
    assert "midpoint (3) is the ideal" in out


def test_centered_scale_forbids_top_2_box():
    """T2B on a centered scale counts the 'too much' excess, not success."""
    out = build_scale_context(_centered())
    assert "Do NOT use Top-2-Box" in out
    assert "Just Right" in out


def test_labels_are_listed_point_by_point_with_the_ideal_flagged():
    out = build_scale_context(_centered())
    for index, label in enumerate(SENSORY_LABELS, start=1):
        assert f"{index} = {label}" in out
    assert "3 = مناسب لى [IDEAL]" in out
    # Only one point may be flagged.
    assert out.count("[IDEAL]") == 1


# ── Monotonic (the trap) ────────────────────────────────────────────────────

def test_monotonic_scale_marks_the_top_not_the_midpoint():
    out = build_scale_context({
        "scale": {
            "shape": "monotonic",
            "min": 1,
            "max": 5,
            "ideal_point": 5,
            "labels": INTENT_LABELS,
        }
    })

    assert "MONOTONIC" in out
    assert "5 is best" in out
    assert "midpoint is lukewarm, NOT ideal" in out
    assert "5 = Definitely would buy [IDEAL]" in out
    # The failure mode this guards: a 1-5 ladder described as centered.
    assert "CENTERED" not in out


def test_interpretation_note_is_passed_through():
    out = build_scale_context({
        "scale": {
            "shape": "monotonic",
            "min": 1,
            "max": 5,
            "ideal_point": 5,
            "interpretation_note": "5 is best; the midpoint is lukewarm.",
        }
    })
    assert "overrides inference" in out
    assert "midpoint is lukewarm" in out


# ── Hedonic ─────────────────────────────────────────────────────────────────

def test_hedonic_scale_allows_t2b():
    out = build_scale_context({
        "scale": {"shape": "hedonic", "min": 1, "max": 10, "ideal_point": 10}
    })
    assert "HEDONIC" in out
    assert "10 is best" in out
    assert "T2B and means are valid" in out


# ── Missing metadata ────────────────────────────────────────────────────────

@pytest.mark.parametrize("metadata", [None, {}, {"scale": None}, {"scale": {}}, {"other": 1}])
def test_missing_scale_tells_the_model_not_to_guess(metadata):
    """
    Most charts carry no scale definition yet. The prompt must not leave the
    model to infer a direction, because guessing wrong inverts the finding.
    """
    out = build_scale_context(metadata)

    assert "NOT PROVIDED" in out
    assert "Do not assume a direction" in out
    # It must not assert either interpretation.
    assert "[IDEAL]" not in out
    assert "CENTERED" not in out


def test_output_is_always_a_single_prompt_safe_line():
    """Rendered into a prompt template, so it must not carry stray braces."""
    for metadata in (None, _centered(), {"scale": {"shape": "hedonic", "max": 10}}):
        out = build_scale_context(metadata)
        assert isinstance(out, str) and out.strip()
        assert not re.search(r"\{[a-z_]+\}", out)


def test_partial_scale_metadata_does_not_crash():
    out = build_scale_context({"scale": {"shape": "centered"}})
    assert "CENTERED" in out


# ── Prompt wiring ───────────────────────────────────────────────────────────

def test_chart_prompt_declares_the_scale_placeholder():
    import json
    from pathlib import Path

    path = (
        Path(__file__).resolve().parents[2]
        / "resources" / "analytics" / "prompts" / "chart_insights.json"
    )
    user_base = json.loads(path.read_text(encoding="utf-8"))["user_base"]

    assert "{scale_context}" in user_base
    assert "SCALE DEFINITION" in user_base
    # The old name-guessing heuristic must stay gone.
    assert "Sweetness, Saltiness, Crunchiness" not in user_base
