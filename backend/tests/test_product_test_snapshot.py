"""Tests for product test snapshot builder and migration helpers."""

from backend.services.product_test_orchestration import (
    build_product_test_snapshot,
    migrate_legacy_l2_to_product_test_snapshot,
    strip_product_test_from_l2,
    bank_timing_to_phase,
)


MOCK_BANK = [
    {
        "question_id": "pt_q01",
        "attribute": "Product Look",
        "attribute_type": "sub",
        "parent_attribute": "Product Appearance",
        "diagnostic_tag": "PF",
        "question_type": "scale 1-5",
        "en_text": "Product Look",
        "ar_text": "مظهر المنتج",
        "en_options": "1 = Very Poor, 5 = Excellent",
        "timing": "Before Use",
        "question_status": "optional",
        "order": 1,
    },
    {
        "question_id": "pt_q08",
        "attribute": "Ease of Use",
        "attribute_type": "sub",
        "parent_attribute": "Preparation & Usage",
        "diagnostic_tag": "PF",
        "question_type": "scale 1-5",
        "en_text": "Ease of use",
        "timing": "During Use",
        "question_status": "fixed",
        "order": 8,
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
        "order": 29,
    },
]


def test_bank_timing_to_phase():
    assert bank_timing_to_phase("Before Use") == "before_use"
    assert bank_timing_to_phase("During Use") == "during_use"
    assert bank_timing_to_phase(None) == "before_use"


def test_build_product_test_snapshot_groups_by_timing_phase():
    config = {"language": "en", "selected_attributes": ["Product Appearance"]}
    snapshot = build_product_test_snapshot(config, MOCK_BANK, [], "en")

    assert snapshot["version"] == 1
    assert snapshot["meta"]["totalQuestions"] >= 3
    timings = [p["timing"] for p in snapshot["phases"]]
    assert "before_use" in timings
    assert "during_use" in timings
    assert "after_use" in timings

    before = next(p for p in snapshot["phases"] if p["timing"] == "before_use")
    ids = [q["id"] for s in before["sections"] for q in s["questions"]]
    assert "pt_q01" in ids


def test_build_product_test_snapshot_brand_loop():
    config = {"language": "en", "selected_attributes": ["Product Appearance"]}
    brand_context = {
        "brands": ["Own Brand", "Competitor X"],
        "own_brand": "Own Brand",
        "category": "Foam",
        "testing_protocol": "branded",
        "blind_codes": {},
    }
    snapshot = build_product_test_snapshot(
        config, MOCK_BANK, [], "en", brand_context=brand_context,
    )

    assert snapshot["brand_context"]["brands"] == ["Own Brand", "Competitor X"]
    assert snapshot["meta"]["brandCount"] == 2

    before = next(p for p in snapshot["phases"] if p["timing"] == "before_use")
    assert len(before["sections"]) == 2

    own_ids = [
        q["id"]
        for s in before["sections"]
        if s.get("brand") == "Own Brand"
        for q in s["questions"]
    ]
    assert "Own Brand_pt_q01" in own_ids

    after = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    assert any(s.get("id") == "product_preference" for s in after["sections"])


def test_build_product_test_snapshot_blind_placeholder():
    config = {"language": "en", "selected_attributes": ["Product Appearance"]}
    brand_context = {
        "brands": ["Own Brand"],
        "category": "Foam",
        "testing_protocol": "blind",
        "blind_codes": {"Own Brand": "SAMPLE-A"},
    }
    snapshot = build_product_test_snapshot(
        config, MOCK_BANK, [], "en", brand_context=brand_context,
    )
    before = next(p for p in snapshot["phases"] if p["timing"] == "before_use")
    text = before["sections"][0]["questions"][0]["text"]
    assert "SAMPLE-A" in text


def test_build_product_test_snapshot_includes_fixed_without_selection():
    snapshot = build_product_test_snapshot({}, MOCK_BANK, [], "en")
    all_ids = [q["id"] for p in snapshot["phases"] for s in p["sections"] for q in s["questions"]]
    assert "pt_q08" in all_ids
    assert "pt_q29" in all_ids
    assert "pt_q01" not in all_ids


def test_migrate_legacy_l2_to_product_test_snapshot():
    legacy = {
        "sections": [
            {
                "title": "Product Appearance",
                "module": "product_test",
                "questions": [
                    {
                        "id": "pt_q01",
                        "text": "Product Look",
                        "type": "scale",
                        "timing": "Before Use",
                        "options": [],
                        "required": True,
                    }
                ],
            },
            {
                "title": "Taste Test Brand A",
                "module": "taste_test",
                "questions": [{"id": "tt_q1", "text": "Like?"}],
            },
        ]
    }
    snapshot = migrate_legacy_l2_to_product_test_snapshot(legacy, "en")
    assert snapshot is not None
    assert snapshot["phases"][0]["timing"] == "before_use"
    assert snapshot["meta"]["totalQuestions"] == 1


def test_strip_product_test_from_l2():
    l2 = {
        "sections": [
            {"module": "product_test", "title": "PT"},
            {"module": "taste_test", "title": "TT"},
            {"module": "package_test", "title": "PKG"},
        ]
    }
    stripped = strip_product_test_from_l2(l2)
    assert len(stripped["sections"]) == 1
    assert stripped["sections"][0]["module"] == "taste_test"


def test_legacy_snapshot_expands_to_brand_loop_when_recomposed():
    """Phase 5: legacy single-pass snapshot → brand-expanded via re-compose."""
    legacy_config = {"language": "en", "selected_attributes": ["Product Appearance"]}
    brand_context = {
        "brands": ["Own Brand", "Competitor X"],
        "own_brand": "Own Brand",
        "category": "Foam",
        "testing_protocol": "branded",
        "blind_codes": {},
    }

    legacy = build_product_test_snapshot(legacy_config, MOCK_BANK, [], "en")
    assert legacy.get("brand_context") is None
    legacy_ids = [
        q["id"]
        for p in legacy["phases"]
        for s in p["sections"]
        for q in s["questions"]
    ]
    assert "pt_q01" in legacy_ids
    assert not any("_" in qid and qid.startswith("Own") for qid in legacy_ids)

    expanded = build_product_test_snapshot(
        legacy_config, MOCK_BANK, [], "en", brand_context=brand_context,
    )
    assert expanded["brand_context"]["brands"] == ["Own Brand", "Competitor X"]
    expanded_ids = [
        q["id"]
        for p in expanded["phases"]
        if p["timing"] == "before_use"
        for s in p["sections"]
        for q in s["questions"]
    ]
    assert "Own Brand_pt_q01" in expanded_ids
    assert "Competitor X_pt_q01" in expanded_ids
    assert len([s for s in expanded["phases"][0]["sections"] if s.get("brand")]) == 2
