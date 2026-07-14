"""Tests for product test analytics service (Phase 4 brand-aware)."""

from backend.services.product_test_analytics_service import (
    PRODUCT_TEST_UNSCOPED_BRAND_KEY,
    build_attribute_registry_from_snapshot,
    extract_product_test_flat_evaluations,
    filter_evaluations_by_brand,
    filter_evaluations_by_diagnostic_tag,
    filter_evaluations_by_timing,
    filter_scalar_evaluations,
    filter_trial_media_evaluations,
    resolve_product_test_attribute_registry_for_survey,
    summarize_product_test_responses,
    summarize_trial_media_responses,
)

MOCK_SNAPSHOT = {
    "version": 1,
    "language": "en",
    "phases": [
        {
            "timing": "before_use",
            "label": "Before Use",
            "sections": [
                {
                    "id": "s1",
                    "title": "Appearance",
                    "module": "product_test",
                    "brand": "BrandA",
                    "questions": [
                        {
                            "id": "BrandA_pt_q01",
                            "text": "Look",
                            "type": "scale",
                            "diagnostic_tag": "PF",
                            "canonicalQuestionId": "pt_q01",
                        }
                    ],
                }
            ],
        }
    ],
    "meta": {"totalQuestions": 1},
}

MOCK_ANSWERS = {
    "__structured": {
        "product_test": {
            "flat_evaluations": [
                {
                    "question_id": "BrandA_pt_q01",
                    "brand": "BrandA",
                    "brand_display": "SAMPLE-123",
                    "canonical_question_id": "pt_q01",
                    "attribute": "Appearance",
                    "timing": "before_use",
                    "diagnostic_tag": "PF",
                    "module": "product_test",
                    "value": 4,
                },
                {
                    "question_id": "pt_pkg_q01",
                    "brand": None,
                    "brand_display": None,
                    "canonical_question_id": "pt_pkg_q01",
                    "attribute": "Packaging",
                    "timing": "after_use",
                    "diagnostic_tag": None,
                    "module": "product_test",
                    "value": 5,
                    "value_kind": "scalar_numeric",
                },
                {
                    "question_id": "pt_trial_media_upload",
                    "brand": None,
                    "brand_display": None,
                    "canonical_question_id": "pt_trial_media_upload",
                    "attribute": "Trial Media",
                    "timing": "after_use",
                    "diagnostic_tag": None,
                    "module": "trial_media_capture",
                    "value_kind": "media_reference",
                    "value": {
                        "asset_id": "asset-1",
                        "media_type": "image",
                        "mime": "image/jpeg",
                        "size_bytes": 2048,
                        "uploaded_at": "2026-01-01T00:00:00Z",
                    },
                },
            ]
        }
    }
}


def test_build_attribute_registry_from_snapshot():
    registry = build_attribute_registry_from_snapshot(MOCK_SNAPSHOT)
    assert len(registry) == 1
    assert registry[0]["question_id"] == "BrandA_pt_q01"
    assert registry[0]["brand"] == "BrandA"
    assert registry[0]["canonical_question_id"] == "pt_q01"
    assert registry[0]["timing"] == "before_use"
    assert registry[0]["diagnostic_tag"] == "PF"


def test_extract_and_filter_evaluations():
    rows = extract_product_test_flat_evaluations(MOCK_ANSWERS)
    assert len(rows) == 3
    assert filter_evaluations_by_timing(rows, "before_use")[0]["value"] == 4
    assert filter_evaluations_by_diagnostic_tag(rows, "PF")[0]["question_id"] == "BrandA_pt_q01"
    assert len(filter_evaluations_by_brand(rows, "BrandA")) == 1
    assert len(filter_evaluations_by_brand(rows, PRODUCT_TEST_UNSCOPED_BRAND_KEY)) == 2
    assert len(filter_scalar_evaluations(rows)) == 2
    assert len(filter_trial_media_evaluations(rows)) == 1


def test_summarize_product_test_responses():
    summary = summarize_product_test_responses([
        {"answers": MOCK_ANSWERS},
        {"answers": MOCK_ANSWERS},
    ])
    assert summary["response_count"] == 2
    assert summary["total_answers"] == 6
    assert summary["scalar_answer_count"] == 4
    assert summary["media_reference_count"] == 2
    assert summary["by_timing"]["before_use"] == 2
    assert summary["by_brand"]["BrandA"]["count"] == 2
    assert summary["by_brand"]["BrandA"]["brand_display"] == "SAMPLE-123"
    assert summary["by_brand"][PRODUCT_TEST_UNSCOPED_BRAND_KEY]["count"] == 4
    assert summary["trial_media"]["upload_count"] == 2


def test_summarize_trial_media_responses():
    summary = summarize_trial_media_responses([{"answers": MOCK_ANSWERS}])
    assert summary["upload_count"] == 1
    assert summary["by_media_type"]["image"] == 1
    assert summary["total_bytes"] == 2048


def test_resolve_product_test_attribute_registry_from_snapshot():
    survey = {
        "type": "product_test",
        "product_test_snapshot": MOCK_SNAPSHOT,
    }
    registry = resolve_product_test_attribute_registry_for_survey(survey)
    assert len(registry) == 1
    assert registry[0]["question_id"] == "BrandA_pt_q01"
    assert registry[0]["timing"] == "before_use"
    assert registry[0]["diagnostic_tag"] == "PF"


def test_resolve_product_test_attribute_registry_migrates_legacy_l2():
    survey = {
        "type": "product_test",
        "template_snapshot_l2": {
            "sections": [
                {
                    "module": "product_test",
                    "title": "Appearance",
                    "questions": [
                        {
                            "id": "pt_q01",
                            "text": "Look",
                            "type": "scale",
                            "timing": "before_use",
                            "diagnostic_tag": "PF",
                        }
                    ],
                }
            ]
        },
    }
    registry = resolve_product_test_attribute_registry_for_survey(survey)
    assert len(registry) >= 1
    assert registry[0]["timing"] == "before_use"
