"""Conditional visibility metadata for product-test recommend open-ends."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

RECOMMEND_OPEN_END_VISIBLE_MIN = 6
RECOMMEND_OPEN_END_VISIBLE_MAX = 10

_RECOMMEND_SCALE_PATTERN = re.compile(
    r"\b(recommend|recommendation|likelihood\s+to\s+recommend|nps|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b",
    re.IGNORECASE,
)
_WHY_RECOMMEND_OPEN_PATTERN = re.compile(
    r"\b(why|reason|explain|what\s+made|لماذا|سبب|ما\s+الذي).*(recommend|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b",
    re.IGNORECASE,
)
_RECOMMEND_OPEN_ONLY_PATTERN = re.compile(
    r"\b(recommend|family|friends|صديق|عائل|أصدقاء|توصي|توصية)\b",
    re.IGNORECASE,
)
_WHY_HINT_PATTERN = re.compile(r"\b(why|reason|explain|لماذا|سبب)\b", re.IGNORECASE)


def _bank_text(q: Dict[str, Any], language: str) -> str:
    if language == "ar" and q.get("ar_text"):
        return str(q["ar_text"])
    return str(q.get("en_text") or "")


def _is_recommend_scale_bank_question(q: Dict[str, Any], language: str = "en") -> bool:
    q_type = (q.get("question_type") or "").lower()
    if "scale" not in q_type:
        return False
    return bool(_RECOMMEND_SCALE_PATTERN.search(_bank_text(q, language).lower()))


def _is_why_recommend_open_bank_question(q: Dict[str, Any], language: str = "en") -> bool:
    q_type = (q.get("question_type") or "").lower()
    is_open = (
        "open-end" in q_type
        or "text" in q_type
        or ("mcq" in q_type and "open-end" in str(q.get("en_options") or "").lower())
    )
    if not is_open:
        return False
    text = _bank_text(q, language).lower()
    return bool(_WHY_RECOMMEND_OPEN_PATTERN.search(text)) or (
        bool(_RECOMMEND_OPEN_ONLY_PATTERN.search(text)) and bool(_WHY_HINT_PATTERN.search(text))
    )


def _is_recommend_scale_respondent_question(question: Dict[str, Any]) -> bool:
    if question.get("type") != "scale":
        return False
    return bool(_RECOMMEND_SCALE_PATTERN.search(str(question.get("text") or "").lower()))


def _is_why_recommend_open_respondent_question(question: Dict[str, Any]) -> bool:
    if question.get("type") not in ("open-ended", "text"):
        return False
    text = str(question.get("text") or "").lower()
    return bool(_WHY_RECOMMEND_OPEN_PATTERN.search(text)) or (
        bool(_RECOMMEND_OPEN_ONLY_PATTERN.search(text)) and bool(_WHY_HINT_PATTERN.search(text))
    )


def build_recommend_visibility_condition(depends_on_question_id: str) -> Dict[str, Any]:
    return {
        "dependsOnQuestionId": depends_on_question_id,
        "min": RECOMMEND_OPEN_END_VISIBLE_MIN,
        "max": RECOMMEND_OPEN_END_VISIBLE_MAX,
    }


def apply_recommend_visibility_conditions(
    questions: List[Dict[str, Any]],
    bank_entries: Optional[List[tuple[str, Dict[str, Any]]]] = None,
    language: str = "en",
) -> List[Dict[str, Any]]:
    """Annotate why-recommend open-ends with visibilityCondition metadata."""
    if not questions:
        return questions

    bank_by_id: Dict[str, Dict[str, Any]] = {}
    if bank_entries:
        for bank_id, bank_q in bank_entries:
            bank_by_id[bank_id] = bank_q

    result = [dict(q) for q in questions]
    last_recommend_scale_id: Optional[str] = None

    for question in result:
        bank_id = question.get("canonicalQuestionId") or question.get("id")
        bank_q = bank_by_id.get(bank_id) if bank_id else None

        is_scale = (
            _is_recommend_scale_bank_question(bank_q, language)
            if bank_q
            else _is_recommend_scale_respondent_question(question)
        )
        if is_scale:
            last_recommend_scale_id = question.get("id")
            continue

        is_why_open = (
            _is_why_recommend_open_bank_question(bank_q, language)
            if bank_q
            else _is_why_recommend_open_respondent_question(question)
        )
        if is_why_open and last_recommend_scale_id:
            question["visibilityCondition"] = build_recommend_visibility_condition(last_recommend_scale_id)

    return result
