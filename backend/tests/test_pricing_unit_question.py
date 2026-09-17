"""
The taste-test pricing question must say what quantity is being priced.

As authored, `tt_q16` asks "what price would you buy this at?" without naming a
size. Respondents each picture a different pack, so the answers cannot be
compared or averaged — the resulting price-sensitivity read is built on
quantities nobody agreed on.

Two phrasings now cover it: one naming a declared pack size, and one anchoring
on the sample physically in front of the respondent when no size was declared.
"""
from __future__ import annotations

import pytest

from backend.services.orchestration_service import (
    PRICING_ATTRIBUTE,
    PRICING_QUESTION_IDS,
    build_pricing_question_text,
    format_pricing_unit,
)


# ── Reading the declared size ──────────────────────────────────────────────


@pytest.mark.parametrize(
    "config,expected",
    [
        ({"pricing_unit": "200 ml"}, "200 ml"),
        ({"pricing_unit": "  500 g  "}, "500 g"),
        ({"pricing_unit_amount": "200", "pricing_unit_label": "ml"}, "200 ml"),
        ({"pricing_unit_amount": " 1 ", "pricing_unit_label": " L "}, "1 L"),
    ],
)
def test_size_is_read_from_either_shape(config, expected):
    """The creation form has carried the size as one field and as two."""
    assert format_pricing_unit(config) == expected


@pytest.mark.parametrize("config", [{}, None, {"pricing_unit": "   "}, {"pricing_unit": None}, "junk"])
def test_no_declared_size_reads_as_empty(config):
    assert format_pricing_unit(config) == ""


def test_a_bare_amount_without_a_unit_is_still_used():
    """"500" alone is more informative than nothing, even if imprecise."""
    assert format_pricing_unit({"pricing_unit_amount": "500"}) == "500"


# ── The question itself ────────────────────────────────────────────────────


def test_a_declared_size_appears_in_the_question():
    ar = build_pricing_question_text({"pricing_unit": "200 ml"}, is_arabic=True)
    en = build_pricing_question_text({"pricing_unit": "200 ml"}, is_arabic=False)
    assert "200 ml" in ar
    assert "200 ml" in en


def test_without_a_size_the_question_anchors_on_the_sample():
    """
    The fallback must still give a shared reference. "What would you pay?" with
    no anchor at all is the problem being fixed, not an acceptable default.
    """
    ar = build_pricing_question_text({}, is_arabic=True)
    en = build_pricing_question_text({}, is_arabic=False)
    assert "\u0642\u062f\u0627\u0645\u0643" in ar          # "in front of you"
    assert "in front of you" in en


def test_the_product_placeholder_survives_for_later_substitution():
    """
    `{product}` is filled downstream by `format_text`, which substitutes the
    brand — or its blind code on a blind study. Resolving it here would leak the
    real brand name into a blind test.
    """
    for is_arabic in (True, False):
        for config in ({}, {"pricing_unit": "200 ml"}):
            assert "{product}" in build_pricing_question_text(config, is_arabic=is_arabic)


def test_arabic_and_english_are_genuinely_different_text():
    assert build_pricing_question_text({}, is_arabic=True) != build_pricing_question_text(
        {}, is_arabic=False
    )


def test_the_size_is_not_double_substituted():
    """A size containing a brace must not corrupt the template."""
    out = build_pricing_question_text({"pricing_unit": "{product} 200ml"}, is_arabic=False)
    assert out.count("{product}") == 1


# ── Which question this applies to ─────────────────────────────────────────


def test_the_pricing_question_is_matched_by_attribute_and_by_id():
    """
    Matched on `main_att` as well as id so a re-seeded bank that renumbers
    questions still gets the rewrite.
    """
    assert PRICING_ATTRIBUTE == "Purchase Price"
    assert "tt_q16" in PRICING_QUESTION_IDS   # taste test
    assert "pt_q38" in PRICING_QUESTION_IDS   # product test
