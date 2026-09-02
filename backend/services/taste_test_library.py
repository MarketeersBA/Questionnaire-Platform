"""
Canonical Taste Test attribute library.

The library used to exist only inside an untracked `Taste_Test_restructured.xlsx`,
which meant it could not be rebuilt, reviewed or diffed. It now lives in
`backend/resources/taste_test/attribute_library.json` and is loaded through here.

Nothing in this module touches the database — the seeder writes, this only reads
and validates — so it is safe to import from routers, the orchestrator and tests.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.models import TasteTestQuestionBase

LIBRARY_PATH = (
    Path(__file__).resolve().parent.parent / "resources" / "taste_test" / "attribute_library.json"
)


@lru_cache(maxsize=1)
def _raw_library() -> Dict[str, Any]:
    if not LIBRARY_PATH.is_file():
        raise FileNotFoundError(f"Taste test library not found: {LIBRARY_PATH}")
    with LIBRARY_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_library() -> List[TasteTestQuestionBase]:
    """
    Parse and validate every attribute in the library.

    Raises pydantic ValidationError if the JSON drifts out of contract — e.g. a
    centered scale missing a label — so a bad edit fails loudly at import/seed
    time instead of silently shipping a half-labelled scale to respondents.
    """
    payload = _raw_library()
    instructions = payload.get("instructions", {})

    questions: List[TasteTestQuestionBase] = []
    for entry in payload.get("attributes", []):
        data = dict(entry)

        # Centered scales share one instruction line; attach it here rather than
        # repeating the same sentence on every row of the JSON.
        if data.get("scale_shape") == "centered":
            data.setdefault("instruction_ar", instructions.get("centered_ar"))
            data.setdefault("instruction_en", instructions.get("centered_en"))

        # Keep the legacy min/max columns populated from the point labels so
        # existing consumers that only understand two anchors still work.
        labels_ar = data.get("point_labels_ar") or []
        labels_en = data.get("point_labels_en") or []
        if labels_ar:
            data.setdefault("ar_min_label", labels_ar[0])
            data.setdefault("ar_max_label", labels_ar[-1])
        if labels_en:
            data.setdefault("en_min_label", labels_en[0])
            data.setdefault("en_max_label", labels_en[-1])

        questions.append(TasteTestQuestionBase(**data))

    return questions


def library_version() -> int:
    return int(_raw_library().get("version", 1))


def grouped_library(language: str = "en") -> List[Dict[str, Any]]:
    """
    Library shaped for the survey-creation UI: main attribute -> its questions.

    The "Overall ..." question for a main attribute has no `supp_att`; it is
    returned separately so the UI can show it as the attribute's summary
    question rather than as one of its sub-attributes.
    """
    is_ar = language == "ar"
    by_main: Dict[str, Dict[str, Any]] = {}

    for question in sorted(load_library(), key=lambda q: q.order):
        group = by_main.setdefault(
            question.main_att,
            {"main_attribute": question.main_att, "sub_attributes": [], "overall": None},
        )

        item = {
            "question_id": question.question_id,
            "sub_attribute": question.supp_att,
            "text": question.ar_text if is_ar else question.en_text,
            "ar_text": question.ar_text,
            "en_text": question.en_text,
            "question_type": question.question_type,
            "scale_shape": question.scale_shape,
            "scale_min": question.scale_min,
            "scale_max": question.scale_max,
            "point_labels": question.point_labels_ar if is_ar else question.point_labels_en,
            "point_labels_ar": question.point_labels_ar,
            "point_labels_en": question.point_labels_en,
            "instruction": question.instruction_ar if is_ar else question.instruction_en,
            "status": question.question_status,
            "condition": question.condition_ar if is_ar else question.condition_en,
            "ideal_point": question.ideal_point,
            "timing": question.timing,
            "analytical_role": question.analytical_role,
        }

        if question.supp_att is None:
            group["overall"] = item
        else:
            group["sub_attributes"].append(item)

    return list(by_main.values())


def find_question(question_id: str) -> Optional[TasteTestQuestionBase]:
    for question in load_library():
        if question.question_id == question_id:
            return question
    return None
