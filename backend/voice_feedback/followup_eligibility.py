"""Eligibility rules for live AI/MI follow-up on respondent questions."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Optional

from backend.voice_feedback.followup_rejection import FollowUpRejectionCode

PROBE_CATEGORIES = frozenset({"likes", "dislikes", "suggestions"})

ALLOWED_SURFACES = frozenset({
    "taste_l2_open_end",
    "product_test_open_end",
    "product_test_heatmap_comment",
    "product_test_heatmap_point_comment",
})

OPEN_END_PROBE_SURFACES = frozenset({
    "taste_l2_open_end",
    "product_test_open_end",
})

HEATMAP_SURFACES = frozenset({
    "product_test_heatmap_comment",
    "product_test_heatmap_point_comment",
})

OPEN_END_QUESTION_TYPES = frozenset({"open-ended", "text"})

DEFAULT_ELIGIBLE_SURFACES = frozenset({
    "taste_l2_open_end",
    "product_test_open_end",
})

# Public GET maps template_snapshot_l2 → layer2_questions; MongoDB stores template_snapshot_l2.
LAYER2_SCHEMA_SOURCES = ("layer2_questions", "template_snapshot_l2")


@dataclass(frozen=True)
class FollowUpEligibilityEvaluation:
    """Structured outcome from question/surface eligibility checks."""

    eligible: bool
    category: str
    surface: Optional[str] = None
    rejection_code: Optional[FollowUpRejectionCode] = None
    rejection_reason: Optional[str] = None


def resolve_layer2_schema(survey: dict[str, Any]) -> dict[str, Any]:
    """
    Unified L2 schema accessor for eligibility and surface inference.

    Prefers the first source that contains sections; falls back to any
    present L2 dict so callers can still iterate empty section lists.
    """
    for key in LAYER2_SCHEMA_SOURCES:
        raw = survey.get(key)
        if not isinstance(raw, dict):
            continue
        if raw.get("sections"):
            return raw
    for key in LAYER2_SCHEMA_SOURCES:
        raw = survey.get(key)
        if isinstance(raw, dict):
            return raw
    return {}


def resolve_eligible_surfaces(survey: dict[str, Any]) -> frozenset:
    """
    Surfaces where live AI/MI may run.
    Legacy surveys without eligible_surfaces keep all ALLOWED_SURFACES.
    New surveys may persist an explicit subset (default: taste + product open ends).
    """
    cfg = survey.get("ai_followup") or {}
    custom = cfg.get("eligible_surfaces")
    if custom:
        return frozenset(s for s in custom if s in ALLOWED_SURFACES)
    return ALLOWED_SURFACES


def resolve_min_answer_length(survey: dict[str, Any]) -> int:
    cfg = survey.get("ai_followup") or {}
    n = cfg.get("min_answer_length", 5)
    try:
        n = int(n)
    except (TypeError, ValueError):
        return 5
    return max(1, min(100, n))


def classify_question_category(question_text: str) -> str:
    q_lower = (question_text or "").lower()
    # Dislikes before likes — Egyptian negatives like ماعجبتكش contain عجب roots.
    if re.search(
        r"(dislike|hate|negative|didn't like|did not like|كرهت|لم يعجبك|لم تعجبك"
        r"|ماعجبتكش|ما عجبتكش|ماعجبكش|ما عجبكش|ماعجبنيش|لم يعجب)",
        q_lower,
    ):
        return "dislikes"
    if re.search(
        r"(like|enjoy|appreciate|positive|تحب|اعجبك|يعجبك|عجبتك|عجبك|أكتر حاجة عجبتك)",
        q_lower,
    ):
        return "likes"
    if re.search(
        r"(suggest|improve|recommend|change|اقترح|اقتراح|مقترح|مقترحات|تحسين|نحسن|توصية)",
        q_lower,
    ):
        return "suggestions"
    if re.search(r"(overall|general|think|feel|عام|رأيك|شعورك)", q_lower):
        return "overall"
    return "general"


def is_probe_category(category: Optional[str]) -> bool:
    return category in PROBE_CATEGORIES


def is_open_end_question_type(question: dict[str, Any]) -> bool:
    """True when schema question is an open-end (including MCQ open-end alias)."""
    q_type = question.get("type")
    if q_type in OPEN_END_QUESTION_TYPES:
        return True
    options = question.get("options") or []
    return (
        q_type == "mcq"
        and len(options) == 1
        and str(options[0]).lower() == "open-end"
    )


def _iter_layer2_questions(survey: dict[str, Any]):
    sections = resolve_layer2_schema(survey).get("sections") or []
    for section in sections:
        for question in section.get("questions") or []:
            yield section, question


def _iter_product_test_questions(survey: dict[str, Any]):
    snapshot = survey.get("product_test_snapshot") or {}
    for phase in snapshot.get("phases") or []:
        for section in phase.get("sections") or []:
            for question in section.get("questions") or []:
                yield question


def _resolve_layer2_question(survey: dict[str, Any], question_id: str) -> Optional[dict[str, Any]]:
    """Match brand-scoped L2 ids like BrandA_q1 or bare q1."""
    for _section, question in _iter_layer2_questions(survey):
        base_id = question.get("id")
        if not base_id:
            continue
        if question_id == base_id or question_id.endswith(f"_{base_id}"):
            return question
    return None


def _resolve_product_test_question(survey: dict[str, Any], question_id: str) -> Optional[dict[str, Any]]:
    for question in _iter_product_test_questions(survey):
        if question.get("id") == question_id:
            return question
    return None


def resolve_question_for_surface(
    survey: dict[str, Any],
    question_id: str,
    surface: str,
) -> Optional[dict[str, Any]]:
    """Resolve schema question document for an open-end probe surface."""
    if surface == "taste_l2_open_end":
        return _resolve_layer2_question(survey, question_id)
    if surface == "product_test_open_end":
        return _resolve_product_test_question(survey, question_id)
    return None


def _infer_surface(survey: dict[str, Any], question_id: str) -> Optional[str]:
    pt_question = _resolve_product_test_question(survey, question_id)
    if pt_question:
        if pt_question.get("type") == "packaging-heatmap":
            return "product_test_heatmap_comment"
        if is_open_end_question_type(pt_question):
            return "product_test_open_end"
        return None

    l2_question = _resolve_layer2_question(survey, question_id)
    if l2_question and is_open_end_question_type(l2_question):
        return "taste_l2_open_end"
    return None


def _open_end_surface_is_schema_valid(
    survey: dict[str, Any],
    question_id: str,
    surface: str,
) -> bool:
    """
    When survey schema can resolve the question, enforce open-end type.
    No timing/section gate for taste test — explicit surface + schema type only.
    """
    resolved = resolve_question_for_surface(survey, question_id, surface)
    if resolved is None:
        return True
    return is_open_end_question_type(resolved)


def evaluate_followup_question_eligibility(
    survey: dict[str, Any],
    *,
    question_id: str,
    question_text: str,
    question_category: Optional[str] = None,
    respondent_surface: Optional[str] = None,
) -> FollowUpEligibilityEvaluation:
    """
    Full eligibility evaluation with machine-readable rejection metadata.

    Rejects unknown surfaces, disabled surfaces, non-probe categories, and
    non-open-ended schema questions when L2/PT schema can be resolved.
    """
    category = question_category or classify_question_category(question_text)
    surface = respondent_surface or _infer_surface(survey, question_id)

    if not surface or surface not in ALLOWED_SURFACES:
        return FollowUpEligibilityEvaluation(
            eligible=False,
            category=category,
            surface=surface,
            rejection_code=FollowUpRejectionCode.SURFACE_UNKNOWN,
            rejection_reason=(
                "Could not resolve a supported respondent surface for this question."
                if not surface
                else f"Respondent surface '{surface}' is not supported for AI follow-up."
            ),
        )

    if surface not in resolve_eligible_surfaces(survey):
        return FollowUpEligibilityEvaluation(
            eligible=False,
            category=category,
            surface=surface,
            rejection_code=FollowUpRejectionCode.SURFACE_DISABLED,
            rejection_reason=f"Surface '{surface}' is not enabled for this survey.",
        )

    if surface in HEATMAP_SURFACES:
        return FollowUpEligibilityEvaluation(
            eligible=True,
            category=category,
            surface=surface,
        )

    if surface in OPEN_END_PROBE_SURFACES:
        if not is_probe_category(category):
            return FollowUpEligibilityEvaluation(
                eligible=False,
                category=category,
                surface=surface,
                rejection_code=FollowUpRejectionCode.NON_PROBE_CATEGORY,
                rejection_reason=(
                    f"Question category '{category}' is not eligible for AI follow-up probing."
                ),
            )
        if not _open_end_surface_is_schema_valid(survey, question_id, surface):
            resolved = resolve_question_for_surface(survey, question_id, surface)
            q_type = (resolved or {}).get("type", "unknown")
            return FollowUpEligibilityEvaluation(
                eligible=False,
                category=category,
                surface=surface,
                rejection_code=FollowUpRejectionCode.NON_OPEN_END_SCHEMA,
                rejection_reason=(
                    f"Question schema type '{q_type}' does not support open-end AI follow-up "
                    f"on surface '{surface}'."
                ),
            )
        return FollowUpEligibilityEvaluation(
            eligible=True,
            category=category,
            surface=surface,
        )

    return FollowUpEligibilityEvaluation(
        eligible=False,
        category=category,
        surface=surface,
        rejection_code=FollowUpRejectionCode.QUESTION_INELIGIBLE,
        rejection_reason="Question not eligible for AI follow-up.",
    )


def is_followup_question_eligible(
    survey: dict[str, Any],
    *,
    question_id: str,
    question_text: str,
    question_category: Optional[str] = None,
    respondent_surface: Optional[str] = None,
) -> tuple[bool, str]:
    """
    Returns (eligible, resolved_category).
    Rejects unknown surfaces, non-probe categories, and non-open-ended schema questions.
    """
    evaluation = evaluate_followup_question_eligibility(
        survey,
        question_id=question_id,
        question_text=question_text,
        question_category=question_category,
        respondent_surface=respondent_surface,
    )
    return evaluation.eligible, evaluation.category
