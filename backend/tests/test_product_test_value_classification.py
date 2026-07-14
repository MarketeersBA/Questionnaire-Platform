"""Tests for product test value classification (Phase 5 media references)."""

from backend.services.product_test_value_classification import (
    classify_product_test_evaluation_value,
    is_product_test_media_reference,
    is_scalar_product_test_value_kind,
    resolve_row_value_kind,
)


def test_is_product_test_media_reference():
    ref = {
        "asset_id": "abc123",
        "media_type": "image",
        "mime": "image/jpeg",
        "size_bytes": 100,
    }
    assert is_product_test_media_reference(ref) is True
    assert classify_product_test_evaluation_value(ref, module="trial_media_capture") == "media_reference"


def test_scalar_numeric_classification():
    assert classify_product_test_evaluation_value(4, module="product_test") == "scalar_numeric"
    assert is_scalar_product_test_value_kind("scalar_numeric") is True


def test_media_excluded_from_scalar_kind():
    ref = {"asset_id": "x", "media_type": "video"}
    kind = classify_product_test_evaluation_value(ref, question_type="media-upload")
    assert kind == "media_reference"
    assert is_scalar_product_test_value_kind(kind) is False


def test_resolve_row_value_kind_prefers_stored():
    row = {"value_kind": "media_reference", "value": 4}
    assert resolve_row_value_kind(row) == "media_reference"
