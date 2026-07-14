"""Phase 9 — MCQ/SCQ specify answer serialization round-trip."""

from backend.utils.answer_format import (
    format_module_answer,
    parse_specify_list,
    serialize_specify_answer,
)
from backend.utils.module_answer_aliases import normalize_module_answers


def test_scq_specify_export_round_trip():
    payload = serialize_specify_answer("as_needed", "After gym")
    assert format_module_answer(payload) == "After gym"


def test_mcq_specify_list_export():
    items = [
        "morning",
        serialize_specify_answer("as_needed", "Late night snack"),
    ]
    assert format_module_answer(items) == "morning, Late night snack"
    assert parse_specify_list(items) == ["morning", "Late night snack"]


def test_module_answers_preserve_specify_through_normalize():
    answers = {
        "__structured": {
            "module_answers": {
                "brand_usage": {
                    "us_q3": serialize_specify_answer("as_needed", "Custom timing"),
                    "us_q4": ["daily", serialize_specify_answer("when_needed", "Ramadan")],
                },
                "brand_pricing_behavior": {
                    "cb_q3": serialize_specify_answer("online_other", "Instagram shop"),
                },
            }
        }
    }
    out = normalize_module_answers(answers, mode="read")
    usage = out["__structured"]["module_answers"]["brand_usage"]
    assert usage["us_q3"]["otherText"] == "Custom timing"
    assert usage["us_q4"][1]["otherText"] == "Ramadan"
    pricing = out["__structured"]["module_answers"]["brand_pricing_behavior"]
    assert format_module_answer(pricing["cb_q3"]) == "Instagram shop"
