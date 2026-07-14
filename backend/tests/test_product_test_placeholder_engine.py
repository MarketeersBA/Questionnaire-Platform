"""Tests for product test placeholder engine (Phase 1)."""

from backend.services.product_test_orchestration import (
    apply_product_test_placeholders,
    build_brand_scoped_question_id,
    build_product_test_brand_context,
    resolve_brand_display_name,
)


def test_resolve_brand_display_name_branded():
    assert resolve_brand_display_name("Own Brand", testing_protocol="branded") == "Own Brand"


def test_resolve_brand_display_name_blind():
    assert resolve_brand_display_name(
        "Own Brand",
        testing_protocol="blind",
        blind_codes={"Own Brand": "SAMPLE-A"},
    ) == "SAMPLE-A"


def test_build_brand_scoped_question_id():
    assert build_brand_scoped_question_id("Own Brand", "pt_q01") == "Own Brand_pt_q01"
    assert build_brand_scoped_question_id("Own Brand", "Own Brand_pt_q01") == "Own Brand_pt_q01"


def test_apply_product_test_placeholders_product_word():
    assert apply_product_test_placeholders(
        "Product Look",
        brand="Own Brand",
        testing_protocol="branded",
    ) == "Own Brand Look"


def test_apply_product_test_placeholders_blind_code():
    assert apply_product_test_placeholders(
        "Overall Product Evaluation",
        brand="Own Brand",
        testing_protocol="blind",
        blind_codes={"Own Brand": "SAMPLE-A"},
    ) == "Overall SAMPLE-A Evaluation"


def test_apply_product_test_placeholders_bracket_tokens():
    text = apply_product_test_placeholders(
        "[Brand] in [Category] — [Attribute]",
        brand="Own Brand",
        category="Foam",
        attribute="Appearance",
        testing_protocol="branded",
    )
    assert text == "Own Brand in Foam — Appearance"


def test_build_product_test_brand_context_dedupes():
    ctx = build_product_test_brand_context(
        brands=["A", "A", " B "],
        category=" Shampoo ",
        testing_protocol="branded",
    )
    assert ctx["brands"] == ["A", "B"]
    assert ctx["category"] == "Shampoo"
    assert ctx["testing_protocol"] == "branded"


def test_product_test_snapshot_model_with_brand_context():
    from backend.models import ProductTestSnapshot, ProductTestBrandContext

    snapshot = ProductTestSnapshot(
        brand_context=ProductTestBrandContext(
            brands=["Own Brand", "Competitor X"],
            own_brand="Own Brand",
            category="Foam",
            testing_protocol="blind",
            blind_codes={"Own Brand": "SAMPLE-A"},
        ),
        meta={"brandCount": 2, "questionsPerBrand": 5},
    )
    assert snapshot.brand_context is not None
    assert snapshot.brand_context.brands == ["Own Brand", "Competitor X"]
    assert snapshot.meta.brandCount == 2
