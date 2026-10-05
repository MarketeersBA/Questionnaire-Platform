"""Structured context passed from the public follow-up API into SmartFollowUpEngine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass(frozen=True)
class FollowUpEngineContext:
    """Normalized payload for a single smart follow-up evaluation round."""

    question: str
    answer: str
    brand_name: str
    survey_objective: str
    custom_instructions: str
    question_category: str
    survey_type: str
    respondent_surface: Optional[str] = None
    previous_turns: list[dict[str, Any]] = field(default_factory=list)
    # Resolved from the survey in from_survey_request when not given. It used
    # to default to the string "auto", which resolve_language_rule treats as
    # "not English" — so every follow-up on every survey, including English
    # ones, was moderated in Egyptian Arabic. The English instruction existed
    # but had never once been used.
    language: str = ""
    #: What is being tested, e.g. "ice cream". Without it the model had no idea
    #: what the study was about and invented a category to probe about.
    category: str = ""
    survey_id: str = ""
    token: str = ""
    question_id: str = ""
    current_round: int = 1
    source: Optional[str] = None

    @classmethod
    def from_survey_request(
        cls,
        *,
        survey: dict[str, Any],
        survey_id: str,
        token: str,
        question_id: str,
        current_round: int,
        source: Optional[str],
        question_text: str,
        answer_text: str,
        question_category: str,
        brand_name: Optional[str],
        survey_objective: Optional[str],
        custom_instructions: str,
        respondent_surface: Optional[str],
        previous_turns: Optional[list[dict[str, Any]]] = None,
        language: str = "",
    ) -> "FollowUpEngineContext":
        # Resolved here, from the survey, rather than expected from the caller.
        # Every caller forgot, and the resulting "auto" silently meant Arabic.
        # Doing it at the point the survey is already in hand means a new
        # caller cannot reintroduce that. The survey's own language governs —
        # not the language the respondent happened to type in.
        from backend.services.product_test_orchestration import (
            resolve_orchestration_category,
        )
        from backend.services.product_test_public_gateway import (
            resolve_respondent_language,
        )

        resolved_language = (language or "").strip().lower()
        if not resolved_language or resolved_language == "auto":
            resolved_language = resolve_respondent_language(survey)

        category = resolve_orchestration_category(survey)
        if category == "Category":  # the resolver's "nothing set" placeholder
            category = ""

        # `company_name` is the research agency, never the product under test.
        # Using it as the brand fed the model the agency's name as the thing
        # being tasted, which is a large part of why it invented a product.
        resolved_brand = (brand_name or "").strip() or category or "the product"

        return cls(
            question=question_text,
            answer=answer_text,
            brand_name=resolved_brand,
            category=category,
            survey_objective=(
                survey_objective
                or survey.get("survey_objective")
                or "general market research"
            ),
            custom_instructions=custom_instructions or "",
            question_category=question_category,
            survey_type=str(survey.get("type") or "standard"),
            respondent_surface=respondent_surface,
            previous_turns=list(previous_turns or []),
            language=resolved_language,
            survey_id=str(survey_id or ""),
            token=str(token or ""),
            question_id=str(question_id or ""),
            current_round=int(current_round or 1),
            source=source,
        )
