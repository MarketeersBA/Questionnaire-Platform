from copy import deepcopy

from backend.utils.blueprint_overlay import overlay_blueprint_edits


def test_overlay_blueprint_edits_preserves_analyst_question_copy():
    target = {
        "template_snapshot_schema": {
            "layer1_structure": {
                "sections": [
                    {
                        "title": "Screening",
                        "questions": [
                            {
                                "id": "q1",
                                "label": "Original prompt",
                                "options": ["Yes", "No"],
                            }
                        ],
                    }
                ],
            },
            "layer2_structure": {
                "sections": [
                    {
                        "title": "Evaluation",
                        "questions": [
                            {
                                "id": "tt_q1",
                                "text": "Original taste question",
                                "options": ["1", "2", "3"],
                            }
                        ],
                    }
                ],
            },
        },
        "template_snapshot_questions": [
            {"id": "q1", "label": "Original prompt", "options": ["Yes", "No"]}
        ],
        "template_snapshot_l2": {
            "sections": [
                {
                    "title": "Evaluation",
                    "questions": [
                        {
                            "id": "tt_q1",
                            "text": "Original taste question",
                            "options": ["1", "2", "3"],
                        }
                    ],
                }
            ],
        },
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {
                                    "id": "brand_a_pt_q1",
                                    "text": "Original product question",
                                    "options": ["Poor", "Good"],
                                }
                            ]
                        }
                    ]
                }
            ]
        },
    }

    edited_schema = {
        "layer1_structure": {
            "sections": [
                {
                    "title": "Screening",
                    "questions": [
                        {
                            "id": "q1",
                            "label": "Analyst screening prompt",
                            "options": ["نعم", "لا"],
                        }
                    ],
                }
            ],
        },
        "layer2_structure": {
            "sections": [
                {
                    "title": "Evaluation",
                    "questions": [
                        {
                            "id": "tt_q1",
                            "text": "Analyst taste question",
                            "options": ["Low", "High"],
                        }
                    ],
                }
            ],
        },
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {
                                    "id": "brand_a_pt_q1",
                                    "text": "Analyst product question",
                                    "options": ["Bad", "Great"],
                                }
                            ]
                        }
                    ]
                }
            ]
        },
    }

    overlay_blueprint_edits(target, edited_schema, edited_schema["product_test_snapshot"])

    l1 = target["template_snapshot_schema"]["layer1_structure"]["sections"][0]["questions"][0]
    l2 = target["template_snapshot_schema"]["layer2_structure"]["sections"][0]["questions"][0]
    pt = target["product_test_snapshot"]["phases"][0]["sections"][0]["questions"][0]

    assert l1["label"] == "Analyst screening prompt"
    assert l1["options"] == ["نعم", "لا"]
    assert l2["text"] == "Analyst taste question"
    assert l2["options"] == ["Low", "High"]
    assert pt["text"] == "Analyst product question"
    assert pt["options"] == ["Bad", "Great"]
    assert target["template_snapshot_questions"][0]["label"] == "Analyst screening prompt"


# ── Per-brand isolation ────────────────────────────────────────────────────
#
# Taste-test questions keep the bare question-bank id, so every brand's copy of
# a question shares one id (`tt_q5` for one brand, `tt_q5` for the next). While
# edits were indexed by id alone, all brands collapsed onto a single entry —
# last one read wins — and that one question's text was written into every
# brand's section, leaving the per-brand titles untouched. A blind study then
# read "circle" in the heading and "square" in the questions beneath it, for
# every brand except the last.


def _brand_section(brand: str, code: str, text: str) -> dict:
    return {
        "title": f"{code}: Appearance",
        "brand": brand,
        "module": "taste_test",
        "attribute": "Appearance",
        "questions": [{"id": "tt_q5", "text": text}],
    }


def _two_brand_target() -> dict:
    sections = [
        _brand_section("Squizz", "CIRCLE", "How is the size of CIRCLE?"),
        _brand_section("KIKS", "SQUARE", "How is the size of SQUARE?"),
    ]
    schema = {"layer2_structure": {"sections": sections}}
    return {
        "template_snapshot_schema": deepcopy(schema),
        "template_snapshot_l2": deepcopy(schema["layer2_structure"]),
    }


def test_shared_question_id_does_not_leak_one_brands_text_into_another():
    target = _two_brand_target()
    edited = deepcopy(target["template_snapshot_schema"])

    overlay_blueprint_edits(target, edited)

    for section in target["template_snapshot_l2"]["sections"]:
        code = "CIRCLE" if "CIRCLE" in section["title"] else "SQUARE"
        assert code in section["questions"][0]["text"], (
            f"{section['brand']}'s heading says {code} but its question does not"
        )


def test_an_edit_applies_only_to_the_brand_it_was_made_on():
    target = _two_brand_target()
    edited = deepcopy(target["template_snapshot_schema"])
    edited["layer2_structure"]["sections"][0]["questions"][0]["text"] = "EDITED CIRCLE"

    overlay_blueprint_edits(target, edited)

    squizz, kiks = target["template_snapshot_l2"]["sections"]
    assert squizz["questions"][0]["text"] == "EDITED CIRCLE"
    assert kiks["questions"][0]["text"] == "How is the size of SQUARE?", (
        "the edit made on one brand was sprayed onto the other"
    )


def test_sections_without_a_brand_still_match_by_id_alone():
    """Screening, before-taste and preference sections are shared, not
    per-brand — they have no brand and must keep matching on id."""
    schema = {
        "layer1_structure": {
            "sections": [{"title": "Screening", "questions": [{"id": "q1", "label": "Original"}]}]
        }
    }
    target = {"template_snapshot_schema": deepcopy(schema)}
    edited = deepcopy(schema)
    edited["layer1_structure"]["sections"][0]["questions"][0]["label"] = "Analyst copy"

    overlay_blueprint_edits(target, edited)

    patched = target["template_snapshot_schema"]["layer1_structure"]["sections"][0]
    assert patched["questions"][0]["label"] == "Analyst copy"
