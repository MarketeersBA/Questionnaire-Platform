import pytest
from bson import ObjectId
from unittest.mock import AsyncMock

from backend.services.quota_enforcement import (
    QuotaBucket,
    resolve_quota_buckets,
    resolve_respondent_target,
    try_reserve_quota_slots,
)


def test_resolve_respondent_target_prefers_respondent_target():
    assert resolve_respondent_target({"respondent_target": 12, "sample_capacity": 10}) == 12


def test_resolve_respondent_target_falls_back_to_sample_capacity():
    assert resolve_respondent_target({"sample_capacity": 10}) == 10


def test_resolve_quota_buckets_matches_age_and_gender():
    gate_quotas = {
        "age": {
            "18-25": {"count": 3, "pct": 25},
            "26-35": {"count": 3, "pct": 25},
        },
        "gender": {
            "Male / ذكر": {"count": 5, "pct": 50},
            "Female / أنثى": {"count": 5, "pct": 50},
        },
    }
    answers = {
        "Age Range / الفئة العمرية": "18-25",
        "Gender / النوع": "Female / أنثى",
    }

    buckets = resolve_quota_buckets(answers, gate_quotas)

    assert buckets == [
        QuotaBucket("age", "18-25", "age_18-25", 3),
        QuotaBucket("gender", "Female / أنثى", "gender_Female / أنثى", 5),
    ]


@pytest.mark.asyncio
async def test_try_reserve_quota_slots_blocks_when_bucket_full():
    survey_id = str(ObjectId())
    survey_state = {
        "_id": survey_id,
        "respondent_count": 0,
        "quota_tracking": {
            "gender_Female / أنثى": {"target": 5, "current": 5},
        },
    }

    async def update_one(filter_doc, update_doc):
        if "$inc" in update_doc:
            for path, delta in update_doc["$inc"].items():
                if path == "respondent_count":
                    survey_state["respondent_count"] += delta
                elif path.startswith("quota_tracking."):
                    key = path.split(".")[1]
                    survey_state["quota_tracking"][key]["current"] += delta
        return type("Result", (), {"modified_count": 1})()

    surveys_col = AsyncMock()
    surveys_col.update_one.side_effect = update_one

    async def fake_reserve_bucket(surveys_col, survey_id, bucket):
        current = survey_state["quota_tracking"][bucket.track_key]["current"]
        if current >= bucket.limit:
            return False
        survey_state["quota_tracking"][bucket.track_key]["current"] += 1
        return True

    from backend.services import quota_enforcement

    original_reserve_bucket = quota_enforcement._reserve_bucket_slot
    quota_enforcement._reserve_bucket_slot = fake_reserve_bucket
    try:
        result = await try_reserve_quota_slots(
            surveys_col,
            survey_id,
            global_target=0,
            buckets=[QuotaBucket("gender", "Female / أنثى", "gender_Female / أنثى", 5)],
        )
    finally:
        quota_enforcement._reserve_bucket_slot = original_reserve_bucket

    assert result.ok is False
    assert survey_state["respondent_count"] == 0
