"""Tests for module answer alias normalization."""

from backend.utils.module_answer_aliases import (
    LEGACY_PF_MAP,
    build_analytical_context,
    collapse_pf_to_canonical,
    normalize_module_answers,
)


def test_normalize_read_fills_pf_from_legacy():
    answers = {
        "aw_q1": "Nike",
        "pb_q1": ["Nike", "Adidas"],
        "__structured": {
            "purchase_funnel": {"aw_q1": "Nike", "pb_q1": ["Nike", "Adidas"]},
        },
    }
    out = normalize_module_answers(answers, mode="read")
    pf = out["__structured"]["module_answers"]["purchase_funnel"]
    assert pf["pf_q1"] == "Nike"
    assert pf["pf_q4"] == ["Nike", "Adidas"]
    assert out["aw_q1"] == "Nike"
    assert out["pf_q1"] == "Nike"


def test_normalize_write_mirrors_both_directions():
    answers = {
        "__structured": {
            "module_answers": {
                "purchase_funnel": {"pf_q7": "Nike"},
            },
        },
    }
    out = normalize_module_answers(answers, mode="write")
    pf_block = out["__structured"]["purchase_funnel"]
    assert pf_block["pf_q7"] == "Nike"
    assert pf_block["pb_q4"] == "Nike"


def test_build_analytical_context_from_snapshot():
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
            }
        }
    }
    ctx = build_analytical_context(survey)
    assert ctx["awareness_keys"]["tom"] == "pf_q1"
    assert ctx["stage_roles"]["consideration"] == "pf_q4"
    assert ctx["question_labels"]["pf_q1"] == "TOM"
    assert ctx["question_labels"]["aw_q1"] == "TOM"


def test_collapse_pf_to_canonical_prefers_pf():
    merged = collapse_pf_to_canonical({"aw_q1": "A", "pf_q1": "B"})
    assert merged["pf_q1"] == "B"
