"""
Purchase intent row detection for analytics aggregation.

Centralizes PI identification so purchase_intent() and brand_comparison_pi_ol()
share identical rules across English, Arabic, and canonical taste-test question IDs.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, FrozenSet, List, Optional, Set

import pandas as pd

# Canonical taste-test purchase intent question IDs (stable across surveys).
DEFAULT_PI_QUESTION_IDS: FrozenSet[str] = frozenset(
    {
        "tt_q15",
        "tt_fallback_purchase_intent",
    }
)

# English metric / attribute cues.
_PI_METRIC_EN = re.compile(
    r"(?:"
    r"intend(?:\s+to)?\s+buy|"
    r"likelihood\s+to\s+buy|"
    r"purchase\s+intent|"
    r"purchase\s+likelihood|"
    r"\bpi\b|"
    r"\bintent\b|"
    r"\bbuy\b|"
    r"\bpurchase\b"
    r")",
    re.IGNORECASE,
)

# Arabic metric cues (ice cream / MENA taste tests).
_PI_METRIC_AR = re.compile(r"(?:تشتري|ناوي|شراء|شرائك|احتمالية\s*شراء)")

# Attribute-level PI labels (less common but supported).
_PI_ATTRIBUTE = re.compile(
    r"(?:purchase\s*intent|likelihood\s+to\s+buy|\bpi\b|\bintent\b)",
    re.IGNORECASE,
)

# Exclude price-sensitivity rows that also mention "buy" in Arabic/English.
_PRICE_EXCLUSION = re.compile(
    r"(?:"
    r"price|pricing|real\s+price|van\s+westendorp|"
    r"how\s+much|at\s+what\s+price|"
    r"سعر|بسعر|بكام|بكم|كم\s*سعر"
    r")",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class PurchaseIntentDiagnostics:
    """Non-breaking diagnostics surfaced in chart metadata and tests."""

    matched_row_count: int = 0
    brands_with_pi: List[str] = field(default_factory=list)
    brands_missing_pi: List[str] = field(default_factory=list)
    detection_sources: List[str] = field(default_factory=list)

    def to_metadata(self) -> Dict[str, Any]:
        return {
            "matched_row_count": self.matched_row_count,
            "brands_with_pi": list(self.brands_with_pi),
            "brands_missing_pi": list(self.brands_missing_pi),
            "detection_sources": list(self.detection_sources),
        }


def _normalize_text(series: pd.Series) -> pd.Series:
    return series.fillna("").astype(str).str.strip()


def _question_ids_from_map(question_map: Optional[Dict[str, Any]]) -> Set[str]:
    """Infer PI question IDs from survey question_map text when available."""
    if not isinstance(question_map, dict):
        return set()

    discovered: Set[str] = set()
    for qid, meta in question_map.items():
        if not isinstance(meta, dict):
            continue
        blob = " ".join(
            str(meta.get(k, "") or "")
            for k in ("text", "en_text", "ar_text", "label", "supp_att", "main_att", "question_status")
        )
        if not blob.strip():
            continue
        if _PRICE_EXCLUSION.search(blob):
            continue
        if _PI_METRIC_EN.search(blob) or _PI_METRIC_AR.search(blob) or _PI_ATTRIBUTE.search(blob):
            discovered.add(str(qid).strip())
    return discovered


def resolve_pi_question_ids(question_map: Optional[Dict[str, Any]] = None) -> Set[str]:
    ids = set(DEFAULT_PI_QUESTION_IDS)
    ids.update(_question_ids_from_map(question_map))
    return ids


def purchase_intent_row_mask(
    df: pd.DataFrame,
    *,
    question_map: Optional[Dict[str, Any]] = None,
    extra_question_ids: Optional[Set[str]] = None,
) -> pd.Series:
    """
    Boolean mask over scale_evaluations rows that represent purchase intent.

    A row matches when ANY of:
      - question_id is a known / inferred PI question
      - metric text matches PI patterns (EN or AR) and is not a price question
      - attribute text matches PI attribute patterns (and metric is not price-like)
    """
    if df.empty:
        return pd.Series(dtype=bool)

    metric = _normalize_text(df["metric"])
    attribute = _normalize_text(df.get("attribute", pd.Series([""] * len(df), index=df.index)))
    question_id = _normalize_text(df.get("question_id", pd.Series([""] * len(df), index=df.index)))

    pi_qids = resolve_pi_question_ids(question_map)
    if extra_question_ids:
        pi_qids = pi_qids | {str(q).strip() for q in extra_question_ids}

    by_question = question_id.isin(pi_qids)

    combined_text = metric + " " + attribute
    is_price = combined_text.str.contains(_PRICE_EXCLUSION.pattern, case=False, regex=True, na=False)

    by_metric_en = metric.str.contains(_PI_METRIC_EN.pattern, case=False, regex=True, na=False)
    by_metric_ar = metric.str.contains(_PI_METRIC_AR.pattern, case=False, regex=True, na=False)
    by_attribute = attribute.str.contains(_PI_ATTRIBUTE.pattern, case=False, regex=True, na=False)

    # Attribute-only match still requires non-price metric context.
    text_match = (by_metric_en | by_metric_ar | (by_attribute & ~metric.str.len().eq(0))) & ~is_price

    return by_question | text_match


def filter_purchase_intent_rows(
    df: pd.DataFrame,
    *,
    question_map: Optional[Dict[str, Any]] = None,
    extra_question_ids: Optional[Set[str]] = None,
) -> pd.DataFrame:
    mask = purchase_intent_row_mask(df, question_map=question_map, extra_question_ids=extra_question_ids)
    return df[mask].copy()


def compute_pi_t2b_by_brand(
    intent_df: pd.DataFrame,
    brands: List[str],
) -> Dict[str, float]:
    """Top-2-Box % per brand from matched PI rows."""
    if intent_df.empty or not brands:
        return {b: 0.0 for b in brands}

    max_val = float(intent_df["value"].max())
    threshold = max_val - 1
    flagged = intent_df.copy()
    flagged["is_t2b"] = flagged["value"] >= threshold
    t2b = flagged.groupby("brand")["is_t2b"].mean() * 100

    return {b: round(float(t2b.get(b, 0.0)), 1) for b in brands}


def build_pi_diagnostics(
    intent_df: pd.DataFrame,
    brands: List[str],
    overall_brands: Optional[Set[str]] = None,
) -> PurchaseIntentDiagnostics:
    """
    Identify brands that have likability (or other OL data) but no PI rows.

    Used in tests and chart metadata so missing PI is explicit, not an accidental zero.
    """
    brands_with_pi = sorted(intent_df["brand"].dropna().unique().tolist()) if not intent_df.empty else []
    brands_with_pi_set = set(brands_with_pi)

    ol_set = overall_brands or set()
    candidate_brands = sorted(set(brands) | ol_set)
    brands_missing_pi = [b for b in candidate_brands if b in ol_set and b not in brands_with_pi_set]

    sources: List[str] = []
    if not intent_df.empty:
        if intent_df["question_id"].isin(resolve_pi_question_ids()).any():
            sources.append("question_id")
        metric_blob = " ".join(intent_df["metric"].dropna().astype(str).tolist())
        if _PI_METRIC_EN.search(metric_blob):
            sources.append("metric_en")
        if _PI_METRIC_AR.search(metric_blob):
            sources.append("metric_ar")
        if intent_df.get("attribute", pd.Series(dtype=str)).astype(str).str.contains(
            _PI_ATTRIBUTE.pattern, case=False, regex=True, na=False
        ).any():
            sources.append("attribute")

    return PurchaseIntentDiagnostics(
        matched_row_count=len(intent_df),
        brands_with_pi=brands_with_pi,
        brands_missing_pi=brands_missing_pi,
        detection_sources=sources or (["none"] if intent_df.empty else ["unknown"]),
    )
