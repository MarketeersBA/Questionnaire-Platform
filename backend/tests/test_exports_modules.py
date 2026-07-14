"""Phase 9 — Excel export column contract for pf/us/cb modules."""

from backend.utils.answer_format import format_module_answer
from backend.utils.module_answer_aliases import build_analytical_context, normalize_module_answers


def test_format_answer_specify_object():
    assert format_module_answer({"value": "as_needed", "otherText": "Night"}) == "Night"


def test_export_row_columns_from_normalized_answers():
    survey = {
        "module_snapshots": {
            "purchase_funnel": {
                "sections": [
                    {
                        "questions": [
                            {"question_id": "pf_q1", "analytical_role": "tom", "label": "TOM"},
                            {"question_id": "pf_q4", "analytical_role": "consideration", "label": "Consider"},
                        ]
                    }
                ]
            },
            "brand_usage": {
                "sections": [
                    {
                        "questions": [
                            {"question_id": "us_q1", "label": "Usage Timing"},
                            {"question_id": "us_q3", "label": "Time of Day"},
                        ]
                    }
                ]
            },
            "brand_pricing_behavior": {
                "sections": [
                    {
                        "questions": [
                            {"question_id": "cb_q1", "label": "Monthly Budget"},
                        ]
                    }
                ]
            },
        }
    }
    ctx = build_analytical_context(survey)
    labels = ctx["question_labels"]
    assert labels["pf_q1"] == "TOM"
    assert labels["us_q1"] == "Usage Timing"
    assert labels["cb_q1"] == "Monthly Budget"

    legacy_answers = {
        "aw_q1": "Nike",
        "pb_q1": ["Nike", "Adidas"],
        "__structured": {
            "module_answers": {
                "brand_usage": {
                    "us_q1": "today",
                    "us_q3": {"value": "as_needed", "otherText": "Evening"},
                },
                "brand_pricing_behavior": {"cb_q1": "100_200_egp"},
            }
        },
    }
    normalized = normalize_module_answers(legacy_answers, survey, mode="read")
    assert normalized["pf_q1"] == "Nike"
    assert normalized["pf_q4"] == ["Nike", "Adidas"]

    module_answers = normalized["__structured"]["module_answers"]
    export_cols = {}
    for module_id in ("brand_usage", "brand_pricing_behavior"):
        bucket = module_answers.get(module_id) or {}
        for qid, val in bucket.items():
            export_cols[f"{module_id}_{labels.get(qid, qid)}"] = format_module_answer(val)

    assert export_cols["brand_usage_Usage Timing"] == "today"
    assert export_cols["brand_usage_Time of Day"] == "Evening"
    assert export_cols["brand_pricing_behavior_Monthly Budget"] == "100_200_egp"
