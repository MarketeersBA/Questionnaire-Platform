"""
Reference checks for the inferential statistics behind "significantly higher".

Values are compared against published worked examples rather than against the
implementation's own output, so a refactor that changes the numbers fails here
instead of quietly shifting what the report calls significant.
"""
from __future__ import annotations

import pytest

from backend.analytics_module.stats import (
    MIN_BASE_N,
    benjamini_hochberg,
    is_low_base,
    significance_band,
    two_proportion_z,
    two_tailed_p,
    welch_t,
    wilson_ci,
)


# ── Wilson interval ────────────────────────────────────────────────────────


def test_wilson_matches_the_textbook_worked_example():
    """Wilson (1927) via Brown/Cai/DasGupta: 10/20 → roughly 29.9%-70.1%."""
    low, high = wilson_ci(10, 20)
    assert low == pytest.approx(29.9, abs=0.2)
    assert high == pytest.approx(70.1, abs=0.2)


def test_wilson_stays_inside_the_scale_at_the_extremes():
    """
    The reason Wilson is used instead of the normal approximation: report
    proportions sit at 0% and 100% often enough (a niche brand's awareness, a
    winner's Just Right score) that a normal interval would print a negative
    lower bound.
    """
    for k, n in [(0, 30), (30, 30), (1, 100), (99, 100)]:
        low, high = wilson_ci(k, n)
        assert 0.0 <= low <= high <= 100.0


def test_wilson_narrows_as_the_base_grows():
    small = wilson_ci(5, 10)
    large = wilson_ci(50, 100)
    assert (large[1] - large[0]) < (small[1] - small[0])


def test_wilson_on_an_empty_base_is_not_an_error():
    assert wilson_ci(0, 0) == (0.0, 0.0)


# ── Two-proportion z ───────────────────────────────────────────────────────


def test_two_proportion_z_matches_a_known_example():
    """
    Classic worked example: 45/100 vs 30/100.
    Pooled p = .375, SE = .0685, z = .15/.0685 ≈ 2.19, p ≈ .029.
    """
    z, p = two_proportion_z(45, 100, 30, 100)
    assert z == pytest.approx(2.19, abs=0.02)
    assert p == pytest.approx(0.029, abs=0.003)


def test_direction_of_z_follows_the_first_group():
    ahead, _ = two_proportion_z(60, 100, 40, 100)
    behind, _ = two_proportion_z(40, 100, 60, 100)
    assert ahead > 0 > behind
    assert ahead == pytest.approx(-behind)


def test_identical_proportions_are_not_significant():
    _, p = two_proportion_z(50, 100, 50, 100)
    assert p == pytest.approx(1.0, abs=1e-6)


def test_the_same_gap_is_significant_at_a_large_base_and_not_at_a_small_one():
    """A 20-point gap is a finding at n=100 and noise at n=10."""
    _, p_small = two_proportion_z(6, 10, 4, 10)
    _, p_large = two_proportion_z(60, 100, 40, 100)
    assert p_small > 0.05
    assert p_large < 0.05


@pytest.mark.parametrize(
    "args",
    [
        (0, 0, 5, 10),      # empty base
        (5, 10, 0, 0),
        (0, 10, 0, 10),     # nobody in either group — nothing to compare
        (10, 10, 10, 10),   # everybody in both
    ],
)
def test_undefined_comparisons_return_none_rather_than_a_confident_one(args):
    """
    Printing "p = 1.0, not significant" for a cell with no data states a
    conclusion the data cannot support. Undefined must stay undefined.
    """
    z, p = two_proportion_z(*args)
    assert z is None and p is None


# ── Welch's t ──────────────────────────────────────────────────────────────


def test_welch_t_matches_a_known_example():
    t, p = welch_t(7.0, 1.5, 50, 6.2, 1.4, 50)
    assert t == pytest.approx(2.76, abs=0.02)
    assert p is not None and p < 0.01


def test_welch_handles_unequal_variance_and_unequal_n():
    """The reason it is Welch and not Student: brand cells are rarely balanced."""
    t, p = welch_t(7.0, 0.5, 100, 6.5, 2.5, 12)
    assert t is not None and p is not None


@pytest.mark.parametrize("n1,n2", [(1, 30), (30, 1), (0, 0)])
def test_welch_needs_at_least_two_per_group(n1, n2):
    assert welch_t(5.0, 1.0, n1, 4.0, 1.0, n2) == (None, None)


def test_welch_with_no_spread_is_undefined_rather_than_infinite():
    assert welch_t(5.0, 0.0, 30, 5.0, 0.0, 30) == (None, None)


# ── Benjamini-Hochberg ─────────────────────────────────────────────────────


def test_bh_rejects_the_expected_set_in_the_canonical_example():
    """
    Benjamini & Hochberg (1995), Table 1 — all 15 p-values from the paper.

    BH rejects the four smallest. Testing each hypothesis at .05 on its own
    would reject nine, which is exactly the over-claiming this guards against:
    five of those would be false discoveries.
    """
    pvals = [
        0.0001, 0.0004, 0.0019, 0.0095, 0.0201,
        0.0278, 0.0298, 0.0344, 0.0459, 0.3240,
        0.4262, 0.5719, 0.6528, 0.7590, 1.0000,
    ]
    flags = benjamini_hochberg(pvals, alpha=0.05)

    assert flags == [True] * 4 + [False] * 11
    assert sum(1 for p in pvals if p < 0.05) == 9  # what uncorrected testing would claim


def test_bh_is_a_step_up_not_a_per_test_threshold():
    """
    A p-value below the cutoff rank is rejected even if it fails its own rank's
    threshold — that step-up behaviour is what separates BH from Bonferroni.
    """
    pvals = [0.01, 0.02, 0.03, 0.04, 0.05]
    flags = benjamini_hochberg(pvals, alpha=0.05)
    assert all(flags)


def test_bh_controls_the_family_wise_false_discovery_across_many_attributes():
    """
    30 attributes tested independently at .05 gives ~79% odds of at least one
    false "significantly ahead" — which is how a deck recommends acting on
    noise. Under BH, pure noise yields nothing.
    """
    noise = [0.2 + 0.02 * i for i in range(30)]
    assert not any(benjamini_hochberg(noise, alpha=0.05))


def test_bh_preserves_input_order_and_skips_undefined_tests():
    flags = benjamini_hochberg([0.9, None, 0.0001, None, 0.8])
    assert flags == [False, False, True, False, False]


def test_bh_on_an_empty_or_all_none_family_rejects_nothing():
    assert benjamini_hochberg([]) == []
    assert benjamini_hochberg([None, None]) == [False, False]


# ── Presentation helpers ───────────────────────────────────────────────────


@pytest.mark.parametrize(
    "p,expected",
    [
        (0.001, "p<.01"),
        (0.02, "p<.05"),
        (0.08, "p<.10"),
        (0.4, "ns"),
        (None, "ns"),
        (0.05, "p<.10"),   # boundary: .05 is not "< .05"
        (0.01, "p<.05"),
    ],
)
def test_significance_bands(p, expected):
    assert significance_band(p) == expected


def test_two_tailed_p_is_bounded_and_symmetric():
    assert two_tailed_p(0.0) == pytest.approx(1.0)
    assert two_tailed_p(1.96) == pytest.approx(0.05, abs=0.001)
    assert two_tailed_p(-1.96) == pytest.approx(two_tailed_p(1.96))
    assert 0.0 <= two_tailed_p(12.0) <= 1.0


@pytest.mark.parametrize("n,expected", [(0, True), (29, True), (30, False), (200, False)])
def test_low_base_gate(n, expected):
    assert is_low_base(n) is expected
    assert MIN_BASE_N == 30
