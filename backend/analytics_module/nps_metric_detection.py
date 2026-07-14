"""Shared detection rules for likelihood-to-recommend / NPS scale rows."""

from __future__ import annotations

import re

import pandas as pd

# Align with product-test recommend visibility (EN + AR question text).
RECOMMEND_NPS_METRIC_PATTERN = (
    r"recommend|recommendation|likelihood\s+to\s+recommend|nps|"
    r"family|friends|"
    r"صديق|عائل|أصدقاء|توصي|توصية|ترشح|صحاب|قرايب"
)

_RECOMMEND_NPS_METRIC_RE = re.compile(RECOMMEND_NPS_METRIC_PATTERN, re.IGNORECASE)


def is_recommend_nps_metric(metric: object) -> bool:
    """Return True when a flat_evaluation metric labels a recommend/NPS scale."""
    if metric is None:
        return False
    return bool(_RECOMMEND_NPS_METRIC_RE.search(str(metric)))


def recommend_nps_row_mask(metrics: pd.Series) -> pd.Series:
    """Boolean mask for scale-evaluation rows that represent recommend/NPS."""
    if metrics.empty:
        return metrics.astype(bool)
    return metrics.astype(str).apply(is_recommend_nps_metric)
