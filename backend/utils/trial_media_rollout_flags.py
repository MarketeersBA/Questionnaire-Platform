"""
Phased rollout for product test trial media capture (Phase 7).

Rollout order:
  1. schema_only (default) — config + snapshot schema; analyst UI; no respondent upload
  2. respondent_upload     — public upload/stream endpoints + respondent UI enabled
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

STAGES: List[str] = [
    "schema_only",
    "respondent_upload",
]


def _env_stage() -> str:
    raw = os.getenv("TRIAL_MEDIA_ROLLOUT_STAGE", "schema_only").strip().lower()
    return raw if raw in STAGES else "schema_only"


def _stage_index(stage: str) -> int:
    try:
        return STAGES.index(stage)
    except ValueError:
        return STAGES.index("schema_only")


def is_at_least_trial_media_stage(min_stage: str) -> bool:
    return _stage_index(_env_stage()) >= _stage_index(min_stage)


def is_trial_media_schema_rollout_enabled() -> bool:
    """Stage 1+: config block, snapshot injection, analyst review/export."""
    return is_at_least_trial_media_stage("schema_only")


def is_trial_media_respondent_upload_enabled() -> bool:
    """Stage 2: public multipart upload + respondent preview UI."""
    return is_at_least_trial_media_stage("respondent_upload")


def get_trial_media_rollout_payload() -> Dict[str, Any]:
    stage = _env_stage()
    return {
        "trial_media_rollout_stage": stage,
        "trial_media_schema_enabled": is_trial_media_schema_rollout_enabled(),
        "trial_media_respondent_upload_enabled": is_trial_media_respondent_upload_enabled(),
        "rollout_order": STAGES,
        "default_survey_toggle": False,
    }


def assert_respondent_upload_rollout_enabled() -> None:
    from backend.services.product_test_media_asset_service import ProductTestMediaAssetError

    if not is_trial_media_respondent_upload_enabled():
        raise ProductTestMediaAssetError(
            "Trial media respondent upload is not enabled on this environment. "
            "Set TRIAL_MEDIA_ROLLOUT_STAGE=respondent_upload after backend validation.",
            status_code=503,
        )
