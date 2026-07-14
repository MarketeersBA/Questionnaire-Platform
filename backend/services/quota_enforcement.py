"""Atomic survey quota reservation and release."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional, Tuple

from bson import ObjectId

GATE_ANSWER_MAP: Dict[str, Callable[[Dict[str, Any]], Any]] = {
    "age": lambda a: a.get("age_auto") or a.get("Age Range") or a.get("Age Range / الفئة العمرية"),
    "gender": lambda a: a.get("gender_auto") or a.get("Gender") or a.get("Gender / النوع"),
    "location": lambda a: a.get("area") or a.get("Location / Area / المحافظة أو المنطقة"),
    "education": lambda a: a.get("education") or a.get("Education Level / المستوى التعليمي"),
    "marital_status": lambda a: a.get("marital_status") or a.get("Marital Status / الحالة الاجتماعية"),
    "ses": lambda a: a.get("calculated_ses_class"),
}

GLOBAL_QUOTA_FULL_MESSAGE = (
    "شكراً لك! لقد اكتمل عدد المشاركين المطلوب في هذه الدراسة. "
    "Thank you! The required number of participants for this study has been reached."
)
BUCKET_QUOTA_FULL_MESSAGE = (
    "شكراً لك! لقد اكتمل العدد المطلوب من فئتك في هذه الدراسة. "
    "Thank you! The quota for your profile group has been reached."
)


@dataclass(frozen=True)
class QuotaBucket:
    gate_key: str
    matched_option: str
    track_key: str
    limit: int


@dataclass(frozen=True)
class QuotaReservationResult:
    ok: bool
    message: str = ""
    reserved_buckets: Tuple[str, ...] = ()
    reserved_global: bool = False


def resolve_respondent_target(survey: Dict[str, Any]) -> int:
    target = survey.get("respondent_target") or survey.get("sample_capacity") or 0
    try:
        return max(0, int(target))
    except (TypeError, ValueError):
        return 0


def resolve_quota_buckets(
    answers: Dict[str, Any],
    gate_quotas: Optional[Dict[str, Any]],
) -> List[QuotaBucket]:
    buckets: List[QuotaBucket] = []
    if not gate_quotas:
        return buckets

    for gate_key, gate_cfg in gate_quotas.items():
        if not gate_cfg:
            continue
        answer_extractor = GATE_ANSWER_MAP.get(gate_key)
        if not answer_extractor:
            continue

        respondent_val_raw = answer_extractor(answers)
        if not respondent_val_raw:
            continue

        norm_resp = str(respondent_val_raw).split("/")[0].strip().lower()
        matched_option = None
        for opt_key in gate_cfg:
            if norm_resp == str(opt_key).split("/")[0].strip().lower():
                matched_option = opt_key
                break

        if matched_option is None:
            continue

        bucket_cfg = gate_cfg[matched_option]
        quota_limit = bucket_cfg.get("count") if isinstance(bucket_cfg, dict) else None
        if quota_limit is None or quota_limit <= 0:
            continue

        buckets.append(
            QuotaBucket(
                gate_key=gate_key,
                matched_option=matched_option,
                track_key=f"{gate_key}_{matched_option}",
                limit=int(quota_limit),
            )
        )

    return buckets


async def _ensure_bucket_structure(surveys_col, survey_id: str, bucket: QuotaBucket) -> None:
    quota_track_root = f"quota_tracking.{bucket.track_key}"
    await surveys_col.update_one(
        {"_id": ObjectId(survey_id), quota_track_root: {"$exists": False}},
        {"$set": {quota_track_root: {"target": bucket.limit, "current": 0}}},
    )


async def _reserve_global_slot(surveys_col, survey_id: str, target: int) -> bool:
    result = await surveys_col.update_one(
        {"_id": ObjectId(survey_id), "respondent_count": {"$lt": target}},
        {"$inc": {"respondent_count": 1}},
    )
    return result.modified_count == 1


async def _reserve_bucket_slot(surveys_col, survey_id: str, bucket: QuotaBucket) -> bool:
    await _ensure_bucket_structure(surveys_col, survey_id, bucket)
    quota_track_root = f"quota_tracking.{bucket.track_key}.current"
    result = await surveys_col.update_one(
        {
            "_id": ObjectId(survey_id),
            quota_track_root: {"$lt": bucket.limit},
        },
        {"$inc": {f"quota_tracking.{bucket.track_key}.current": 1}},
    )
    return result.modified_count == 1


async def _release_global_slot(surveys_col, survey_id: str) -> None:
    await surveys_col.update_one(
        {"_id": ObjectId(survey_id), "respondent_count": {"$gt": 0}},
        {"$inc": {"respondent_count": -1}},
    )


async def _release_bucket_slot(surveys_col, survey_id: str, track_key: str) -> None:
    quota_track_root = f"quota_tracking.{track_key}.current"
    await surveys_col.update_one(
        {"_id": ObjectId(survey_id), quota_track_root: {"$gt": 0}},
        {"$inc": {f"quota_tracking.{track_key}.current": -1}},
    )


async def release_quota_reservation(
    surveys_col,
    survey_id: str,
    *,
    reserved_global: bool,
    reserved_buckets: List[str],
) -> None:
    for track_key in reversed(reserved_buckets):
        await _release_bucket_slot(surveys_col, survey_id, track_key)
    if reserved_global:
        await _release_global_slot(surveys_col, survey_id)


async def try_reserve_quota_slots(
    surveys_col,
    survey_id: str,
    *,
    global_target: int,
    buckets: List[QuotaBucket],
) -> QuotaReservationResult:
    reserved_buckets: List[str] = []
    reserved_global = False

    try:
        if global_target > 0:
            if not await _reserve_global_slot(surveys_col, survey_id, global_target):
                return QuotaReservationResult(ok=False, message=GLOBAL_QUOTA_FULL_MESSAGE)
            reserved_global = True

        for bucket in buckets:
            if not await _reserve_bucket_slot(surveys_col, survey_id, bucket):
                await release_quota_reservation(
                    surveys_col,
                    survey_id,
                    reserved_global=reserved_global,
                    reserved_buckets=reserved_buckets,
                )
                return QuotaReservationResult(ok=False, message=BUCKET_QUOTA_FULL_MESSAGE)
            reserved_buckets.append(bucket.track_key)

        return QuotaReservationResult(
            ok=True,
            reserved_buckets=tuple(reserved_buckets),
            reserved_global=reserved_global,
        )
    except Exception:
        await release_quota_reservation(
            surveys_col,
            survey_id,
            reserved_global=reserved_global,
            reserved_buckets=reserved_buckets,
        )
        raise


async def apply_legacy_submit_increments(
    surveys_col,
    survey_id: str,
    survey: Dict[str, Any],
    l1_answers: Dict[str, Any],
) -> None:
    """Increment quotas for submissions that passed Layer 1 before reservation existed."""
    await surveys_col.update_one(
        {"_id": ObjectId(survey_id)},
        {"$inc": {"respondent_count": 1}},
    )

    gate_quotas = survey.get("gate_quotas") or {}
    buckets = resolve_quota_buckets(l1_answers, gate_quotas)
    if not buckets:
        return

    increments: Dict[str, int] = {}
    for bucket in buckets:
        await _ensure_bucket_structure(surveys_col, survey_id, bucket)
        increments[f"quota_tracking.{bucket.track_key}.current"] = 1
        increments[f"gate_counts.{bucket.gate_key}.{bucket.matched_option}"] = 1

    await surveys_col.update_one({"_id": ObjectId(survey_id)}, {"$inc": increments})


async def release_token_quota_reservation(
    surveys_col,
    survey_id: str,
    token_doc: Dict[str, Any],
) -> None:
    if not token_doc.get("quota_reserved"):
        return

    await release_quota_reservation(
        surveys_col,
        survey_id,
        reserved_global=bool(token_doc.get("quota_reserved_global")),
        reserved_buckets=list(token_doc.get("quota_buckets") or []),
    )
