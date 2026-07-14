"""
API-facing PPTX enqueue service — Mongo intent first, then Redis queue.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId

from backend.utils.pptx_job_state import (
    PptxEnqueueAction,
    apply_enqueue_recovery,
    enqueue_job_update_fields,
    evaluate_pptx_enqueue,
)
from backend.utils.report_status_cache import invalidate_status_cache
from backend.workers.pptx_queue import PptxJobQueue, PptxQueueJob

logger = logging.getLogger(__name__)

from backend.utils.pptx_rollout_flags import is_pptx_queue_enabled

PPTX_QUEUE_ENABLED = is_pptx_queue_enabled()


async def enqueue_pptx_export(
    db,
    report: Dict[str, Any],
    survey_id: str,
    *,
    force_retry: bool = False,
    render_meta: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, Any], PptxEnqueueAction]:
    """
    Persist queued job state and push to Redis.
    Returns (response_payload, enqueue_action).
    Raises ValueError for rejections (map to HTTP 409 in router).
    """
    action, detail = evaluate_pptx_enqueue(report, force_retry=force_retry)

    if action == PptxEnqueueAction.REJECT_ACTIVE:
        raise ValueError(detail or "Export already in progress.")

    if action == PptxEnqueueAction.RECOVER_STALE_AND_START:
        await apply_enqueue_recovery(
            db,
            survey_id,
            report,
            reason=detail or "stale_or_forced_recovery",
        )
        report = await db.get_collection("survey_reports").find_one(
            {"_id": report["_id"]},
        ) or report

    extra = render_meta or {}
    job_fields = enqueue_job_update_fields(report, extra=extra)
    report_id = str(report["_id"])

    await db.get_collection("survey_reports").update_one(
        {"_id": ObjectId(report_id)},
        {"$set": job_fields},
    )

    queue_job = PptxQueueJob(
        job_id=job_fields["pptx_job_id"],
        report_id=report_id,
        survey_id=survey_id,
        attempt=job_fields["pptx_attempt"],
    )

    queue = PptxJobQueue()
    enqueued = await queue.enqueue(queue_job)
    await queue.close()

    if not enqueued:
        await db.get_collection("survey_reports").update_one(
            {"_id": ObjectId(report_id)},
            {
                "$set": {
                    "pptx_status": "FAILED",
                    "pptx_stage": "failed",
                    "pptx_error": {
                        "code": "queue_unavailable",
                        "message": "Export queue is unavailable. Try again shortly.",
                        "retryable": True,
                    },
                    "pptx_retryable": True,
                }
            },
        )
        raise RuntimeError("PPTX export queue unavailable (Redis).")

    await invalidate_status_cache(survey_id)

    payload = {
        "status": "queued",
        "message": "PPTX export queued for background worker.",
        "survey_id": survey_id,
        "pptx_job_id": job_fields["pptx_job_id"],
        "pptx_attempt": job_fields["pptx_attempt"],
        "pptx_queue_status": job_fields["pptx_queue_status"],
        "recovered_previous": action == PptxEnqueueAction.RECOVER_STALE_AND_START,
        "delivery": "redis_queue",
    }
    from backend.utils.pptx_observability import (
        JobTransitionContext,
        TRANSITION_ENQUEUED,
        TRANSITION_RETRY,
        log_job_transition,
    )

    transition = TRANSITION_RETRY if job_fields["pptx_attempt"] > 1 else TRANSITION_ENQUEUED
    log_job_transition(
        transition,
        JobTransitionContext(
            job_id=job_fields["pptx_job_id"],
            survey_id=survey_id,
            report_id=report_id,
            stage="queued",
            progress=job_fields.get("pptx_progress"),
            attempt=job_fields["pptx_attempt"],
            extra={
                "recovered_previous": action == PptxEnqueueAction.RECOVER_STALE_AND_START,
                "enqueue_action": action.value,
            },
        ),
    )
    return payload, action
