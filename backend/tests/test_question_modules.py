"""Unit tests for question module models and flatten helper."""

import pytest
from pydantic import ValidationError

from backend.models import (
    ModuleQuestion,
    ModuleSection,
    QuestionModuleBase,
    QuestionModuleUpdate,
    QuestionOption,
)
from backend.services.question_module_service import flatten_questions


def test_question_id_pattern_accepts_standard_prefixes():
    q = ModuleQuestion(
        question_id="pf_q1",
        type="open_single",
        ar_text="ar",
        en_text="en",
    )
    assert q.question_id == "pf_q1"


def test_duplicate_question_ids_rejected():
    section = ModuleSection(
        section_id="awareness",
        title_en="Awareness",
        questions=[
            ModuleQuestion(question_id="pf_q1", type="open_single", ar_text="a", en_text="e"),
            ModuleQuestion(question_id="pf_q1", type="mcq", ar_text="a", en_text="e"),
        ],
    )
    with pytest.raises(ValidationError):
        QuestionModuleBase(
            module_id="purchase_funnel",
            name="Purchase Funnel Module",
            sections=[section],
        )


def test_brand_pipeline_source_must_exist():
    section = ModuleSection(
        section_id="behaviour",
        title_en="Behaviour",
        questions=[
            ModuleQuestion(
                question_id="pf_q4",
                type="mcq",
                ar_text="a",
                en_text="e",
                brand_pipeline={"mode": "include_prior", "sources": ["pf_q99"]},
            ),
        ],
    )
    with pytest.raises(ValidationError):
        QuestionModuleBase(
            module_id="purchase_funnel",
            name="Purchase Funnel Module",
            sections=[section],
        )


def test_flatten_questions_preserves_order():
    sections = [
        {
            "section_id": "s2",
            "order": 2,
            "title_en": "Second",
            "questions": [{"question_id": "us_q2", "order": 0}],
        },
        {
            "section_id": "s1",
            "order": 1,
            "title_en": "First",
            "questions": [{"question_id": "us_q1", "order": 0}],
        },
    ]
    flat = flatten_questions(sections)
    assert [q["question_id"] for q in flat] == ["us_q1", "us_q2"]
    assert flat[0]["section_id"] == "s1"


def test_duplicate_option_values_rejected():
    section = ModuleSection(
        section_id="usage",
        title_en="Usage",
        questions=[
            ModuleQuestion(
                question_id="us_q1",
                type="scq",
                ar_text="a",
                en_text="e",
                options=[
                    QuestionOption(value="today", ar_label="a", en_label="Today", order=0),
                    QuestionOption(value="today", ar_label="b", en_label="Today 2", order=1),
                ],
            ),
        ],
    )
    with pytest.raises(ValidationError):
        QuestionModuleBase(
            module_id="brand_usage",
            name="Brand Usage Module",
            sections=[section],
        )
