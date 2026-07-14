"""Phase 3 — packaging heatmap snapshot orchestration."""

from backend.packaging_heatmap.snapshot import (
    build_packaging_heatmap_section,
    build_packaging_heatmap_snapshot_meta,
    heatmap_canonical_question_id,
)
from backend.services.product_test_orchestration import build_product_test_snapshot


def _front_image():
    return {
        "asset_id": "img_front_1",
        "side": "front",
        "survey_id": "s1",
        "width": 800,
        "height": 600,
        "mime": "image/png",
        "uploaded_at": "2026-06-30T00:00:00Z",
    }


def _back_image():
    return {
        "asset_id": "img_back_1",
        "side": "back",
        "survey_id": "s1",
        "width": 800,
        "height": 600,
        "mime": "image/png",
        "uploaded_at": "2026-06-30T00:00:00Z",
    }


def test_build_packaging_heatmap_section_requires_own_brand_and_front_image():
    pt_config = {
        "packaging_heatmap_enabled": True,
        "packaging_heatmap_images": {"front": _front_image(), "back": None},
    }
    assert build_packaging_heatmap_section(pt_config, None, "en") is None

    section = build_packaging_heatmap_section(
        pt_config,
        {
            "brands": ["Acme"],
            "own_brand": "Acme",
            "category": "Shampoo",
            "testing_protocol": "branded",
            "blind_codes": {},
        },
        "en",
    )
    assert section is not None
    assert section["module"] == "packaging_heatmap"
    assert section["brand"] == "Acme"
    assert len(section["questions"]) == 3
    assert section["questions"][0]["type"] == "packaging-heatmap"
    assert section["questions"][0]["id"] == "Acme_pkg_hm_front_attraction"


def test_build_packaging_heatmap_section_includes_back_when_configured():
    pt_config = {
        "packaging_heatmap_enabled": True,
        "packaging_heatmap_images": {
            "front": _front_image(),
            "back": _back_image(),
        },
    }
    brand_context = {
        "brands": ["Acme"],
        "own_brand": "Acme",
        "category": "Shampoo",
        "testing_protocol": "branded",
        "blind_codes": {},
    }
    section = build_packaging_heatmap_section(pt_config, brand_context, "en")
    assert section is not None
    assert len(section["questions"]) == 6
    canonical_ids = {q["canonicalQuestionId"] for q in section["questions"]}
    assert heatmap_canonical_question_id("front", "attraction") in canonical_ids
    assert heatmap_canonical_question_id("back", "improve") in canonical_ids


def test_build_product_test_snapshot_appends_heatmap_to_packaging_phase():
    bank = [{
        "question_id": "pt_q01",
        "attribute": "Look",
        "attribute_type": "sub",
        "parent_attribute": "Product Appearance",
        "question_type": "scale 1-5",
        "en_text": "Look",
        "timing": "Before Use",
        "question_status": "fixed",
    }]
    pkg_bank = [{
        "question_id": "pkg_q01",
        "attribute": "Pack Shape",
        "question_type": "scale 1-5",
        "en_text": "Shape",
        "timing": "Before Use",
        "question_status": "fixed",
    }]
    pt_config = {
        "language": "en",
        "selected_attributes": [],
        "fixed_questions": ["pt_q01"],
        "optional_questions": [],
        "package_test_enabled": True,
        "package_test_attributes": ["Pack Shape"],
        "packaging_heatmap_enabled": True,
        "packaging_heatmap_images": {
            "front": _front_image(),
            "back": None,
        },
    }
    brand_context = {
        "brands": ["Acme", "Rival"],
        "own_brand": "Acme",
        "category": "Shampoo",
        "testing_protocol": "branded",
        "blind_codes": {},
    }

    snapshot = build_product_test_snapshot(
        pt_config,
        bank,
        pkg_bank,
        "en",
        brand_context=brand_context,
    )

    packaging = next(p for p in snapshot["phases"] if p["timing"] == "packaging")
    modules = [s["module"] for s in packaging["sections"]]
    assert "package_test" in modules
    assert "packaging_heatmap" in modules

    heatmap_section = next(s for s in packaging["sections"] if s["module"] == "packaging_heatmap")
    assert heatmap_section["brand"] == "Acme"
    assert len(heatmap_section["questions"]) == 3

    assert snapshot["meta"].get("packaging_heatmap", {}).get("enabled") is True
    assert "front" in snapshot["meta"]["packaging_heatmap"]["images"]


def test_build_packaging_heatmap_snapshot_meta_disabled_when_feature_off():
    assert build_packaging_heatmap_snapshot_meta({"packaging_heatmap_enabled": False}) is None
