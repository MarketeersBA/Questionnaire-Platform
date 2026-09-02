"""
What a score on a rating scale actually means, and which metrics are valid for it.

The platform already records the answer: every taste-test library question
carries ``scale_shape``, ``point_labels`` and ``ideal_point``, and
``attribute_library.json`` states the contract outright — *"the point labels ARE
the semantics."* A 3 on a 1-5 sensory scale labelled *too little / just right /
too much* is the best possible answer; a 3 on a 1-5 purchase-intent ladder is
lukewarm. Same number, opposite meaning.

Until now nothing downstream read that. `aggregator.py` never wrote a scale
block onto its charts, so ``build_scale_context()`` fell through to "Scale
definition: NOT PROVIDED" on every chart in every report, and Top-2-Box was
computed against ``df["value"].max()`` — a single maximum taken across every
scale in the survey at once. In a taste test mixing 1-5 sensory scales with
1-10 hedonic ones that makes the T2B threshold 9, so every 1-5 question scored
0%.

This module is the fix on both counts. It resolves a question's semantics into
a :class:`ScaleSpec`, computes only the metrics that are meaningful for that
shape, and renders the spec into the exact dict the prompt layer already
expects.

The resolver is deliberately generic: any module, present or future, that
supplies ``scale_shape`` / ``point_labels`` / ``ideal_point`` on its question
metadata is handled correctly with no change here.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Literal, Optional, Sequence

from backend.analytics_module.stats import is_low_base, wilson_ci

logger = logging.getLogger(__name__)

ScaleShape = Literal["centered", "hedonic", "monotonic", "bipolar", "open_end", "unknown"]
ScaleSource = Literal["snapshot", "library", "product_test", "module", "inferred", "unknown"]

#: Metric keys, named once so the aggregator, the prompt layer, the frontend
#: and the tests cannot drift apart on spelling.
M_JUST_RIGHT = "just_right_pct"
M_TOO_LITTLE = "too_little_pct"
M_TOO_MUCH = "too_much_pct"
M_NET_SKEW = "net_skew"
M_T2B = "t2b_pct"
M_B2B = "b2b_pct"
M_TOP_BOX = "top_box_pct"
M_NET_LEAN = "net_lean"
M_MEAN = "mean"
M_SD = "sd"
M_N = "n"
M_CI95 = "ci95"

#: Which metrics each shape may report. `compute_metrics` never emits a key
#: outside its shape's set — that is what stops Top-2-Box appearing on a
#: centered scale, where it would score "too much" as a success.
VALID_METRICS: Dict[str, frozenset] = {
    "centered": frozenset({M_JUST_RIGHT, M_TOO_LITTLE, M_TOO_MUCH, M_NET_SKEW, M_MEAN, M_SD, M_N, M_CI95}),
    "hedonic": frozenset({M_T2B, M_B2B, M_TOP_BOX, M_MEAN, M_SD, M_N, M_CI95}),
    "monotonic": frozenset({M_T2B, M_TOP_BOX, M_MEAN, M_SD, M_N, M_CI95}),
    "bipolar": frozenset({M_NET_LEAN, M_MEAN, M_SD, M_N}),
    "open_end": frozenset(),
    "unknown": frozenset({M_MEAN, M_SD, M_N}),
}

#: The metric a chart should lead with, per shape — used for column headers and
#: for the single number the AI is told to cite.
HEADLINE_METRIC: Dict[str, Optional[str]] = {
    "centered": M_JUST_RIGHT,
    "hedonic": M_T2B,
    "monotonic": M_T2B,
    "bipolar": M_NET_LEAN,
    "open_end": None,
    "unknown": M_MEAN,
}

#: Human label for the headline metric, so a criteria table stops hard-coding
#: "T2B%" above a column that is actually a Just Right score.
HEADLINE_LABEL: Dict[str, str] = {
    "centered": "Just Right %",
    "hedonic": "T2B %",
    "monotonic": "T2B %",
    "bipolar": "Net Lean",
    "open_end": "",
    "unknown": "Mean",
}

_KNOWN_SHAPES = frozenset({"centered", "hedonic", "monotonic", "bipolar", "open_end"})


@dataclass(frozen=True)
class ScaleSpec:
    """Resolved semantics for one question's rating scale."""

    shape: ScaleShape = "unknown"
    min: int = 1
    max: int = 5
    ideal_point: Optional[int] = None
    labels: List[str] = field(default_factory=list)
    question_id: Optional[str] = None
    source: ScaleSource = "unknown"

    @property
    def is_known(self) -> bool:
        return self.shape in _KNOWN_SHAPES

    @property
    def point_count(self) -> int:
        return max(0, int(self.max) - int(self.min) + 1)

    @property
    def headline_metric(self) -> Optional[str]:
        return HEADLINE_METRIC.get(self.shape, M_MEAN)

    @property
    def headline_label(self) -> str:
        return HEADLINE_LABEL.get(self.shape, "Mean")

    def allows(self, metric: str) -> bool:
        return metric in VALID_METRICS.get(self.shape, frozenset())

    @property
    def labels_align(self) -> bool:
        """True when there is exactly one label per scale point."""
        return bool(self.labels) and len(self.labels) == self.point_count


def _coerce_int(value: Any, default: Optional[int] = None) -> Optional[int]:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def _normalize_shape(raw: Any) -> ScaleShape:
    shape = str(raw or "").strip().lower()
    if shape in _KNOWN_SHAPES:
        return shape  # type: ignore[return-value]
    # A few historical spellings seen in older snapshots.
    if shape in ("jar", "just_about_right", "just-about-right"):
        return "centered"
    if shape in ("likert", "linear", "intensity"):
        return "monotonic"
    if shape in ("open", "open_ended", "openend"):
        return "open_end"
    return "unknown"


def _derive_ideal_point(shape: ScaleShape, lo: int, hi: int) -> Optional[int]:
    """
    Where the good answer sits, when the question did not say.

    Mirrors ``orchestration_service.map_taste_test_question`` so the respondent
    UI's emerald "ideal" highlight and the report's Just Right calculation agree
    on the same point.
    """
    if shape == "centered":
        return (lo + hi) // 2
    if shape in ("hedonic", "monotonic"):
        return hi
    return None


def resolve_scale_spec(
    question_meta: Optional[Dict[str, Any]],
    *,
    question_id: Optional[str] = None,
    source: ScaleSource = "unknown",
    fallback: Optional[ScaleSpec] = None,
) -> ScaleSpec:
    """
    Build a :class:`ScaleSpec` from a question's metadata.

    Accepts both the frontend camelCase shape (``scaleShape`` / ``pointLabels``
    / ``idealPoint`` / ``scaleMax``, as written by ``orchestration_service``
    into ``template_snapshot_l2``) and the library snake_case shape
    (``scale_shape`` / ``point_labels`` / ``ideal_point`` / ``scale_max``), so
    callers do not have to normalise first.

    Returns an ``unknown`` spec rather than guessing when the shape is absent.
    A guess here silently inverts a score's meaning; "unknown" merely costs the
    report a directional claim it was not entitled to make.
    """
    meta = question_meta or {}

    def pick(*keys: str) -> Any:
        for key in keys:
            if key in meta and meta[key] not in (None, ""):
                return meta[key]
        return None

    shape = _normalize_shape(pick("scaleShape", "scale_shape"))
    if shape == "unknown" and fallback is not None:
        return fallback

    lo = _coerce_int(pick("scaleMin", "scale_min", "min"), 1) or 1
    hi = _coerce_int(pick("scaleMax", "scale_max", "max"))
    if hi is None:
        hi = fallback.max if fallback else 5
    if hi <= lo:
        # A malformed range would make every threshold nonsense; treat the
        # question as unlabelled instead of inventing a span.
        logger.warning(
            "Scale for %s has max %s <= min %s; treating as unknown.",
            question_id or "<unknown question>",
            hi,
            lo,
        )
        return ScaleSpec(question_id=question_id, source=source)

    raw_labels = pick("pointLabels", "point_labels") or []
    labels = [str(x) for x in raw_labels] if isinstance(raw_labels, (list, tuple)) else []

    ideal = _coerce_int(pick("idealPoint", "ideal_point"))
    if ideal is None:
        ideal = _derive_ideal_point(shape, lo, hi)
    if ideal is not None and not (lo <= ideal <= hi):
        logger.warning(
            "Ideal point %s for %s falls outside %s-%s; re-deriving.",
            ideal,
            question_id or "<unknown question>",
            lo,
            hi,
        )
        ideal = _derive_ideal_point(shape, lo, hi)

    return ScaleSpec(
        shape=shape,
        min=lo,
        max=hi,
        ideal_point=ideal,
        labels=labels,
        question_id=question_id,
        source=source,
    )


def to_prompt_dict(spec: Optional[ScaleSpec]) -> Optional[Dict[str, Any]]:
    """
    Render a spec into ``ChartPayload.metadata["scale"]``.

    The key names match what ``chart_insight_engine.build_scale_context`` already
    reads, so attaching this is the whole of what turns the god prompt's
    "READING RATING SCALES" section from dead text into an active instruction.

    Returns ``None`` for an unknown scale so the prompt layer keeps its explicit
    "do not assume a direction" fallback rather than being handed a shapeless
    block it would have to interpret.
    """
    if spec is None or not spec.is_known:
        return None

    payload: Dict[str, Any] = {
        "shape": spec.shape,
        "min": spec.min,
        "max": spec.max,
        "ideal_point": spec.ideal_point,
        "labels": spec.labels if spec.labels_align else [],
    }

    notes: List[str] = []

    if spec.shape == "centered":
        notes.append(
            "Both ends are failures on this scale. Report Just Right % and the "
            "direction of the skew; Top-2-Box is invalid here because it would "
            "score 'too much' as a success."
        )
    elif spec.shape == "monotonic":
        notes.append(
            "A ladder, not a sensory scale: the midpoint is lukewarm, not ideal."
        )

    if spec.labels and not spec.labels_align:
        # Stated rather than silently dropped. This is an authoring bug, and the
        # model needs to know the labels are missing — not merely absent — so it
        # does not lean on a direction it was never shown.
        notes.append(
            "Point labels were omitted because their count did not match the "
            "number of scale points."
        )

    if notes:
        payload["interpretation_note"] = " ".join(notes)

    return payload


def _round(value: float, places: int = 1) -> float:
    return round(float(value), places)


def compute_metrics(
    values: Sequence[Any] | Iterable[Any],
    spec: Optional[ScaleSpec],
) -> Dict[str, Any]:
    """
    Compute every metric that is valid for this scale, and none that are not.

    Thresholds come from ``spec.max`` — this question's own maximum — never from
    the maximum observed across a mixed dataset. That distinction is the whole
    of the Top-2-Box bug this module exists to fix.

    The returned dict is what the AI is given as authoritative and told to cite,
    so it carries the base size and confidence interval alongside each figure
    rather than a bare percentage.
    """
    # NaN has to be excluded explicitly: pandas turns a missing answer into
    # float("nan"), which passes an isinstance(float) check and then blows up in
    # round(). Skipped rather than imputed — a respondent who did not answer is
    # not evidence of anything, and filling the gap would move the mean.
    numeric = [
        float(v)
        for v in (values or [])
        if isinstance(v, (int, float))
        and not isinstance(v, bool)
        and math.isfinite(v)
    ]
    n = len(numeric)

    if spec is None:
        spec = ScaleSpec()

    if spec.shape == "open_end" or n == 0:
        return {M_N: n, "scale_shape": spec.shape, "low_base": is_low_base(n)}

    mean = sum(numeric) / n
    variance = sum((v - mean) ** 2 for v in numeric) / (n - 1) if n > 1 else 0.0
    sd = variance ** 0.5

    metrics: Dict[str, Any] = {
        M_N: n,
        M_MEAN: _round(mean, 2),
        M_SD: _round(sd, 2),
        "scale_shape": spec.shape,
        "scale_min": spec.min,
        "scale_max": spec.max,
        "low_base": is_low_base(n),
    }

    def pct(count: int) -> float:
        return _round(100.0 * count / n)

    if spec.shape == "centered":
        ideal = spec.ideal_point if spec.ideal_point is not None else (spec.min + spec.max) // 2
        just_right = sum(1 for v in numeric if round(v) == ideal)
        too_little = sum(1 for v in numeric if round(v) < ideal)
        too_much = sum(1 for v in numeric if round(v) > ideal)

        metrics[M_JUST_RIGHT] = pct(just_right)
        metrics[M_TOO_LITTLE] = pct(too_little)
        metrics[M_TOO_MUCH] = pct(too_much)
        # Positive = skewed toward "too much". Signed so a report can say which
        # way to reformulate, not merely that something is off.
        metrics[M_NET_SKEW] = _round(pct(too_much) - pct(too_little))
        metrics[M_CI95] = wilson_ci(just_right, n)
        # A mean is arithmetically fine but directionally meaningless here: 1s
        # and 5s average to the ideal while describing a product nobody liked.
        metrics["mean_is_directional"] = False

    elif spec.shape in ("hedonic", "monotonic"):
        t2b_floor = spec.max - 1
        b2b_ceiling = spec.min + 1
        t2b = sum(1 for v in numeric if v >= t2b_floor)
        top_box = sum(1 for v in numeric if round(v) == spec.max)

        metrics[M_T2B] = pct(t2b)
        metrics[M_TOP_BOX] = pct(top_box)
        metrics[M_CI95] = wilson_ci(t2b, n)
        metrics["t2b_threshold"] = t2b_floor
        metrics["mean_is_directional"] = True

        if spec.shape == "hedonic":
            metrics[M_B2B] = pct(sum(1 for v in numeric if v <= b2b_ceiling))

    elif spec.shape == "bipolar":
        midpoint = (spec.min + spec.max) / 2.0
        right = sum(1 for v in numeric if v > midpoint)
        left = sum(1 for v in numeric if v < midpoint)
        metrics[M_NET_LEAN] = _round(pct(right) - pct(left))
        metrics["mean_is_directional"] = False

    else:  # unknown
        metrics["mean_is_directional"] = False

    return metrics


def headline_value(metrics: Dict[str, Any], spec: Optional[ScaleSpec]) -> Optional[float]:
    """The single number a chart leads with, given its scale shape."""
    if not metrics or spec is None:
        return None
    key = spec.headline_metric
    if not key:
        return None
    value = metrics.get(key)
    return float(value) if isinstance(value, (int, float)) else None
