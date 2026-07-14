"""
Startup reconciliation for orphaned PPTX jobs (no active worker lease).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Tuple

from bson import ObjectId

from backend.utils.pptx_job_state import (
    PPTX_QUEUE_QUEUED,
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_QUEUED,
    STATUS_PROJECTION,
    enqueue_job_update_fields,
    is_pptx_job_stale,
    mark_job_failed_stale,
)
from backend.utils.report_status_cache import invalidate_status_cache
from backend.workers.pptx_queue import PptxJobQueue, PptxQueueJob, SyncPptxJobQueue

logger = logging.getLogger(__name__)

MAX_REQUEUE_ATTEMPTS = int(os.getenv("PPTX_MAX_REQUEUE_ATTEMPTS", "2"))


async def reconcile_orphaned_pptx_jobs(
    db,
    *,
    sync_queue: SyncPptxJobQueue,
    async_queue: PptxJobQueue,
) -> Dict[str, int]:
    """
    On worker/API startup:
    - QUEUED without lease -> re-push to Redis
    - PROCESSING without lease -> fail stale or requeue if under attempt budget
    """
    stats = {"requeued": 0, "failed": 0, "skipped": 0, "leased": 0}

    cursor = db.get_collection("survey_reports").find(
        {
            "$or": [
                {"pptx_status": {"$in": [PPTX_STATUS_QUEUED, PPTX_STATUS_PROCESSING]}},
                {"pptx_queue_status": {"$in": [PPTX_QUEUE_QUEUED, "running"]}},
            ]
        },
        STATUS_PROJECTION,
    )

    async for report in cursor:
        job_id = report.get("pptx_job_id")
        survey_id = str(report.get("survey_id") or "")
        report_id = str(report.get("_id") or "")
        if not job_id or not survey_id or not report_id:
            stats["skipped"] += 1
            continue

        if sync_queue.has_lease(job_id):
            stats["leased"] += 1
            continue

        status = report.get("pptx_status")
        attempt = int(report.get("pptx_attempt") or 1)

        if status == PPTX_STATUS_QUEUED:
            job = PptxQueueJob(
                job_id=job_id,
                report_id=report_id,
                survey_id=survey_id,
                attempt=attempt,
            )
            sync_queue.requeue(job)
            stats["requeued"] += 1
            logger.info(
                "[PPTX-Reconcile] Re-queued orphaned QUEUED job %s survey=%s",
                job_id,
                survey_id,
            )
            continue

        if status == PPTX_STATUS_PROCESSING:
            stale, stage, idle = is_pptx_job_stale(report)
            if stale:
                await mark_job_failed_stale(
                    db,
                    report_id,
                    survey_id,
                    stage=stage,
                    progress=int(report.get("pptx_progress") or 0),
                    idle_seconds=idle,
                )
                await async_queue.release_dedup(job_id)
                stats["failed"] += 1
                continue

            if attempt < MAX_REQUEUE_ATTEMPTS:
                fields = enqueue_job_update_fields(
                    report,
                    extra={
                        "pptx_render_mode": report.get("pptx_render_mode"),
                        "pptx_rollout_stage": report.get("pptx_rollout_stage"),
                    },
                )
                fields["pptx_job_id"] = job_id
                fields["pptx_attempt"] = attempt
                await db.get_collection("survey_reports").update_one(
                    {"_id": ObjectId(report_id)},
                    {"$set": fields},
                )
                job = PptxQueueJob(
                    job_id=job_id,
                    report_id=report_id,
                    survey_id=survey_id,
                    attempt=attempt,
                )
                sync_queue.requeue(job)
                await invalidate_status_cache(survey_id)
                stats["requeued"] += 1
                logger.warning(
                    "[PPTX-Reconcile] Re-queued interrupted PROCESSING job %s (attempt %s)",
                    job_id,
                    attempt,
                )
            else:
                await mark_job_failed_stale(
                    db,
                    report_id,
                    survey_id,
                    stage=report.get("pptx_stage"),
                    progress=int(report.get("pptx_progress") or 0),
                    idle_seconds=idle,
                )
                await async_queue.release_dedup(job_id)
                stats["failed"] += 1

    from backend.utils.pptx_observability import (
        TRANSITION_RECONCILE,
        log_job_transition,
        pptx_metrics,
    )

    log_job_transition(TRANSITION_RECONCILE, extra=stats)
    if stats.get("failed"):
        pptx_metrics.log_snapshot(context="reconcile")
    logger.info("[PPTX-Reconcile] Completed: %s", stats)
    return stats
