"""Stable deduplication keys for smart follow-up OpenAI calls."""

from __future__ import annotations

import hashlib
import re
from typing import Optional


def _normalize_answer(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def build_followup_dedup_key(
    *,
    survey_id: str = "",
    token: str = "",
    question_id: str = "",
    current_round: int = 1,
    source: Optional[str] = None,
    answer_text: str = "",
) -> str:
    """
    Stable key for AIGuard coalescing duplicate blur/retry events.
    Same respondent + question + round + channel + answer => one OpenAI call.
    """
    payload = "|".join([
        str(survey_id or ""),
        str(token or ""),
        str(question_id or ""),
        str(int(current_round)),
        str(source or ""),
        _normalize_answer(answer_text),
    ])
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"smart_followup:{digest}"
