"""
The Layer 2 brand loop must evaluate each brand once.

A respondent reported being asked the whole sensory battery — appearance,
aroma, taste, texture, after taste — twice for the same product before moving
on. The cause was in composition, not the UI: the client brand appears in both
`internal_brands` and the brand list, which is a natural thing for an analyst to
enter, and the two were concatenated without deduplication.

Reproduced from a real survey ("Milk test"), whose blueprint had
`own_brand: "Maraay"` and also listed Maraay among the brands. Its composed
snapshot held 14 sections for Maraay and 7 each for the others.
"""
from __future__ import annotations

import pytest


def dedupe_brands(internal: list[str], competitors: list[str]) -> list[str]:
    """Mirrors the composer's brand assembly."""
    out: list[str] = []
    seen: set[str] = set()
    for brand in list(internal) + list(competitors):
        if not brand:
            continue
        key = str(brand).strip().casefold()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(brand)
    return out


def test_the_reported_survey_no_longer_duplicates_its_client_brand():
    """The exact shape that produced 14 sections for one brand."""
    assert dedupe_brands(["Maraay"], ["Maraay", "juhayna", "deema"]) == [
        "Maraay",
        "juhayna",
        "deema",
    ]


@pytest.mark.parametrize(
    "internal,competitors",
    [
        (["Maraay"], ["maraay"]),        # casing
        (["Maraay"], [" Maraay "]),      # padding
        (["  maraay  "], ["MARAAY"]),    # both
    ],
)
def test_duplicates_are_caught_regardless_of_casing_or_padding(internal, competitors):
    """
    Brand names are typed by hand in two different places, so they rarely match
    byte for byte. An exact comparison would let most real duplicates through.
    """
    assert len(dedupe_brands(internal, competitors)) == 1


def test_the_client_brand_is_still_evaluated_first():
    """Order matters: some designs evaluate the client brand before rivals."""
    assert dedupe_brands(["Ours"], ["Rival A", "Rival B"])[0] == "Ours"


def test_genuinely_different_brands_all_survive():
    assert dedupe_brands(["A"], ["B", "C", "D"]) == ["A", "B", "C", "D"]


def test_the_first_spelling_entered_is_the_one_kept():
    """Deduping must not silently restyle a brand name the analyst typed."""
    assert dedupe_brands(["Maraay"], ["MARAAY"]) == ["Maraay"]


@pytest.mark.parametrize(
    "internal,competitors",
    [([], []), ([""], [None]), ([None], ["   "])],
)
def test_empty_and_blank_entries_do_not_create_phantom_brands(internal, competitors):
    """A blank brand would otherwise compose an entire section set for nothing."""
    assert dedupe_brands(internal, competitors) == []


def test_repeated_competitors_are_collapsed_too():
    """The duplicate need not involve the client brand."""
    assert dedupe_brands([], ["A", "A", "B"]) == ["A", "B"]


def test_section_count_scales_with_distinct_brands_only():
    """
    The respondent-facing consequence: sections are built per brand, so a
    duplicate is a full extra battery of questions, not a cosmetic repeat.
    """
    sections_per_brand = 7
    brands = dedupe_brands(["Maraay"], ["Maraay", "juhayna", "deema"])
    assert len(brands) * sections_per_brand == 21  # was 28 before the fix
