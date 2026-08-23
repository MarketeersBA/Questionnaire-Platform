"""
Server-side enforcement of the Key Finding contract.

The god prompt instructs the model to answer the business question using only
measured attributes, but a prompt is guidance, not a guarantee. This module is
the enforcement layer: it inspects the generated Key Finding, rejects the
failure modes actually observed in production, and substitutes a deterministic
sentence built from the report data when the model will not comply.

Observed failure modes this catches:

* Market-structure vocabulary on a study that never measured it, e.g.
  "Must Address Critical Taste Perception and Market Entrenchment".
* Exhortation instead of finding: "must address", "to compete effectively".
* Compound demands that name two drivers at once.
* Attributes that were never rated by respondents.
* Claims with no figure, which cannot be checked against any chart.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

logger = logging.getLogger(__name__)

# Market-structure / equity language. Only legitimate when a module that
# measures it actually ran.
BANNED_TERMS: Tuple[str, ...] = (
    "market entrenchment",
    "market penetration",
    "brand equity",
    "brand heritage",
    "shelf presence",
    "distribution gap",
    "market share",
    "competitive moat",
    "category leadership",
    "consumer mindshare",
    "brand salience",
)

# Verbs that turn a finding into an instruction with no evidence attached.
EMPTY_VERBS: Tuple[str, ...] = (
    "must address",
    "needs to improve",
    "should focus on",
    "to compete effectively",
    "needs to address",
    "must improve",
    "should address",
)

# Modules that legitimise funnel / awareness / equity language.
_MARKET_MODULE_HINTS = ("funnel", "awareness", "loyalty", "usage", "equity", "tracking")


@dataclass
class KeyFindingVerdict:
    """Why a Key Finding passed or failed."""

    ok: bool
    reasons: List[str] = field(default_factory=list)

    def as_instruction(self) -> str:
        """Corrective text suitable for a retry prompt."""
        return " ".join(self.reasons)


def _norm(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _modules_allow_market_language(modules: Optional[Sequence[str]]) -> bool:
    joined = " ".join(str(m).lower() for m in (modules or []))
    return any(hint in joined for hint in _MARKET_MODULE_HINTS)


def validate_key_finding(
    text: str,
    *,
    measured_attributes: Optional[Sequence[str]] = None,
    modules_used: Optional[Sequence[str]] = None,
    max_words: int = 24,
) -> KeyFindingVerdict:
    """Check one Key Finding against the contract."""
    body = _norm(text)
    if not body:
        return KeyFindingVerdict(False, ["The Key Finding was empty."])

    reasons: List[str] = []
    lowered = body.lower()

    if not _modules_allow_market_language(modules_used):
        for term in BANNED_TERMS:
            if term in lowered:
                reasons.append(
                    "Remove '" + term + "': no module in this survey measured it. "
                    "Name a rated attribute instead."
                )

    for verb in EMPTY_VERBS:
        if verb in lowered:
            reasons.append(
                "Remove the exhortation '" + verb + "'. State what the data shows, "
                "not what the brand should do."
            )

    # A compound demand joins two drivers with "and" around a verb phrase.
    if re.search(r"\b(address|improve|fix|tackle)\b[^.]*\band\b", lowered):
        reasons.append("State one driver, not two joined by 'and'.")

    words = body.split()
    if len(words) > max_words:
        reasons.append(
            "Shorten to " + str(max_words) + " words or fewer (currently "
            + str(len(words)) + ")."
        )

    # At least one figure makes the claim falsifiable against a chart.
    if not re.search(r"\d", body):
        reasons.append("Cite one figure from the data so the claim is falsifiable.")

    attributes = [a for a in (measured_attributes or []) if _norm(a)]
    if attributes:
        if not any(_norm(a).lower() in lowered for a in attributes):
            preview = ", ".join(str(a) for a in attributes[:6])
            reasons.append(
                "Name one of the attributes respondents actually rated (" + preview + ")."
            )

    return KeyFindingVerdict(not reasons, reasons)


def _top_driver(charts: Optional[Sequence[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """Strongest measured driver, from the driver-ranking chart."""
    for chart in charts or []:
        if chart.get("chart_type") != "driver_ranking":
            continue
        datasets = (chart.get("data") or {}).get("datasets") or []
        points: List[Dict[str, Any]] = []
        for ds in datasets:
            points.extend(ds.get("data") or [])
        numeric = [
            p for p in points
            if isinstance(p.get("x"), (int, float))
            and (p.get("main_attribute") or p.get("attribute"))
        ]
        if numeric:
            return max(numeric, key=lambda p: p.get("x") or 0)
    return None


def _preference_leader(
    charts: Optional[Sequence[Dict[str, Any]]],
) -> Optional[Tuple[str, float]]:
    """Brand and percentage of whoever leads the preference comparison."""
    for chart in charts or []:
        if chart.get("chart_type") not in ("horizontal_bar", "preference_bar"):
            continue
        data = chart.get("data") or {}
        labels = data.get("labels") or []
        datasets = data.get("datasets") or []
        if not labels or not datasets:
            continue
        values = datasets[0].get("data") or []
        pairs = [
            (labels[i], values[i])
            for i in range(min(len(labels), len(values)))
            if isinstance(values[i], (int, float))
        ]
        if pairs:
            best = max(pairs, key=lambda kv: kv[1])
            return (_norm(best[0]), float(best[1]))
    return None


def build_fallback_key_finding(
    *,
    target_brand: str,
    charts: Optional[Sequence[Dict[str, Any]]],
    survey_objective: str = "",
    measured_attributes: Optional[Sequence[str]] = None,
) -> str:
    """
    Deterministic, data-grounded Key Finding.

    Used when the model cannot produce a compliant sentence. Every clause is
    read off a computed chart, so it is always inside the measurement scope and
    always checkable. Intentionally plain rather than rhetorical.
    """
    brand = _norm(target_brand) or "The target brand"
    driver = _top_driver(charts)
    leader = _preference_leader(charts)

    driver_name = ""
    if driver:
        driver_name = _norm(driver.get("main_attribute") or driver.get("attribute"))
    if not driver_name and measured_attributes:
        driver_name = _norm(measured_attributes[0])

    parts: List[str] = []
    if driver_name:
        impact = driver.get("x") if driver else None
        if isinstance(impact, (int, float)):
            parts.append(
                driver_name + " is the strongest measured driver for " + brand
                + " at " + str(round(float(impact))) + "% impact"
            )
        else:
            parts.append(driver_name + " is the strongest measured driver for " + brand)

    if leader:
        leader_brand, leader_pct = leader
        parts.append(leader_brand + " leads preference at " + str(round(leader_pct)) + "%")

    if not parts:
        objective = _norm(survey_objective) or "the study objective"
        return brand + ": insufficient measured data to state a finding against " + objective + "."

    return "; ".join(parts) + "."


def enforce_key_finding(
    text: str,
    *,
    target_brand: str,
    charts: Optional[Sequence[Dict[str, Any]]],
    measured_attributes: Optional[Sequence[str]] = None,
    modules_used: Optional[Sequence[str]] = None,
    survey_objective: str = "",
) -> Tuple[str, KeyFindingVerdict]:
    """
    Validate, and substitute a deterministic sentence when validation fails.

    Returns (final_text, verdict) so the caller can log precisely what was
    rejected rather than silently swapping the narrative.
    """
    verdict = validate_key_finding(
        text,
        measured_attributes=measured_attributes,
        modules_used=modules_used,
    )
    if verdict.ok:
        return _norm(text), verdict

    logger.warning(
        "[KeyFinding] Rejected generated summary (%d issue(s)): %s",
        len(verdict.reasons), " | ".join(verdict.reasons),
    )
    fallback = build_fallback_key_finding(
        target_brand=target_brand,
        charts=charts,
        survey_objective=survey_objective,
        measured_attributes=measured_attributes,
    )
    logger.warning("[KeyFinding] Substituted data-grounded fallback: %s", fallback)
    return fallback, verdict
