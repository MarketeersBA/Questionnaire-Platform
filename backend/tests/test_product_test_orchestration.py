"""Unit tests for product test orchestration helpers."""

from backend.services.product_test_orchestration import (
    build_product_test_snapshot,
    normalize_product_test_config,
    resolve_brands_from_survey_data,
    resolve_orchestration_category,
    resolve_orchestration_language,
    resolve_product_test_fixed_question_ids,
)


def test_resolve_orchestration_language_prefers_product_test_config():
    survey = {
        "config": {"language": "en"},
        "taste_test_config": {"language": "en"},
        "product_test_config": {"language": "ar"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_resolve_orchestration_language_falls_back_to_taste_test_config():
    survey = {
        "config": {"language": "en"},
        "taste_test_config": {"language": "ar"},
    }
    assert resolve_orchestration_language(survey) == "ar"


def test_resolve_orchestration_language_defaults_to_en():
    assert resolve_orchestration_language({}) == "en"


def test_resolve_orchestration_category_from_taste_test_config():
    survey = {"taste_test_config": {"category": "Shampoo"}}
    assert resolve_orchestration_category(survey) == "Shampoo"


def test_resolve_product_test_fixed_question_ids_auto_collects():
    bank = [
        {"question_id": "pt_q01", "question_status": "optional"},
        {"question_id": "pt_q08", "question_status": "fixed"},
        {"question_id": "pt_q29", "question_status": "fixed"},
    ]
    ids = resolve_product_test_fixed_question_ids({}, bank)
    assert ids == ["pt_q08", "pt_q29"]


def test_resolve_product_test_fixed_question_ids_respects_config():
    bank = [{"question_id": "pt_q08", "question_status": "fixed"}]
    ids = resolve_product_test_fixed_question_ids({"fixed_questions": ["pt_q01"]}, bank)
    assert ids == ["pt_q01"]


def test_normalize_product_test_config_populates_fixed_questions():
    bank = [{"question_id": "pt_q08", "question_status": "fixed"}]
    normalized = normalize_product_test_config({"language": "ar"}, bank)
    assert normalized["fixed_questions"] == ["pt_q08"]
    assert normalized["selected_attributes"] == []
    assert normalized["package_test_enabled"] is False


def test_build_product_test_snapshot_is_timing_phased_not_flat_l2():
    """Phase 1/2 contract: snapshot uses phases, not flat layer2 sections."""
    from backend.services.product_test_orchestration import build_product_test_snapshot

    bank = [
        {
            "question_id": "pt_q01",
            "attribute": "Look",
            "attribute_type": "sub",
            "parent_attribute": "Product Appearance",
            "question_type": "scale 1-5",
            "en_text": "Look",
            "timing": "Before Use",
            "question_status": "fixed",
        },
        {
            "question_id": "pt_q08",
            "attribute": "Ease",
            "attribute_type": "sub",
            "parent_attribute": "Prep",
            "question_type": "scale 1-5",
            "en_text": "Ease",
            "timing": "During Use",
            "question_status": "fixed",
        },
    ]
    snapshot = build_product_test_snapshot({}, bank, [], "en")
    assert snapshot["version"] == 1
    assert len(snapshot["phases"]) >= 2
    assert snapshot["meta"]["totalQuestions"] == 2
    timings = {p["timing"] for p in snapshot["phases"]}
    assert "before_use" in timings
    assert "during_use" in timings


def test_resolve_brands_from_survey_data_mirrors_parameters():
    survey = {
        "taste_test_config": {
            "own_brand": "Own Brand",
            "internal_brands_data": [{"name": "Own Brand"}],
            "competitor_brands_data": [{"name": "Competitor X"}],
            "category": "Foam",
            "testing_protocol": "blind",
            "blind_codes": {"Own Brand": "SAMPLE-A"},
        }
    }
    ctx = resolve_brands_from_survey_data(survey)
    assert ctx["brands"] == ["Own Brand", "Competitor X"]
    assert ctx["testing_protocol"] == "blind"
    assert ctx["blind_codes"]["Own Brand"] == "SAMPLE-A"


def test_brand_loop_parity_with_frontend_contract():
    """Backend brand loop matches FE: scoped ids, brand_context, preference section."""
    bank = [
        {
            "question_id": "pt_q01",
            "attribute": "Look",
            "attribute_type": "sub",
            "parent_attribute": "Product Appearance",
            "question_type": "scale 1-5",
            "en_text": "Product Look",
            "timing": "Before Use",
            "question_status": "optional",
        },
        {
            "question_id": "pt_q29",
            "attribute": "Overall Liking",
            "attribute_type": "",
            "parent_attribute": None,
            "question_type": "scale 1-9",
            "en_text": "Overall Liking",
            "timing": "After Use",
            "question_status": "fixed",
        },
    ]
    brand_context = {
        "brands": ["BrandA", "BrandB"],
        "category": "Foam",
        "testing_protocol": "branded",
        "blind_codes": {},
    }
    snapshot = build_product_test_snapshot(
        {"selected_attributes": ["Product Appearance"]},
        bank,
        [],
        "en",
        brand_context=brand_context,
    )
    assert snapshot["meta"]["brandCount"] == 2
    before = next(p for p in snapshot["phases"] if p["timing"] == "before_use")
    assert len(before["sections"]) == 2
    ids = [q["id"] for s in before["sections"] for q in s["questions"]]
    assert "BrandA_pt_q01" in ids
    assert "BrandB_pt_q01" in ids
    after = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    assert any(s.get("id") == "product_preference" for s in after["sections"])


def test_brand_scoped_recommend_visibility_metadata_parity_with_frontend():
    """Phase 4: backend snapshot builder pairs recommend scale + why-open-end."""
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
    brand_context = {
        "brands": ["Own Brand", "Competitor X"],
        "own_brand": "Own Brand",
        "category": "Foam",
        "testing_protocol": "branded",
        "blind_codes": {},
    }
    snapshot = build_product_test_snapshot(
        {"selected_attributes": ["Overall Evaluation"]},
        bank,
        [],
        "en",
        brand_context=brand_context,
    )
    after = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    own_section = next(s for s in after["sections"] if s.get("brand") == "Own Brand")
    why = next(q for q in own_section["questions"] if q.get("canonicalQuestionId") == "pt_q31")
    assert why["visibilityCondition"]["dependsOnQuestionId"] == "Own Brand_pt_q30"
    assert why["visibilityCondition"]["min"] == 6
    assert why["visibilityCondition"]["max"] == 10

