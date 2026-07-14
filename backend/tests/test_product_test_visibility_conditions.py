"""Tests for product-test recommend visibility metadata."""

from backend.services.product_test_orchestration import build_product_test_snapshot
from backend.services.product_test_visibility_conditions import (
    RECOMMEND_OPEN_END_VISIBLE_MAX,
    RECOMMEND_OPEN_END_VISIBLE_MIN,
    apply_recommend_visibility_conditions,
)


def test_apply_recommend_visibility_conditions_pairs_scale_and_open_end():
    questions = [
        {
            "id": "BrandA_pt_q30",
            "canonicalQuestionId": "pt_q30",
            "text": "How likely are you to recommend this product to family or friends?",
            "type": "scale",
        },
        {
            "id": "BrandA_pt_q31",
            "canonicalQuestionId": "pt_q31",
            "text": "Why would you recommend this product to your family?",
            "type": "open-ended",
        },
    ]
    bank = [
        (
            "pt_q30",
            {
                "question_id": "pt_q30",
                "question_type": "scale 1-10",
                "en_text": "How likely are you to recommend this product to family or friends?",
            },
        ),
        (
            "pt_q31",
            {
                "question_id": "pt_q31",
                "question_type": "Open-End",
                "en_text": "Why would you recommend this product to your family?",
                "en_options": "open-end",
            },
        ),
    ]

    result = apply_recommend_visibility_conditions(questions, bank, "en")
    assert result[0].get("visibilityCondition") is None
    assert result[1]["visibilityCondition"] == {
        "dependsOnQuestionId": "BrandA_pt_q30",
        "min": RECOMMEND_OPEN_END_VISIBLE_MIN,
        "max": RECOMMEND_OPEN_END_VISIBLE_MAX,
    }


def test_build_product_test_snapshot_embeds_recommend_visibility_metadata():
    bank = [
        {
            "question_id": "pt_q30",
            "attribute": "Recommendation",
            "attribute_type": "sub",
            "parent_attribute": "Overall Evaluation",
            "question_type": "scale 1-10",
            "en_text": "How likely are you to recommend this product to family or friends?",
            "timing": "After Use",
            "question_status": "optional",
        },
        {
            "question_id": "pt_q31",
            "attribute": "Why Recommend",
            "attribute_type": "sub",
            "parent_attribute": "Overall Evaluation",
            "question_type": "Open-End",
            "en_text": "Why would you recommend this product to your family?",
            "en_options": "open-end",
            "timing": "After Use",
            "question_status": "optional",
        },
    ]
    snapshot = build_product_test_snapshot(
        {"selected_attributes": ["Overall Evaluation"]},
        bank,
        [],
        "en",
    )
    after = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    questions = after["sections"][0]["questions"]
    why = next(q for q in questions if q["id"] == "pt_q31")
    assert why["visibilityCondition"]["dependsOnQuestionId"] == "pt_q30"
    assert why["visibilityCondition"]["min"] == 6
    assert why["visibilityCondition"]["max"] == 10
