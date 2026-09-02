"""
Inferential statistics for report metrics.

Everything the report claims about a difference between two brands runs through
here, so that "X leads Y" is a tested statement rather than a reading of two
numbers that happen to differ. Two things this module exists to prevent:

  * calling a gap real when the base sizes cannot support it, and
  * calling a gap real because *one* of thirty attributes crossed p < .05 by
    chance — hence the Benjamini-Hochberg correction.

`scipy` and `statsmodels` are already project dependencies, but the handful of
formulas used here are short and exact, so they are implemented directly. That
keeps the numbers auditable against a textbook and avoids a hard import in the
aggregator's hot path.
"""
from __future__ import annotations

import math
from typing import List, Literal, Optional, Sequence, Tuple

#: Below this, a per-cell finding is reported as indicative rather than
#: conclusive. 30 is the conventional market-research floor for reporting a
#: subgroup at all; it is not a significance threshold and does not replace one.
MIN_BASE_N = 30

SignificanceBand = Literal["ns", "p<.10", "p<.05", "p<.01"]

# Two-tailed normal quantiles, so a p-value can be banded without scipy.
_Z_90 = 1.6449
_Z_95 = 1.9600
_Z_99 = 2.5758


def _normal_sf(z: float) -> float:
    """Upper-tail probability of the standard normal, via the error function."""
    return 0.5 * math.erfc(z / math.sqrt(2.0))


def two_tailed_p(z: float) -> float:
    """Two-tailed p-value for a z statistic."""
    return min(1.0, 2.0 * _normal_sf(abs(z)))


def wilson_ci(k: int, n: int, z: float = _Z_95) -> Tuple[float, float]:
    """
    Wilson score interval for a proportion, returned as percentages.

    Wilson rather than the textbook normal approximation because report
    proportions routinely sit near 0% or 100% (a niche competitor's awareness,
    a winning brand's Just Right score) where the normal interval runs past the
    ends of the scale and reports a negative lower bound.
    """
    if n <= 0:
        return (0.0, 0.0)

    k = max(0, min(int(k), int(n)))
    p = k / n
    denom = 1.0 + (z * z) / n
    centre = p + (z * z) / (2 * n)
    margin = z * math.sqrt((p * (1 - p) / n) + (z * z) / (4 * n * n))

    low = (centre - margin) / denom
    high = (centre + margin) / denom
    return (round(max(0.0, low) * 100, 1), round(min(1.0, high) * 100, 1))


def two_proportion_z(
    k1: int, n1: int, k2: int, n2: int
) -> Tuple[Optional[float], Optional[float]]:
    """
    Pooled two-proportion z test. Returns ``(z, p)``, or ``(None, None)`` when
    the comparison is not defined.

    Undefined rather than zero when a base is empty or both groups are entirely
    uniform: a report that prints "p = 1.0, not significant" for a cell with no
    data is making a claim it has no grounds for.
    """
    if n1 <= 0 or n2 <= 0:
        return (None, None)

    p1 = k1 / n1
    p2 = k2 / n2
    pooled = (k1 + k2) / (n1 + n2)

    if pooled <= 0.0 or pooled >= 1.0:
        return (None, None)

    se = math.sqrt(pooled * (1 - pooled) * ((1 / n1) + (1 / n2)))
    if se == 0:
        return (None, None)

    z = (p1 - p2) / se
    return (round(z, 4), round(two_tailed_p(z), 5))


def welch_t(
    m1: float, sd1: float, n1: int, m2: float, sd2: float, n2: int
) -> Tuple[Optional[float], Optional[float]]:
    """
    Welch's t test for two means. Returns ``(t, p)``.

    Welch rather than Student because brand cells in a monadic design rarely
    have equal n or equal variance, and the equal-variance assumption inflates
    significance exactly when the design is most unbalanced.

    The p-value uses a normal approximation to the t distribution, which is
    close enough at the base sizes reports are allowed to draw conclusions from
    (n >= 30 per the MIN_BASE_N gate) and avoids a scipy import here.
    """
    if n1 < 2 or n2 < 2:
        return (None, None)

    v1 = (sd1 * sd1) / n1
    v2 = (sd2 * sd2) / n2
    denom = v1 + v2
    if denom <= 0:
        return (None, None)

    t = (m1 - m2) / math.sqrt(denom)
    return (round(t, 4), round(two_tailed_p(t), 5))


def benjamini_hochberg(pvals: Sequence[Optional[float]], alpha: float = 0.05) -> List[bool]:
    """
    Benjamini-Hochberg step-up procedure. Returns one "reject null" flag per
    input, in the original order; ``None`` inputs are never rejected.

    A criteria table tests every attribute at once. At 30 attributes, testing
    each at .05 independently yields roughly a 79% chance of at least one false
    "significantly ahead" — which is how a deck ends up recommending action on
    noise. Controlling the false-discovery rate across the family is the fix.
    """
    indexed = [(i, p) for i, p in enumerate(pvals) if p is not None]
    flags = [False] * len(pvals)
    m = len(indexed)
    if m == 0:
        return flags

    indexed.sort(key=lambda pair: pair[1])

    # Walk down from the largest p; everything at or below the first survivor
    # is rejected too (the "step-up" part — a smaller p cannot be less
    # significant than one already accepted).
    cutoff_rank = 0
    for rank, (_, p) in enumerate(indexed, start=1):
        if p <= (rank / m) * alpha:
            cutoff_rank = rank

    for rank, (original_index, _) in enumerate(indexed, start=1):
        if rank <= cutoff_rank:
            flags[original_index] = True

    return flags


def significance_band(p: Optional[float]) -> SignificanceBand:
    """Bucket a p-value for display. ``None`` reads as not significant."""
    if p is None:
        return "ns"
    if p < 0.01:
        return "p<.01"
    if p < 0.05:
        return "p<.05"
    if p < 0.10:
        return "p<.10"
    return "ns"


def is_low_base(n: int) -> bool:
    """True when n is too small to state a finding as conclusive."""
    return int(n or 0) < MIN_BASE_N
