"""Tests for taste test tt_q* ID convention utilities."""

from backend.utils.taste_test_question_ids import (
    build_alias_map_from_docs,
    build_module_metadata,
    is_tt_canonical,
    normalize_taste_test_question_id,
    plan_tt_id_assignments,
    resolve_taste_test_context,
)


def test_is_tt_canonical():
    assert is_tt_canonical("tt_q1")
    assert is_tt_canonical("TT_Q42")
    assert not is_tt_canonical("abc12345")
    assert not is_tt_canonical("pf_q1")


def test_plan_tt_id_assignments_preserves_existing_canonical():
    docs = [
        {"_id": 1, "question_id": "tt_q2", "legacy_id": "old2", "timing": "After Taste"},
        {"_id": 2, "question_id": "abc12345", "timing": "Layer 1"},
    ]
    updates = plan_tt_id_assignments(docs)
    by_id = {u["_id"]: u for u in updates}
    assert by_id[1]["question_id"] == "tt_q2"
    assert by_id[1]["legacy_id"] == "old2"
    assert by_id[2]["question_id"] == "tt_q1"
    assert by_id[2]["legacy_id"] == "abc12345"
    assert by_id[2]["question_id_prefix"] == "tt"


def test_build_alias_map_from_docs():
    docs = [
        {"question_id": "tt_q1", "legacy_id": "abc12345"},
        {"question_id": "tt_q2"},
    ]
    aliases = build_alias_map_from_docs(docs)
    assert aliases["abc12345"] == "tt_q1"
    assert aliases["tt_q1"] == "tt_q1"
    assert aliases["tt_q2"] == "tt_q2"


def test_normalize_taste_test_question_id():
    alias_map = {"abc12345": "tt_q1"}
    assert normalize_taste_test_question_id("tt_q3", alias_map) == "tt_q3"
    assert normalize_taste_test_question_id("abc12345", alias_map) == "tt_q1"
    assert normalize_taste_test_question_id("unknown", alias_map) == "unknown"


def test_resolve_taste_test_context_from_survey():
    survey = {
        "taste_test_config": {
            "module_metadata": {
                "question_id_prefix": "tt",
                "legacy_id_aliases": {"legacy1": "tt_q5"},
            }
        }
    }
    ctx = resolve_taste_test_context(survey)
    assert ctx["prefix"] == "tt"
    assert ctx["alias_map"]["legacy1"] == "tt_q5"


def test_build_module_metadata():
    meta = build_module_metadata(
        [{"question_id": "tt_q1", "legacy_id": "x1"}]
    )
    assert meta["module_id"] == "taste_test"
    assert meta["question_id_prefix"] == "tt"
    assert meta["legacy_id_aliases"]["x1"] == "tt_q1"
