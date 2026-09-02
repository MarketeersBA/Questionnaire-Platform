"""
Tests for the custom-module Excel import (no database required).

The contract these lock down: an imported sheet must group its rows into
attributes, and the resulting payload must satisfy `QuestionModuleCreate`.
Three field-level details are load-bearing and each previously shipped broken,
so they are asserted explicitly:

  * `question_id` has to match `^[a-z]{2}_q\\d+$`
  * options must use `en_label` / `ar_label` (not `label_en` / `label_ar`)
  * `linear_scale` has to be an accepted `QuestionType`
"""

import asyncio
import io

import pandas as pd
import pytest
from fastapi import HTTPException

from backend.models import QuestionModuleCreate
from backend.routers.question_modules import (
    MODULE_TEMPLATE_COLUMNS,
    _resolve_question_type,
    _resolve_scale_variant,
    _scale_bounds,
    _split_options,
    download_excel_template,
    parse_excel,
)


class _FakeUpload:
    """Minimal stand-in for FastAPI's UploadFile."""

    def __init__(self, raw: bytes, filename: str = "my_module.xlsx"):
        self._raw = raw
        self.filename = filename

    async def read(self) -> bytes:
        return self._raw


def _xlsx(rows: list[dict]) -> bytes:
    buffer = io.BytesIO()
    pd.DataFrame(rows).to_excel(buffer, index=False)
    return buffer.getvalue()


def _parse(rows: list[dict], filename: str = "my_module.xlsx") -> dict:
    return asyncio.get_event_loop().run_until_complete(
        parse_excel(current_user=None, file=_FakeUpload(_xlsx(rows), filename))
    )


def _template_bytes() -> bytes:
    async def run() -> bytes:
        response = await download_excel_template(current_user=None)
        return b"".join([chunk async for chunk in response.body_iterator])

    return asyncio.get_event_loop().run_until_complete(run())


# ── Type resolution ─────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("text", "open_single"),
        ("Text Answer", "open_single"),
        ("open", "open_single"),
        ("list", "open_loop"),
        ("choice", "mcq"),
        ("Multiple Choice", "mcq"),
        ("mcq", "mcq"),
        ("single", "scq"),
        ("scq", "scq"),
        ("linear_scale", "linear_scale"),
        ("slider", "linear_scale"),
        ("Rating", "linear_scale"),
        ("", "open_single"),
        ("something unrecognised", "open_single"),
    ],
)
def test_resolve_question_type(raw, expected):
    assert _resolve_question_type(raw) == expected


# ── Option splitting ────────────────────────────────────────────────────────

def test_split_options_uses_backend_field_names():
    options = _split_options("Colour, Shape, Label", "اللون, الشكل, الملصق")

    assert [o["value"] for o in options] == ["opt_1", "opt_2", "opt_3"]
    assert [o["en_label"] for o in options] == ["Colour", "Shape", "Label"]
    assert options[0]["ar_label"] == "اللون"
    # Guard against the historic label_en/label_ar mix-up.
    assert "label_en" not in options[0]


def test_split_options_tolerates_missing_arabic():
    options = _split_options("Yes, No", "")
    assert [o["ar_label"] for o in options] == ["", ""]


# ── Scale bounds ────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "row,expected",
    [
        ({}, (1, 5)),                                    # absent -> default
        ({"Scale Min": 1, "Scale Max": 7}, (1, 7)),
        ({"Scale Min": "2", "Scale Max": "10"}, (2, 10)),  # strings
        ({"Scale Min": 5, "Scale Max": 5}, (1, 5)),        # degenerate -> repaired
        ({"Scale Min": 9, "Scale Max": 2}, (1, 5)),        # inverted -> repaired
        ({"Scale Min": "abc"}, (1, 5)),                    # unparseable -> default
    ],
)
def test_scale_bounds(row, expected):
    assert _scale_bounds(pd.Series(row)) == expected


# ── End-to-end parsing ──────────────────────────────────────────────────────

def test_rows_group_into_attributes_preserving_order():
    out = _parse([
        {"Question EN": "Overall taste?", "Question Type": "linear_scale", "Attribute": "Taste"},
        {"Question EN": "Which design?", "Question Type": "choice", "Attribute": "Packaging",
         "Options EN": "A, B"},
        {"Question EN": "Sweetness?", "Question Type": "linear_scale", "Attribute": "Taste"},
    ])

    assert [s["title_en"] for s in out["sections"]] == ["Taste", "Packaging"]
    # The third row joins the first attribute rather than creating a new one.
    assert len(out["sections"][0]["questions"]) == 2
    assert len(out["sections"][1]["questions"]) == 1


def test_attribute_grouping_is_case_insensitive():
    out = _parse([
        {"Question EN": "Q1", "Attribute": "Taste"},
        {"Question EN": "Q2", "Attribute": "taste"},
        {"Question EN": "Q3", "Attribute": "TASTE"},
    ])

    assert len(out["sections"]) == 1
    assert len(out["sections"][0]["questions"]) == 3
    # First spelling wins as the display name.
    assert out["sections"][0]["title_en"] == "Taste"


def test_sub_attribute_is_optional():
    out = _parse([
        {"Question EN": "Q1", "Attribute": "Taste", "Sub Attribute": "Sweetness"},
        {"Question EN": "Q2", "Attribute": "Taste"},
    ])

    questions = out["sections"][0]["questions"]
    assert questions[0]["sub_attribute"] == "Sweetness"
    assert questions[1]["sub_attribute"] is None


def test_missing_attribute_falls_back_to_general():
    out = _parse([{"Question EN": "Q1"}])
    assert out["sections"][0]["title_en"] == "General"


def test_blank_and_nan_rows_are_skipped():
    out = _parse([
        {"Question EN": "Real question", "Attribute": "A"},
        {"Question EN": None, "Question AR": None, "Attribute": None},
        {"Question EN": "", "Question AR": "", "Attribute": ""},
    ])

    total = sum(len(s["questions"]) for s in out["sections"])
    assert total == 1


def test_arabic_only_row_is_kept():
    out = _parse([{"Question AR": "ما رأيك؟", "Attribute": "Taste"}])
    question = out["sections"][0]["questions"][0]
    assert question["ar_text"] == "ما رأيك؟"
    assert question["en_text"] == ""


def test_header_matching_ignores_case_and_padding():
    out = _parse([{"  question en  ": "Q1", "ATTRIBUTE": "Taste", "sub attribute": "Sweet"}])
    assert out["sections"][0]["title_en"] == "Taste"
    assert out["sections"][0]["questions"][0]["sub_attribute"] == "Sweet"


def test_question_ids_are_globally_unique_and_valid():
    out = _parse([
        {"Question EN": "Q1", "Attribute": "A"},
        {"Question EN": "Q2", "Attribute": "B"},
        {"Question EN": "Q3", "Attribute": "A"},
    ])

    ids = [q["question_id"] for s in out["sections"] for q in s["questions"]]
    assert sorted(ids) == ["cm_q1", "cm_q2", "cm_q3"]
    assert len(set(ids)) == len(ids)


def test_parsed_payload_satisfies_response_model():
    """The whole point: FastAPI validates the return value against this model."""
    out = _parse([
        {"Question EN": "Rate taste", "Question Type": "linear_scale", "Attribute": "Taste",
         "Sub Attribute": "Overall", "Scale Min": 1, "Scale Max": 7},
        {"Question EN": "Pick designs", "Question Type": "choice", "Attribute": "Packaging",
         "Options EN": "A, B, C", "Options AR": "أ, ب, ج"},
        {"Question EN": "Improve what?", "Question Type": "text", "Attribute": "Packaging"},
    ])

    model = QuestionModuleCreate(**out)

    assert len(model.sections) == 2
    scale_q = model.sections[0].questions[0]
    assert scale_q.type == "linear_scale"
    assert (scale_q.scale_min, scale_q.scale_max) == (1, 7)
    assert scale_q.sub_attribute == "Overall"

    choice_q = model.sections[1].questions[0]
    assert [o.en_label for o in choice_q.options] == ["A", "B", "C"]
    assert choice_q.options[0].ar_label == "أ"


def test_module_name_comes_from_filename():
    out = _parse([{"Question EN": "Q1"}], filename="premium_cheese_test.xlsx")
    assert out["name"] == "Premium Cheese Test"


def test_only_choice_types_receive_options():
    out = _parse([
        {"Question EN": "Q1", "Question Type": "text", "Attribute": "A", "Options EN": "X, Y"},
        {"Question EN": "Q2", "Question Type": "choice", "Attribute": "A", "Options EN": "X, Y"},
    ])

    questions = out["sections"][0]["questions"]
    assert questions[0]["options"] == []      # options ignored for open text
    assert len(questions[1]["options"]) == 2


# ── Failure modes ───────────────────────────────────────────────────────────

def test_rejects_non_excel_extension():
    with pytest.raises(HTTPException) as exc:
        asyncio.get_event_loop().run_until_complete(
            parse_excel(current_user=None, file=_FakeUpload(b"x", "notes.csv"))
        )
    assert exc.value.status_code == 400


def test_missing_both_question_columns_is_reported():
    with pytest.raises(HTTPException) as exc:
        _parse([{"Wrong Header": "Q1"}])
    assert exc.value.status_code == 422
    assert "Question EN" in exc.value.detail


def test_arabic_only_sheet_needs_no_english_column():
    """An Arabic-only questionnaire is a legitimate sheet, not an error."""
    out = _parse([{"Question AR": "ما رأيك؟", "Attribute": "الطعم"}])
    assert out["sections"][0]["title_en"] == "الطعم"
    assert out["sections"][0]["questions"][0]["ar_text"] == "ما رأيك؟"


def test_sheet_with_no_usable_rows_is_reported():
    with pytest.raises(HTTPException) as exc:
        _parse([{"Question EN": None, "Attribute": "A"}])
    assert exc.value.status_code == 422
    assert "No questions found" in exc.value.detail


# ── Template ────────────────────────────────────────────────────────────────

# ── JAR / scale variants ────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("jar", "jar"),
        ("JAR", "jar"),
        ("Just About Right", "jar"),
        ("sensory", "jar"),
        ("bipolar", "bipolar"),
        ("linear", "linear"),
        ("intensity", "linear"),
        ("", "linear"),
        ("nonsense", "linear"),
    ],
)
def test_resolve_scale_variant(raw, expected):
    assert _resolve_scale_variant(raw) == expected


def test_jar_scale_is_normalised_to_one_through_five():
    """JAR anchors are fixed at 1/3/5, so a stray range must be repaired."""
    out = _parse([
        {"Question EN": "Sweetness?", "Question Type": "linear_scale",
         "Attribute": "Taste", "Scale Type": "jar", "Scale Min": 2, "Scale Max": 9},
    ])

    question = out["sections"][0]["questions"][0]
    assert question["scale_variant"] == "jar"
    assert (question["scale_min"], question["scale_max"]) == (1, 5)
    QuestionModuleCreate(**out)  # must survive the model's JAR check


def test_linear_scale_keeps_its_custom_range():
    out = _parse([
        {"Question EN": "Overall?", "Question Type": "linear_scale",
         "Attribute": "Taste", "Scale Type": "linear", "Scale Min": 1, "Scale Max": 7},
    ])

    question = out["sections"][0]["questions"][0]
    assert question["scale_variant"] == "linear"
    assert (question["scale_min"], question["scale_max"]) == (1, 7)


def test_scale_variant_defaults_to_linear_when_column_absent():
    out = _parse([
        {"Question EN": "Overall?", "Question Type": "linear_scale", "Attribute": "Taste"},
    ])
    assert out["sections"][0]["questions"][0]["scale_variant"] == "linear"


def test_model_rejects_a_jar_scale_outside_one_to_five():
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="JAR scale"):
        QuestionModuleCreate(**{
            "name": "M",
            "sections": [{
                "section_id": "attr_1", "title_en": "Taste", "title_ar": "Taste", "order": 0,
                "questions": [{
                    "question_id": "cm_q1", "type": "linear_scale", "en_text": "Q", "ar_text": "",
                    "order": 0, "scale_variant": "jar", "scale_min": 1, "scale_max": 7,
                }],
            }],
        })


# ── Template contract ───────────────────────────────────────────────────────

def test_template_drops_the_option_columns():
    """Options are authored in the studio, not the sheet."""
    assert "Options EN" not in MODULE_TEMPLATE_COLUMNS
    assert "Options AR" not in MODULE_TEMPLATE_COLUMNS
    assert "Scale Type" in MODULE_TEMPLATE_COLUMNS


def test_legacy_sheets_with_option_columns_still_import():
    """Older sheets must not silently lose their options."""
    out = _parse([
        {"Question EN": "Pick one", "Question Type": "choice", "Attribute": "Packaging",
         "Options EN": "A, B", "Options AR": "أ, ب"},
    ])

    options = out["sections"][0]["questions"][0]["options"]
    assert [o["en_label"] for o in options] == ["A", "B"]


def test_literal_routes_are_not_shadowed_by_the_module_id_catch_all():
    """
    Regression guard: FastAPI matches routes in declaration order, so any
    literal path declared *after* `/{module_id}` is swallowed by it and 404s.
    That is how the template download originally broke.
    """
    from backend.routers.question_modules import router

    order = [r.path for r in router.routes]
    catch_all = order.index("/modules/{module_id}")

    for literal in ("/modules/excel-template", "/modules/rollout"):
        assert order.index(literal) < catch_all, (
            f"{literal} must be declared before /modules/{{module_id}}"
        )


def test_template_is_a_real_xlsx_with_the_documented_columns():
    raw = _template_bytes()
    assert raw[:2] == b"PK"  # zip magic

    df = pd.read_excel(io.BytesIO(raw))
    assert list(df.columns) == MODULE_TEMPLATE_COLUMNS


def test_template_round_trips_through_the_parser():
    """The shipped template must import cleanly, or the docs lie."""
    out = asyncio.get_event_loop().run_until_complete(
        parse_excel(current_user=None, file=_FakeUpload(_template_bytes(), "starter.xlsx"))
    )

    model = QuestionModuleCreate(**out)
    # The sample data demonstrates grouping: Taste x2, Packaging x2.
    assert [s.title_en for s in model.sections] == ["Taste", "Packaging"]
    assert [len(s.questions) for s in model.sections] == [2, 2]
