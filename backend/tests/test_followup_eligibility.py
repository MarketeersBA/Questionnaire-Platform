"""Phase 4 regression tests for follow-up eligibility rules."""

import pytest

from backend.voice_feedback.followup_eligibility import (
    classify_question_category,
    is_followup_question_eligible,
    is_open_end_question_type,
    is_probe_category,
    resolve_question_for_surface,
)


def test_classify_question_category_probe_buckets():
    assert classify_question_category("What did you like?") == "likes"
    assert classify_question_category("What did you dislike?") == "dislikes"
    assert classify_question_category("Would you recommend this?") == "suggestions"
    assert classify_question_category("What did you think overall?") == "overall"


def test_classify_question_category_egyptian_arabic_taste_test():
    """Regression: Egyptian dialect L2 prompts from live taste-test templates."""
    assert classify_question_category("إيه أكتر حاجة عجبتك في الطعم؟") == "likes"
    assert classify_question_category("إيه أكتر حاجة ماعجبتكش في الطعم؟") == "dislikes"
    assert classify_question_category("إيه مقترحاتك عشان نحسن طعم abu auf؟") == "suggestions"


def test_is_probe_category():
    assert is_probe_category("likes")
    assert not is_probe_category("overall")


def test_taste_l2_open_end_requires_probe_category():
    survey = {
        "type": "taste_test",
        "layer2_questions": {
            "sections": [
                {
                    "title": "General Evaluation",
                    "questions": [{"id": "q1", "type": "open-ended", "text": "Like?"}],
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="q1",
        question_text="What did you like about the taste?",
        respondent_surface="taste_l2_open_end",
    )
    assert eligible

    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="q1",
        question_text="What did you think overall?",
        respondent_surface="taste_l2_open_end",
    )
    assert not eligible


def test_taste_l2_open_end_without_timing_gate():
    """Explicit taste surface passes for probe open-ends regardless of timing metadata."""
    survey = {
        "type": "taste_test",
        "layer2_questions": {
            "sections": [
                {
                    "title": "Screening",
                    "questions": [
                        {
                            "id": "q_like",
                            "type": "open-ended",
                            "text": "What did you like?",
                            "timing": "Before Taste",
                        }
                    ],
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_q_like",
        question_text="What did you like about the product?",
        respondent_surface="taste_l2_open_end",
    )
    assert eligible


def test_taste_l2_rejects_resolved_scale_question_with_explicit_surface():
    survey = {
        "type": "taste_test",
        "layer2_questions": {
            "sections": [
                {
                    "questions": [
                        {
                            "id": "tt_q1",
                            "type": "scale",
                            "text": "How much do you like this?",
                        }
                    ]
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_tt_q1",
        question_text="What did you like about the taste?",
        respondent_surface="taste_l2_open_end",
    )
    assert not eligible


def test_is_open_end_question_type_detects_mcq_open_end_alias():
    assert is_open_end_question_type({"type": "open-ended"})
    assert is_open_end_question_type({"type": "text"})
    assert is_open_end_question_type({
        "type": "mcq",
        "options": ["open-end"],
    })
    assert not is_open_end_question_type({"type": "scale"})


def test_resolve_question_for_surface_brand_scoped_l2():
    survey = {
        "layer2_questions": {
            "sections": [
                {"questions": [{"id": "q1", "type": "open-ended", "text": "Like?"}]}
            ]
        }
    }
    resolved = resolve_question_for_surface(survey, "BrandX_q1", "taste_l2_open_end")
    assert resolved is not None
    assert resolved["id"] == "q1"


def test_product_test_open_end_requires_probe_category():
    survey = {
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {
                                    "id": "BrandA_pt_q31",
                                    "type": "open-ended",
                                    "text": "Why recommend?",
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
    eligible, category = is_followup_question_eligible(
        survey,
        question_id="BrandA_pt_q31",
        question_text="Why would you recommend this to your family?",
        respondent_surface="product_test_open_end",
    )
    assert eligible
    assert category == "suggestions"

    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_pt_q99",
        question_text="Tell us anything else",
        respondent_surface="product_test_open_end",
    )
    assert not eligible


def test_product_test_heatmap_comment_always_allowed():
    survey = {
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {"id": "hm1", "type": "packaging-heatmap", "text": "Heatmap"},
                            ]
                        }
                    ]
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="hm1",
        question_text="Overall comment",
        respondent_surface="product_test_heatmap_comment",
    )
    assert eligible


def test_module_and_unknown_surfaces_rejected():
    eligible, _ = is_followup_question_eligible(
        {},
        question_id="bu_usage_open_1",
        question_text="How do you use this brand?",
        respondent_surface=None,
    )
    assert not eligible

    eligible, _ = is_followup_question_eligible(
        {},
        question_id="pf_specify_1",
        question_text="Please specify your answer",
        question_category="general",
        respondent_surface="product_test_open_end",
    )
    assert not eligible


def test_product_test_open_end_rejects_resolved_scale_with_explicit_surface():
    survey = {
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {
                                    "id": "BrandA_pt_q30",
                                    "type": "scale",
                                    "text": "Recommend?",
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_pt_q30",
        question_text="Why would you recommend this?",
        respondent_surface="product_test_open_end",
    )
    assert not eligible


def test_infers_product_test_surface_from_snapshot():
    survey = {
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {
                                    "id": "BrandA_pt_q30",
                                    "type": "scale",
                                    "text": "Recommend to family?",
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_pt_q31",
        question_text="Why would you recommend this product?",
        respondent_surface=None,
    )
    assert not eligible

    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="BrandA_pt_q31",
        question_text="Why would you recommend this product?",
        respondent_surface="product_test_open_end",
    )
    assert eligible


def test_eligible_surfaces_config_restricts_heatmap():
    survey = {
        "ai_followup": {
            "eligible_surfaces": ["taste_l2_open_end", "product_test_open_end"],
        },
        "product_test_snapshot": {
            "phases": [
                {
                    "sections": [
                        {
                            "questions": [
                                {"id": "hm1", "type": "packaging-heatmap", "text": "Mark packaging"},
                            ]
                        }
                    ]
                }
            ]
        },
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="hm1",
        question_text="Overall comment",
        respondent_surface="product_test_heatmap_comment",
    )
    assert not eligible


def test_resolve_min_answer_length_defaults_and_clamps():
    from backend.voice_feedback.followup_eligibility import resolve_min_answer_length

    assert resolve_min_answer_length({}) == 5
    assert resolve_min_answer_length({"ai_followup": {"min_answer_length": 8}}) == 8
    assert resolve_min_answer_length({"ai_followup": {"min_answer_length": 999}}) == 100


@pytest.mark.parametrize(
    "question_text,expected",
    [
        ("What did you like about the taste?", True),
        ("What did you dislike about it?", True),
        ("Would you recommend this to your family?", True),
        ("What did you think overall?", False),
        ("Tell us anything else about your experience", False),
    ],
)
def test_taste_l2_probe_matrix_by_surface_and_category(question_text, expected):
    survey = {
        "type": "taste_test",
        "layer2_questions": {
            "sections": [
                {
                    "title": "Evaluation",
                    "questions": [{"id": "q1", "type": "open-ended", "text": question_text}],
                }
            ]
        },
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="q1",
        question_text=question_text,
        respondent_surface="taste_l2_open_end",
    )
    assert eligible is expected


def test_taste_l2_non_open_end_schema_fails_with_explicit_surface():
    survey = {
        "type": "taste_test",
        "layer2_questions": {
            "sections": [
                {
                    "questions": [
                        {
                            "id": "q_scale",
                            "type": "scale",
                            "text": "How much do you like this?",
                        }
                    ]
                }
            ]
        },
    }
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="q_scale",
        question_text="What did you like about the taste?",
        respondent_surface="taste_l2_open_end",
    )
    assert not eligible


def test_template_snapshot_l2_like_open_end_eligible_with_brand_scoped_id():
    from backend.voice_feedback.followup_eligibility import (
        evaluate_followup_question_eligibility,
        resolve_layer2_schema,
    )

    survey = {
        "type": "taste_test",
        "template_snapshot_l2": {
            "sections": [
                {
                    "title": "After Taste",
                    "questions": [
                        {
                            "id": "q_like",
                            "type": "open-ended",
                            "text": "What did you like about the taste?",
                        }
                    ],
                }
            ]
        },
    }
    assert resolve_layer2_schema(survey)["sections"][0]["questions"][0]["id"] == "q_like"

    evaluation = evaluate_followup_question_eligibility(
        survey,
        question_id="BrandA_q_like",
        question_text="What did you like about the taste?",
        respondent_surface="taste_l2_open_end",
    )
    assert evaluation.eligible
    assert evaluation.surface == "taste_l2_open_end"


def test_template_snapshot_l2_scale_rejected_with_explicit_surface():
    from backend.voice_feedback.followup_eligibility import evaluate_followup_question_eligibility
    from backend.voice_feedback.followup_rejection import FollowUpRejectionCode

    survey = {
        "template_snapshot_l2": {
            "sections": [
                {
                    "questions": [
                        {
                            "id": "q_scale",
                            "type": "scale",
                            "text": "How much do you like this?",
                        }
                    ]
                }
            ]
        }
    }
    evaluation = evaluate_followup_question_eligibility(
        survey,
        question_id="BrandA_q_scale",
        question_text="What did you like about the taste?",
        respondent_surface="taste_l2_open_end",
    )
    assert not evaluation.eligible
    assert evaluation.rejection_code.value == FollowUpRejectionCode.NON_OPEN_END_SCHEMA.value


def test_template_snapshot_l2_surface_inference_without_explicit_surface():
    from backend.voice_feedback.followup_eligibility import evaluate_followup_question_eligibility

    survey = {
        "template_snapshot_l2": {
            "sections": [
                {
                    "questions": [
                        {
                            "id": "q_dislike",
                            "type": "text",
                            "text": "What did you dislike?",
                        }
                    ]
                }
            ]
        }
    }
    evaluation = evaluate_followup_question_eligibility(
        survey,
        question_id="BrandB_q_dislike",
        question_text="What did you dislike about it?",
        respondent_surface=None,
    )
    assert evaluation.eligible
    assert evaluation.surface == "taste_l2_open_end"


class TestTemplateSnapshotL2RegressionMatrix:
    """Phase 3 — persisted L2 schema regression coverage."""

    @staticmethod
    def _open_end_survey(*, question_id: str = "q1", question_type: str = "open-ended"):
        return {
            "type": "taste_test",
            "template_snapshot_l2": {
                "sections": [
                    {
                        "questions": [
                            {
                                "id": question_id,
                                "type": question_type,
                                "text": "What did you like about the taste?",
                            }
                        ]
                    }
                ]
            },
        }

    def test_brand_scoped_id_brand_a_q1_resolves_and_eligible(self):
        from backend.voice_feedback.followup_eligibility import (
            evaluate_followup_question_eligibility,
            resolve_question_for_surface,
        )

        survey = self._open_end_survey()
        resolved = resolve_question_for_surface(survey, "BrandA_q1", "taste_l2_open_end")
        assert resolved is not None
        assert resolved["id"] == "q1"

        evaluation = evaluate_followup_question_eligibility(
            survey,
            question_id="BrandA_q1",
            question_text="What did you like about the taste?",
            respondent_surface="taste_l2_open_end",
        )
        assert evaluation.eligible
        assert evaluation.surface == "taste_l2_open_end"

    def test_scale_question_rejected_with_structured_code(self):
        from backend.voice_feedback.followup_eligibility import evaluate_followup_question_eligibility
        from backend.voice_feedback.followup_rejection import FollowUpRejectionCode

        survey = self._open_end_survey(question_id="q_scale", question_type="scale")
        evaluation = evaluate_followup_question_eligibility(
            survey,
            question_id="BrandA_q_scale",
            question_text="What did you like about the taste?",
            respondent_surface="taste_l2_open_end",
        )
        assert not evaluation.eligible
        assert evaluation.rejection_code == FollowUpRejectionCode.NON_OPEN_END_SCHEMA

    def test_eligible_surfaces_excluding_taste_blocks_l2(self):
        from backend.voice_feedback.followup_eligibility import evaluate_followup_question_eligibility
        from backend.voice_feedback.followup_rejection import FollowUpRejectionCode

        survey = self._open_end_survey()
        survey["ai_followup"] = {
            "eligible_surfaces": ["product_test_open_end"],
        }
        evaluation = evaluate_followup_question_eligibility(
            survey,
            question_id="BrandA_q1",
            question_text="What did you like about the taste?",
            respondent_surface="taste_l2_open_end",
        )
        assert not evaluation.eligible
        assert evaluation.rejection_code == FollowUpRejectionCode.SURFACE_DISABLED

    def test_layer2_questions_preferred_when_both_schemas_present(self):
        from backend.voice_feedback.followup_eligibility import resolve_layer2_schema

        survey = {
            "layer2_questions": {
                "sections": [{"questions": [{"id": "from_public", "type": "open-ended"}]}],
            },
            "template_snapshot_l2": {
                "sections": [{"questions": [{"id": "from_db", "type": "scale"}]}],
            },
        }
        schema = resolve_layer2_schema(survey)
        assert schema["sections"][0]["questions"][0]["id"] == "from_public"

