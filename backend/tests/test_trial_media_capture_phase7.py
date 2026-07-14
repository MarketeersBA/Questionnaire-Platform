"""Phase 7 — trial media config persistence and submission reference contract."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from bson import ObjectId

from backend.models import ProductTestConfig, ProductTestTrialMediaCapture
from backend.services.product_test_media_lifecycle import extract_media_asset_ids_from_answers
from backend.trial_media_capture.snapshot import normalize_trial_media_capture


def test_normalize_trial_media_capture_defaults_disabled():
    normalized = normalize_trial_media_capture(None)
    assert normalized["enabled"] is False
    assert normalized["accepted_media"] == "image_or_video"
    assert normalized["max_video_duration_seconds"] == 60


def test_product_test_config_model_persists_trial_media_block():
    config = ProductTestConfig(
        created_by="analyst",
        version=1,
        language="en",
        trial_media_capture=ProductTestTrialMediaCapture(
            enabled=True,
            timing="during_use",
            required=True,
            prompt_en="Upload your trial photo",
        ),
    )
    dumped = config.model_dump()
    restored = ProductTestConfig.model_validate(dumped)
    assert restored.trial_media_capture.enabled is True
    assert restored.trial_media_capture.timing == "during_use"
    assert restored.trial_media_capture.prompt_en == "Upload your trial photo"


def test_orchestration_normalize_merges_trial_media_into_config():
    normalized = normalize_trial_media_capture({"enabled": True, "timing": "before_use"})
    assert normalized["enabled"] is True
    assert normalized["timing"] == "before_use"
    assert normalized["max_video_duration_seconds"] == 60


def test_submission_stores_asset_reference_not_binary():
    asset_ref = {
        "asset_id": str(ObjectId()),
        "media_type": "image",
        "mime": "image/jpeg",
        "filename": "trial.jpg",
        "size_bytes": 1200,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    answers = {
        "__structured": {
            "product_test": {
                "flat_evaluations": [
                    {
                        "question_id": "pt_trial_media_upload",
                        "module": "trial_media_capture",
                        "value_kind": "media_reference",
                        "value": asset_ref,
                    }
                ],
                "phases": [
                    {
                        "timing": "after_use",
                        "sections": [
                            {
                                "answers": {"pt_trial_media_upload": asset_ref},
                            }
                        ],
                    }
                ],
            }
        }
    }

    ids = extract_media_asset_ids_from_answers(answers)
    assert asset_ref["asset_id"] in ids

    flat_value = answers["__structured"]["product_test"]["flat_evaluations"][0]["value"]
    assert isinstance(flat_value, dict)
    assert "asset_id" in flat_value
    assert "bytes" not in flat_value
    assert not isinstance(flat_value.get("content"), (bytes, bytearray))

    serialized = str(answers)
    assert "asset_id" in serialized
    assert "base64" not in serialized.lower()
