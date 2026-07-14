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
    language: str = "auto"
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
        language: str = "auto",
    ) -> "FollowUpEngineContext":
        return cls(
            question=question_text,
            answer=answer_text,
            brand_name=brand_name or survey.get("company_name") or "the product",
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
            language=language,
            survey_id=str(survey_id or ""),
            token=str(token or ""),
            question_id=str(question_id or ""),
            current_round=int(current_round or 1),
            source=source,
        )
