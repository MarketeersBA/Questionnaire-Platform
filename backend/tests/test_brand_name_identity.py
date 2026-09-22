"""
Python port of frontend/src/utils/brandNameIdentity.test.ts — same cases,
locking the Python port (backend/services/brand_name_identity.py) to the
same behaviour as the TypeScript original so the two composers can't drift.
"""
import pytest

from backend.services.brand_name_identity import (
    brand_phonetic_skeleton,
    dedupe_brand_names,
    is_same_brand,
)


@pytest.mark.parametrize(
    "en,ar",
    [
        ("Squizz", "سكويز"),
        ("Pepsi", "بيبسي"),
        ("Vodafone", "فودافون"),
        ("Lipton", "ليبتون"),
        ("Nestle", "نستله"),
        ("Cola", "كولا"),
        ("Kiri", "كيري"),
        ("Obour", "أبور"),
        ("Domty", "دومتي"),
        ("Nescafe", "نسكافيه"),
    ],
)
def test_real_transliterations_match(en, ar):
    assert is_same_brand(en, ar) is True


def test_matches_with_or_without_the_arabic_definite_article():
    assert is_same_brand("Obour", "العبور") is True
    assert is_same_brand("Obour", "عبور") is True


def test_symmetric_order_does_not_matter():
    assert is_same_brand("سكويز", "Squizz") is True


def test_same_script_case_and_whitespace_differences_still_match():
    assert is_same_brand("Pepsi", "pepsi") is True
    assert is_same_brand("  Pepsi ", "Pepsi") is True


@pytest.mark.parametrize(
    "a,b",
    [
        ("Pepsi", "Cola"),
        ("Kiri", "Kiki"),
        ("KIKS", "Squizz"),
        ("Obour", "Maraay"),
        ("Nestle", "Nescafe"),
        ("Pepsi", "Sprite"),
    ],
)
def test_different_brands_do_not_match(a, b):
    assert is_same_brand(a, b) is False


def test_blank_names_never_match():
    assert is_same_brand("", "") is False
    assert is_same_brand("   ", "Pepsi") is False


def test_skeleton_folds_arabic_p_onto_b():
    assert brand_phonetic_skeleton("Pepsi") == brand_phonetic_skeleton("بيبسي")


def test_skeleton_collapses_adjacent_duplicate_consonants():
    assert brand_phonetic_skeleton("Squizz") == brand_phonetic_skeleton("Squiz")


def test_skeleton_drops_vowels_and_semivowels_from_both_scripts():
    assert brand_phonetic_skeleton("aeiou") == ""
    assert brand_phonetic_skeleton("اوي") == ""


def test_dedupe_reproduces_the_reported_scenario():
    merged = dedupe_brand_names(["KIKS", "Squizz"], ["سكويز"])
    assert merged == ["KIKS", "Squizz"]


def test_dedupe_keeps_the_first_seen_spelling():
    assert dedupe_brand_names(["Pepsi"], ["بيبسي"]) == ["Pepsi"]
    assert dedupe_brand_names(["بيبسي"], ["Pepsi"]) == ["بيبسي"]


def test_dedupe_merges_any_number_of_source_lists():
    merged = dedupe_brand_names(["Pepsi", "Cola"], ["بيبسي"], ["سبرايت"])
    assert merged == ["Pepsi", "Cola", "سبرايت"]


def test_dedupe_ignores_blank_entries():
    assert dedupe_brand_names(["Pepsi", "", "   "], None) == ["Pepsi"]


def test_dedupe_handles_no_lists():
    assert dedupe_brand_names() == []
