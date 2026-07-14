"""Unit tests for Product Test and Package Test models."""

import pytest
from pydantic import ValidationError
from backend.models import (
    ProductTestQuestion,
    PackageTestQuestion,
    ProductTestConfig,
    SurveyCreate,
    SurveyBase,
)

def test_product_test_question_valid():
    q = ProductTestQuestion(
        question_id="pt_q01",
        attribute="Product Look",
        attribute_type="sub",
        parent_attribute="Product Appearance",
        diagnostic_tag="PF",
        question_type="scale 1-5",
        ar_text="ما رأيك في شكل المنتج؟",
        en_text="What do you think of the product look?",
        timing="Before Use",
        question_status="optional",
        order=1
    )
    assert q.question_id == "pt_q01"
    assert q.diagnostic_tag == "PF"
    assert q.attribute_type == "sub"

def test_product_test_question_invalid_tag():
    # If standard validation on custom fields becomes stricter, we test constraints.
    # Currently diagnostic_tag is Optional[str], let's check it handles EM/PF/None
    q1 = ProductTestQuestion(
        question_id="pt_q02",
        attribute="Usage Comfort",
        attribute_type="sub",
        diagnostic_tag="EM",
        question_type="scale 1-5",
        ar_text="ar",
        en_text="en",
        timing="During Use",
        question_status="fixed",
        order=2
    )
    assert q1.diagnostic_tag == "EM"

    q2 = ProductTestQuestion(
        question_id="pt_q03",
        attribute="Messiness",
        attribute_type="sub",
        diagnostic_tag=None,
        question_type="scale 1-5",
        ar_text="ar",
        en_text="en",
        timing="During Use",
        question_status="optional",
        order=3
    )
    assert q2.diagnostic_tag is None

def test_package_test_question_valid():
    q = PackageTestQuestion(
        question_id="pk_q01",
        attribute="Pack Shape",
        attribute_type="sub",
        parent_attribute="Pack & Presentation",
        question_type="scale 1-5",
        ar_text="شكل العبوة من بره",
        en_text="Outer pack shape",
        timing="Before Use",
        question_status="optional",
        order=1
    )
    assert q.question_id == "pk_q01"
    assert q.attribute_type == "sub"

def test_product_test_config_valid():
    config = ProductTestConfig(
        created_by="analyst",
        version=1,
        language="ar",
        selected_attributes=["Product Color", "Usage Comfort"],
        fixed_questions=["pt_q01", "pt_q02"],
        optional_questions=["pt_q03"],
        package_test_enabled=True,
        package_test_attributes=["Pack Shape", "Pack Color"],
        status="draft"
    )
    assert config.version == 1
    assert config.package_test_enabled is True
    assert "Product Color" in config.selected_attributes
    assert config.trial_media_capture.enabled is False
    assert config.trial_media_capture.accepted_media == "image_or_video"
    assert config.trial_media_capture.max_video_duration_seconds == 60


def test_product_test_trial_media_capture_enabled():
    from backend.models import ProductTestTrialMediaCapture

    capture = ProductTestTrialMediaCapture(
        enabled=True,
        accepted_media="video",
        required=True,
        timing="during_use",
        max_video_duration_seconds=45,
    )
    config = ProductTestConfig(
        created_by="analyst",
        version=1,
        language="en",
        trial_media_capture=capture,
    )
    assert config.trial_media_capture.enabled is True
    assert config.trial_media_capture.timing == "during_use"
    assert config.trial_media_capture.max_video_duration_seconds == 45
