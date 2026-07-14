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
