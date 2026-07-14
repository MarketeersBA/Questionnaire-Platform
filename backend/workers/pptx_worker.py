"""
Dedicated PPTX export worker — consumes Redis queue with lease + heartbeats.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
from typing import Optional

from bson import ObjectId

from backend.analytics_module.pptx_builder.hybrid_export.progress import (
    PPTXExportStage,
    STAGE_PROGRESS,
)
from backend.analytics_module.pptx_builder.hybrid_export.render_mode import resolve_render_mode
from backend.analytics_module.pptx_builder.hybrid_export.rollout import resolve_rollout_stage
from backend.analytics_module.pptx_generator_v2 import PPTXGeneratorV2
from backend.database import db
from backend.utils.logging_utils import setup_logging
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    PptxExportCancelled,
)
from backend.utils.pptx_job_state import (
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_READY,
    STATUS_PROJECTION,
    begin_job_update_fields,
    clear_worker_lease_fields,
    is_cancel_requested,
    touch_job_update_fields,
    worker_lease_update_fields,
)
from backend.utils.report_status_cache import invalidate_status_cache
from backend.workers.pptx_queue import (
    DEFAULT_LEASE_SECONDS,
    LEASE_RENEW_SECONDS,
    PptxQueueJob,
    SyncPptxJobQueue,
    worker_id,
)
from backend.workers.pptx_reconciliation import reconcile_orphaned_pptx_jobs
from backend.workers.pptx_queue import PptxJobQueue
from backend.utils.pptx_observability import (
    JobTransitionContext,
    JobTimer,
    TRANSITION_COMPLETED,
    TRANSITION_DEQUEUED,
    TRANSITION_FAILED,
    TRANSITION_STARTED,
    log_job_transition,
    pptx_metrics,
)

logger = logging.getLogger(__name__)

HEARTBEAT_INTERVAL_SEC = int(os.getenv("PPTX_WORKER_HEARTBEAT_SEC", "30"))
DEQUEUE_TIMEOUT_SEC = int(os.getenv("PPTX_WORKER_DEQUEUE_TIMEOUT_SEC", "5"))


class PptxExportWorker:
    def __init__(self):
        self._queue = SyncPptxJobQueue()
        self._async_queue = PptxJobQueue()
        self._worker_id = worker_id()
        self._running = True

    async def startup(self) -> None:
        db.connect()
        if resolve_render_mode().value == "hybrid":
            from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
                validate_worker_capture_environment,
            )
            validate_worker_capture_environment()
        await reconcile_orphaned_pptx_jobs(
            db,
            sync_queue=self._queue,
            async_queue=self._async_queue,
        )

    async def _heartbeat_loop(
        self,
        job: PptxQueueJob,
        stop_event: asyncio.Event,
    ) -> None:
        while not stop_event.is_set():
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=HEARTBEAT_INTERVAL_SEC)
                break
            except asyncio.TimeoutError:
                pass

            if not self._queue.renew_lease(job.job_id, self._worker_id, LEASE_RENEW_SECONDS):
                logger.warning("[PPTX-Worker] Lost lease for job %s", job.job_id)
                break

            report = await db.get_collection("survey_reports").find_one(
                {"_id": ObjectId(job.report_id)},
                STATUS_PROJECTION,
            )
            if not report or report.get("pptx_status") != PPTX_STATUS_PROCESSING:
                continue

            touch = touch_job_update_fields(
                status=report.get("pptx_status"),
                progress=int(report.get("pptx_progress") or 0),
                stage=report.get("pptx_stage"),
                extra={
                    **worker_lease_update_fields(
                        self._worker_id,
                        lease_seconds=LEASE_RENEW_SECONDS,
                    ),
                    "pptx_capture_total": report.get("pptx_capture_total"),
                    "pptx_capture_completed": report.get("pptx_capture_completed"),
                    "pptx_current_chart_id": report.get("pptx_current_chart_id"),
                    "pptx_current_chart_title": report.get("pptx_current_chart_title"),
                    "pptx_stage_detail": report.get("pptx_stage_detail"),
                },
            )
            await db.get_collection("survey_reports").update_one(
                {"_id": ObjectId(job.report_id)},
                {"$set": touch},
            )
            await invalidate_status_cache(job.survey_id)

    async def _mark_running(self, job: PptxQueueJob) -> None:
        report = await db.get_collection("survey_reports").find_one(
            {"_id": ObjectId(job.report_id)},
        )
        if not report:
            raise ValueError(f"Report {job.report_id} not found")

        fields = begin_job_update_fields(
            report,
            stage=PPTXExportStage.PREPARING.value,
            progress=STAGE_PROGRESS[PPTXExportStage.PREPARING],
            extra={
                "pptx_render_mode": resolve_render_mode().value,
                "pptx_rollout_stage": resolve_rollout_stage().value,
                **worker_lease_update_fields(self._worker_id, lease_seconds=DEFAULT_LEASE_SECONDS),
            },
        )
        await db.get_collection("survey_reports").update_one(
            {"_id": ObjectId(job.report_id)},
            {"$set": fields},
        )
        await invalidate_status_cache(job.survey_id)

    async def _process_job(self, job: PptxQueueJob) -> None:
        if await is_cancel_requested(db, job.report_id):
            from backend.utils.pptx_job_state import finalize_pptx_job_cancelled

            await finalize_pptx_job_cancelled(
                db,
                job.report_id,
                job.survey_id,
                stage="queued",
            )
            await self._async_queue.release_dedup(job.job_id)
            return

        if not self._queue.acquire_lease(job.job_id, self._worker_id):
            logger.warning("[PPTX-Worker] Could not acquire lease for %s — re-queue", job.job_id)
            self._queue.requeue(job)
            return

        stop_hb = asyncio.Event()
        hb_task: Optional[asyncio.Task] = None
        timer = JobTimer()
        try:
            log_job_transition(
                TRANSITION_STARTED,
                JobTransitionContext(
                    job_id=job.job_id,
                    survey_id=job.survey_id,
                    report_id=job.report_id,
                    attempt=job.attempt,
                    worker_id=self._worker_id,
                    stage="preparing",
                ),
            )
            await self._mark_running(job)
            hb_task = asyncio.create_task(self._heartbeat_loop(job, stop_hb))

            if await is_cancel_requested(db, job.report_id):
                from backend.utils.pptx_job_state import finalize_pptx_job_cancelled

                await finalize_pptx_job_cancelled(
                    db,
                    job.report_id,
                    job.survey_id,
                    stage="preparing",
                )
                return

            generator = PPTXGeneratorV2(db)
            path = await generator.generate(job.report_id)
            terminal = await db.get_collection("survey_reports").find_one(
                {"_id": ObjectId(job.report_id)},
                {"pptx_status": 1, "pptx_stage": 1, "pptx_progress": 1},
            )
            if path and terminal and terminal.get("pptx_status") == "READY":
                log_job_transition(
                    TRANSITION_COMPLETED,
                    JobTransitionContext(
                        job_id=job.job_id,
                        survey_id=job.survey_id,
                        report_id=job.report_id,
                        stage=terminal.get("pptx_stage"),
                        progress=int(terminal.get("pptx_progress") or 100),
                        attempt=job.attempt,
                        duration_ms=timer.duration_ms,
                        worker_id=self._worker_id,
                    ),
                )
                pptx_metrics.log_snapshot(context="job_completed")
        except PptxExportCancelled:
            logger.info("[PPTX-Worker] Job %s cancelled", job.job_id)
        except Exception as exc:
            log_job_transition(
                TRANSITION_FAILED,
                JobTransitionContext(
                    job_id=job.job_id,
                    survey_id=job.survey_id,
                    report_id=job.report_id,
                    attempt=job.attempt,
                    duration_ms=timer.duration_ms,
                    worker_id=self._worker_id,
                    error_code=type(exc).__name__,
                    extra={"error": str(exc)},
                ),
            )
            logger.error(
                "[PPTX-Worker] Job %s failed: %s",
                job.job_id,
                exc,
                exc_info=True,
            )
        finally:
            stop_hb.set()
            if hb_task:
                hb_task.cancel()
                try:
                    await hb_task
                except asyncio.CancelledError:
                    pass

            terminal = await db.get_collection("survey_reports").find_one(
                {"_id": ObjectId(job.report_id)},
                {"pptx_status": 1},
            )
            lease_clear = clear_worker_lease_fields()
            if terminal and terminal.get("pptx_status") in (
                PPTX_STATUS_PROCESSING,
                "QUEUED",
            ):
                lease_clear["pptx_stage_detail"] = "Export ended without terminal status"
            await db.get_collection("survey_reports").update_one(
                {"_id": ObjectId(job.report_id)},
                {"$set": lease_clear},
            )
            self._queue.release_lease(job.job_id, self._worker_id)
            await self._async_queue.release_dedup(job.job_id)
            await invalidate_status_cache(job.survey_id)

    async def run_forever(self) -> None:
        await self.startup()
        logger.info("[PPTX-Worker] Started | id=%s", self._worker_id)

        while self._running:
            job = await asyncio.to_thread(
                self._queue.blocking_dequeue,
                DEQUEUE_TIMEOUT_SEC,
            )
            if not job:
                continue
            log_job_transition(
                TRANSITION_DEQUEUED,
                JobTransitionContext(
                    job_id=job.job_id,
                    survey_id=job.survey_id,
                    report_id=job.report_id,
                    attempt=job.attempt,
                    worker_id=self._worker_id,
                ),
            )
            await self._process_job(job)

    def stop(self) -> None:
        self._running = False


async def main() -> None:
    setup_logging()
    worker = PptxExportWorker()

    def _handle_signal(*_args):
        worker.stop()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handle_signal)
        except ValueError:
            pass

    try:
        await worker.run_forever()
    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())
