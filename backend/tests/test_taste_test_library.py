"""
Contract tests for the canonical Taste Test attribute library.

The library is the source of truth for what respondents are asked and for how
reporting reads their answers, so these lock it against the source document.
The load itself validates every row through TasteTestQuestionBase, so a
malformed edit fails here rather than shipping a half-labelled scale.
"""

import pytest

from backend.services.taste_test_library import (
    find_question,
    grouped_library,
    library_version,
    load_library,
)

LIBRARY = load_library()
BY_ID = {q.question_id: q for q in LIBRARY}

CENTERED_IDS = [q.question_id for q in LIBRARY if q.scale_shape == "centered"]
OPTIONAL_IDS = {q.question_id for q in LIBRARY if q.question_status == "optional"}


def test_library_loads_and_is_versioned():
    assert library_version() >= 1
    assert len(LIBRARY) == 21


def test_question_ids_are_unique():
    ids = [q.question_id for q in LIBRARY]
    assert len(ids) == len(set(ids))


def test_expected_main_attributes_are_present():
    mains = {q.main_att for q in LIBRARY}
    assert mains == {"Appearance", "Aroma", "Taste", "Texture", "After Taste", "Overall"}


# ── Centered (sensory) scales ───────────────────────────────────────────────

def test_every_centered_scale_labels_all_five_points():
    assert len(CENTERED_IDS) == 12
    for question_id in CENTERED_IDS:
        question = BY_ID[question_id]
        assert (question.scale_min, question.scale_max) == (1, 5), question_id
        assert len(question.point_labels_ar) == 5, question_id
        assert len(question.point_labels_en) == 5, question_id
        assert all(label.strip() for label in question.point_labels_ar), question_id


def test_centered_scales_are_ideal_at_the_midpoint():
    for question_id in CENTERED_IDS:
        assert BY_ID[question_id].ideal_point == 3, question_id


def test_centered_midpoint_label_says_it_is_suitable():
    """The midpoint wording is what tells reporting a 3 is the good answer."""
    for question_id in CENTERED_IDS:
        middle = BY_ID[question_id].point_labels_ar[2]
        assert "مناسب" in middle, f"{question_id}: {middle!r}"


def test_centered_scales_carry_the_instruction_line():
    for question_id in CENTERED_IDS:
        assert "الأوسط" in (BY_ID[question_id].instruction_ar or ""), question_id


@pytest.mark.parametrize(
    "question_id,expected",
    [
        ("tt_taste_salty", ["مش مملح كفاية", "مش مملح", "مناسب لى", "مملح", "مملح جدا"]),
        ("tt_taste_sweet", ["مش مسكرة خالص", "مش مسكرة", "مناسب لى", "مسكرة", "مسكرة جدا"]),
        ("tt_color", ["فاتح قوى", "فاتح", "مناسب ليا", "غامق", "غامق جدا"]),
        ("tt_texture_thickness", ["خفيف جدا", "خفيف", "مناسب لى", "سميك", "سميك جدا"]),
    ],
)
def test_arabic_labels_match_the_source_document(question_id, expected):
    assert BY_ID[question_id].point_labels_ar == expected


# ── Hedonic "Overall …" scales ──────────────────────────────────────────────

def test_overall_questions_are_hedonic_one_to_ten():
    overall_ids = [q.question_id for q in LIBRARY if q.scale_shape == "hedonic"]
    assert len(overall_ids) == 5

    for question_id in overall_ids:
        question = BY_ID[question_id]
        assert (question.scale_min, question.scale_max) == (1, 10), question_id
        assert question.ideal_point == 10, question_id
        assert question.supp_att is None, question_id
        assert question.ar_max_label == "يعجبني جدا", question_id


# ── Purchase intent: the trap ───────────────────────────────────────────────

def test_purchase_intent_is_monotonic_not_centered():
    """
    T81 is 1-5 like the sensory scales, but 5 is genuinely the best answer.
    Inferring "1-5 in a taste test means centered" scored a 5 as a defect and a
    lukewarm 3 as ideal, so the shape has to be explicit.
    """
    question = BY_ID["tt_purchase_intent"]

    assert question.scale_shape == "monotonic"
    assert (question.scale_min, question.scale_max) == (1, 5)
    assert question.ideal_point == 5
    assert question.point_labels_ar[-1] == "هشتريه جدا"
    # Its midpoint must NOT claim to be suitable.
    assert "مناسب" not in question.point_labels_ar[2]
    assert question.analytical_role == "purchase_intent"


# ── Optional / conditional attributes ───────────────────────────────────────

def test_only_study_level_questions_are_always_asked():
    """
    `question_status` is the platform's inclusion rule, not research advice:
    OrchestrationService.fetch_taste_test_master_data pulls every "fixed"
    question regardless of what the analyst picked, and pulls "optional" ones
    only for selected attributes. Marking the sensory questions fixed made
    attribute selection a no-op.
    """
    fixed_ids = {q.question_id for q in LIBRARY if q.question_status == "fixed"}
    assert fixed_ids == {
        "tt_overall_liking",
        "tt_purchase_intent",
        "tt_open_likes",
        "tt_open_dislikes",
        "tt_open_improvements",
    }


def test_every_sensory_attribute_is_selection_driven():
    for question_id in CENTERED_IDS:
        if question_id == "tt_purchase_intent":
            continue
        assert BY_ID[question_id].question_status == "optional", question_id


def test_overall_rollups_ride_along_with_their_main_attribute():
    """
    An "Overall ..." row has no sub-attribute, and the orchestrator's query
    includes null-supp_att optional rows for any selected main attribute — so
    choosing any sub of "Taste" also brings in "Overall Taste".
    """
    for question_id in ("tt_overall_appearance", "tt_overall_aroma",
                        "tt_overall_taste", "tt_texture_liking"):
        question = BY_ID[question_id]
        assert question.question_status == "optional", question_id
        assert question.supp_att is None, question_id


def test_conditional_attributes_explain_when_to_use_them():
    """Separate axis: advice about when an attribute is worth measuring."""
    conditional = {q.question_id for q in LIBRARY if q.condition_ar}
    assert conditional == {
        "tt_taste_acidity",
        "tt_taste_bitterness",
        "tt_texture_crispness",
    }
    for question_id in conditional:
        assert BY_ID[question_id].condition_en, question_id


# ── Open ends ───────────────────────────────────────────────────────────────

def test_open_ends_have_no_scale_and_flag_ai_followup():
    open_ends = [q for q in LIBRARY if q.scale_shape == "open_end"]
    assert {q.question_id for q in open_ends} == {
        "tt_open_likes",
        "tt_open_dislikes",
        "tt_open_improvements",
    }
    for question in open_ends:
        assert question.ideal_point is None
        assert question.point_labels_ar == []

    assert BY_ID["tt_open_likes"].ai_followup is True
    assert BY_ID["tt_open_dislikes"].ai_followup is True


# ── Bilingual completeness ──────────────────────────────────────────────────

def test_every_question_is_bilingual():
    for question in LIBRARY:
        assert question.ar_text.strip(), question.question_id
        assert question.en_text.strip(), question.question_id


# ── Grouped view used by the creation UI ────────────────────────────────────

def test_grouped_library_nests_subs_under_their_main_attribute():
    groups = {g["main_attribute"]: g for g in grouped_library("ar")}

    taste = groups["Taste"]
    subs = {s["sub_attribute"] for s in taste["sub_attributes"]}
    assert subs == {"Salty", "Sweet", "Acidity", "Bitterness"}

    # The "Overall Taste" 1-10 question is the group's summary, not a sub.
    assert taste["overall"] is not None
    assert taste["overall"]["scale_max"] == 10
    assert taste["overall"]["sub_attribute"] is None

    # Purchase intent belongs to Overall, not to Taste.
    overall_subs = {s["sub_attribute"] for s in groups["Overall"]["sub_attributes"]}
    assert "Purchase Intent" in overall_subs


def test_grouped_library_uses_the_requested_language():
    ar = {g["main_attribute"]: g for g in grouped_library("ar")}["Taste"]
    en = {g["main_attribute"]: g for g in grouped_library("en")}["Taste"]

    ar_sweet = next(s for s in ar["sub_attributes"] if s["sub_attribute"] == "Sweet")
    en_sweet = next(s for s in en["sub_attributes"] if s["sub_attribute"] == "Sweet")

    assert ar_sweet["text"] == "ما مدى تقيمك على نسبه السكر؟"
    assert en_sweet["text"].startswith("How do you rate")
    assert ar_sweet["point_labels"] == ar_sweet["point_labels_ar"]
    assert en_sweet["point_labels"] == en_sweet["point_labels_en"]


def test_find_question():
    assert find_question("tt_taste_sweet") is not None
    assert find_question("nope") is None


# ── Model-level guards ──────────────────────────────────────────────────────

def test_model_rejects_a_centered_scale_with_missing_labels():
    from pydantic import ValidationError

    from backend.models import TasteTestQuestionBase

    with pytest.raises(ValidationError, match="point_labels_ar"):
        TasteTestQuestionBase(
            question_id="tt_bad",
            main_att="Taste",
            question_type="scale 1-5",
            ar_text="س",
            en_text="q",
            timing="After Taste",
            question_status="fixed",
            scale_shape="centered",
            scale_min=1,
            scale_max=5,
        )


def test_model_rejects_a_label_count_that_does_not_match_the_scale():
    from pydantic import ValidationError

    from backend.models import TasteTestQuestionBase

    with pytest.raises(ValidationError, match="labels for a"):
        TasteTestQuestionBase(
            question_id="tt_bad",
            main_att="Taste",
            question_type="scale 1-5",
            ar_text="س",
            en_text="q",
            timing="After Taste",
            question_status="fixed",
            scale_shape="centered",
            scale_min=1,
            scale_max=5,
            point_labels_ar=["a", "b", "c"],
        )
