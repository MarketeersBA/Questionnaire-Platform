"""
Normalized PPTX export job state — stale recovery, status payloads, enqueue idempotency.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, Optional, Tuple

from bson import ObjectId

from backend.utils.report_status_cache import invalidate_status_cache
from backend.utils.pptx_rollout_flags import (
    get_rollout_flags_payload,
    is_capture_progress_enabled,
    is_stale_recovery_enabled,
)

logger = logging.getLogger(__name__)

# Terminal / active statuses
PPTX_STATUS_QUEUED = "QUEUED"
PPTX_STATUS_PROCESSING = "PROCESSING"
PPTX_STATUS_READY = "READY"
PPTX_STATUS_FAILED = "FAILED"
PPTX_STATUS_CANCELLED = "CANCELLED"

PPTX_QUEUE_QUEUED = "queued"
PPTX_QUEUE_RUNNING = "running"
PPTX_QUEUE_DONE = "done"

ERROR_CODE_WORKER_LOST = "worker_interrupted_or_stale"

ERROR_CODE_STALE = ERROR_CODE_WORKER_LOST
ERROR_CODE_VALIDATION = "validation_failed"
ERROR_CODE_ENGINE = "engine_error"
ERROR_CODE_CANCELLED = "cancelled"
ERROR_CODE_CAPTURE_TIMEOUT = "capture_timeout"
ERROR_CODE_EXPORT_TIMEOUT = "export_timeout"

# Stage-specific stale TTLs (seconds) — no heartbeat beyond these => FAILED
STAGE_STALE_TTL_SECONDS: Dict[str, int] = {
    "preparing": int(os.getenv("PPTX_STALE_TTL_PREPARING_SEC", "600")),
    "capturing_charts": int(os.getenv("PPTX_STALE_TTL_CAPTURE_SEC", "1800")),
    "assembling_deck": int(os.getenv("PPTX_STALE_TTL_ASSEMBLE_SEC", "1800")),
    "validating": int(os.getenv("PPTX_STALE_TTL_VALIDATE_SEC", "900")),
    "ready": int(os.getenv("PPTX_STALE_TTL_DEFAULT_SEC", "900")),
    "failed": int(os.getenv("PPTX_STALE_TTL_DEFAULT_SEC", "900")),
}
DEFAULT_STALE_TTL_SECONDS = int(os.getenv("PPTX_STALE_TTL_DEFAULT_SEC", "900"))

STATUS_PROJECTION = {
    "status": 1,
    "error_message": 1,
    "status_history": 1,
    "retry_count": 1,
    "pptx_job_id": 1,
    "pptx_status": 1,
    "pptx_stage": 1,
    "pptx_progress": 1,
    "pptx_last_update": 1,
    "pptx_started_at": 1,
    "pptx_finished_at": 1,
    "pptx_attempt": 1,
    "pptx_error": 1,
    "pptx_stale": 1,
    "pptx_retryable": 1,
    "pptx_cancel_requested": 1,
    "pptx_queue_status": 1,
    "pptx_enqueued_at": 1,
    "pptx_worker_id": 1,
    "pptx_lease_expires_at": 1,
    "pptx_capture_total": 1,
    "pptx_capture_completed": 1,
    "pptx_current_chart_id": 1,
    "pptx_current_chart_title": 1,
    "pptx_stage_detail": 1,
    "pptx_render_mode": 1,
    "pptx_rollout_stage": 1,
    "pptx_contract_warnings": 1,
}


class PptxEnqueueAction(str, Enum):
    START = "start"
    REJECT_ACTIVE = "reject_active"
    RECOVER_STALE_AND_START = "recover_stale_and_start"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    normalized = _as_utc(dt)
    return normalized.isoformat() if normalized else None


def stale_ttl_for_stage(stage: Optional[str]) -> int:
    if not stage:
        return DEFAULT_STALE_TTL_SECONDS
    return STAGE_STALE_TTL_SECONDS.get(stage, DEFAULT_STALE_TTL_SECONDS)


def seconds_since(dt: Optional[datetime]) -> Optional[float]:
    normalized = _as_utc(dt)
    if not normalized:
        return None
    return (_utc_now() - normalized).total_seconds()


def is_pptx_job_stale(report: Dict[str, Any]) -> Tuple[bool, Optional[str], Optional[float]]:
    """
    Return (is_stale, stage, idle_seconds).
    Only applies when pptx_status is PROCESSING.
    """
    status = report.get("pptx_status")
    if status == PPTX_STATUS_QUEUED:
        enqueued = report.get("pptx_enqueued_at")
        idle = seconds_since(enqueued)
        if idle is None:
            idle = DEFAULT_STALE_TTL_SECONDS + 1
        ttl = int(os.getenv("PPTX_STALE_TTL_QUEUED_SEC", "600"))
        if idle > ttl:
            return True, "queued", idle
        return False, "queued", idle

    if status != PPTX_STATUS_PROCESSING:
        return False, None, None

    last_update = report.get("pptx_last_update")
    idle = seconds_since(last_update)
    if idle is None:
        # Legacy rows without heartbeat — use started_at or treat as stale
        started = report.get("pptx_started_at") or report.get("generated_at")
        idle = seconds_since(started) if started else DEFAULT_STALE_TTL_SECONDS + 1

    stage = report.get("pptx_stage") or "preparing"
    ttl = stale_ttl_for_stage(stage)
    if idle > ttl:
        return True, stage, idle
    return False, stage, idle


def build_structured_error(
    *,
    code: str,
    message: str,
    stage: Optional[str] = None,
    retryable: bool = True,
    retry_guidance: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
        retry_guidance_for_code,
    )

    payload: Dict[str, Any] = {
        "code": code,
        "message": message,
        "stage": stage,
        "timestamp": _utc_now().isoformat(),
        "retryable": retryable,
        "retry_guidance": retry_guidance
        or retry_guidance_for_code(code, retryable),
    }
    if extra:
        payload.update(extra)
    return payload


def build_user_message(report: Dict[str, Any]) -> str:
    pptx_status = report.get("pptx_status")
    stage = report.get("pptx_stage") or ""
    progress = report.get("pptx_progress", 0)
    stale = report.get("pptx_stale", False)
    error = report.get("pptx_error") or {}

    if pptx_status == PPTX_STATUS_QUEUED:
        return "Your export is queued and will start shortly."

    if pptx_status == PPTX_STATUS_PROCESSING:
        if stale:
            return "Export appears stalled. The system will mark it interrupted shortly."
        if stage == "capturing_charts":
            detail = report.get("pptx_stage_detail")
            if detail:
                return f"{detail} ({progress}%)"
            completed = report.get("pptx_capture_completed")
            total = report.get("pptx_capture_total")
            if total:
                return (
                    f"Capturing chart images ({completed or 0}/{total}) — "
                    f"{progress}% complete. This step can take several minutes."
                )
            return f"Capturing chart images for your presentation ({progress}%). This step can take several minutes."
        if stage == "assembling_deck":
            return f"Assembling PowerPoint slides ({progress}%)."
        if stage == "validating":
            return f"Running export quality checks ({progress}%)."
        if stage == "preparing":
            return f"Preparing export data ({progress}%)."
        return f"Export in progress ({progress}%)."

    if pptx_status == PPTX_STATUS_READY:
        return "Your presentation is ready to download."

    if pptx_status == PPTX_STATUS_FAILED:
        code = error.get("code") if isinstance(error, dict) else None
        guidance = error.get("retry_guidance") if isinstance(error, dict) else None
        if code == ERROR_CODE_STALE:
            return (
                "Export was interrupted (server restart or timeout). "
                "Start a new export to continue."
            )
        if code in (ERROR_CODE_CAPTURE_TIMEOUT, ERROR_CODE_EXPORT_TIMEOUT):
            msg = error.get("message") if isinstance(error, dict) else None
            base = msg or "Export timed out."
            return f"{base} {guidance or 'Retry from the export dialog.'}".strip()
        msg = error.get("message") if isinstance(error, dict) else None
        if guidance:
            return f"{msg or 'Export failed.'} {guidance}"
        return msg or "PowerPoint export failed. You can retry from the export dialog."

    if pptx_status == PPTX_STATUS_CANCELLED:
        guidance = error.get("retry_guidance") if isinstance(error, dict) else None
        return guidance or "Export was cancelled. You can start a new export when ready."

    return "No active PowerPoint export. Start export when your report is ready."


def build_status_payload(survey_id: str, report: Dict[str, Any]) -> Dict[str, Any]:
    """API-facing status document for report + PPTX job."""
    last_update = report.get("pptx_last_update")
    started_at = report.get("pptx_started_at")
    elapsed = seconds_since(started_at) if report.get("pptx_status") == PPTX_STATUS_PROCESSING else None

    stale_flag, _, idle_sec = is_pptx_job_stale(report)
    # Reflect imminent stale in payload before DB write on next poll
    display_stale = bool(report.get("pptx_stale")) or (
        stale_flag if is_stale_recovery_enabled() else False
    )

    capture_fields: Dict[str, Any] = {}
    if is_capture_progress_enabled():
        capture_fields = {
            "pptx_capture_total": report.get("pptx_capture_total"),
            "pptx_capture_completed": report.get("pptx_capture_completed"),
            "pptx_current_chart_id": report.get("pptx_current_chart_id"),
            "pptx_current_chart_title": report.get("pptx_current_chart_title"),
            "pptx_stage_detail": report.get("pptx_stage_detail"),
        }

    return {
        "survey_id": survey_id,
        "status": report.get("status"),
        "pptx_job_id": report.get("pptx_job_id"),
        "pptx_status": report.get("pptx_status"),
        "pptx_progress": report.get("pptx_progress", 0),
        "pptx_stage": report.get("pptx_stage"),
        "pptx_last_update": _iso(last_update),
        "pptx_started_at": _iso(started_at),
        "pptx_finished_at": _iso(report.get("pptx_finished_at")),
        "pptx_elapsed_seconds": round(elapsed, 1) if elapsed is not None else None,
        "pptx_idle_seconds": round(idle_sec, 1) if idle_sec is not None else None,
        "pptx_attempt": report.get("pptx_attempt", 0),
        "pptx_stale": display_stale,
        "pptx_retryable": report.get("pptx_retryable", True),
        "pptx_cancel_requested": bool(report.get("pptx_cancel_requested", False)),
        "pptx_queue_status": report.get("pptx_queue_status"),
        "pptx_enqueued_at": _iso(report.get("pptx_enqueued_at")),
        "pptx_worker_id": report.get("pptx_worker_id"),
        "pptx_lease_expires_at": _iso(report.get("pptx_lease_expires_at")),
        **capture_fields,
        "pptx_error": report.get("pptx_error"),
        "pptx_render_mode": report.get("pptx_render_mode"),
        "pptx_rollout_stage": report.get("pptx_rollout_stage"),
        "pptx_contract_warnings": report.get("pptx_contract_warnings", []),
        "user_message": build_user_message({**report, "pptx_stale": display_stale}),
        "error": report.get("error_message"),
        "retry_count": report.get("retry_count", 0),
        "status_history": report.get("status_history", []),
        "pptx_rollout": get_rollout_flags_payload(),
    }


def evaluate_pptx_enqueue(
    report: Dict[str, Any],
    *,
    force_retry: bool = False,
) -> Tuple[PptxEnqueueAction, Optional[str]]:
    """
    Decide whether a new PPTX job may be enqueued.
    Returns (action, user-facing detail for rejections).
    """
    status = report.get("pptx_status")

    if status in (PPTX_STATUS_PROCESSING, PPTX_STATUS_QUEUED):
        stale, stage, idle = is_pptx_job_stale(report)
        if stale and is_stale_recovery_enabled():
            return (
                PptxEnqueueAction.RECOVER_STALE_AND_START,
                f"Recovered stale export at stage '{stage}' (idle {int(idle or 0)}s).",
            )
        if stale:
            return (
                PptxEnqueueAction.REJECT_ACTIVE,
                "Export appears stalled. Wait or use ?force_retry=true when stale recovery is enabled.",
            )
        if force_retry:
            return (
                PptxEnqueueAction.RECOVER_STALE_AND_START,
                "Force retry requested; replacing in-flight export.",
            )
        return (
            PptxEnqueueAction.REJECT_ACTIVE,
            "PowerPoint export is already in progress. Wait for completion or use ?force_retry=true.",
        )

    if status == PPTX_STATUS_FAILED:
        if force_retry or report.get("pptx_retryable", True):
            return PptxEnqueueAction.START, None
        return (
            PptxEnqueueAction.REJECT_ACTIVE,
            "Latest export failed and is not marked retryable.",
        )

    return PptxEnqueueAction.START, None


def begin_job_update_fields(
    report: Dict[str, Any],
    *,
    stage: str = "preparing",
    progress: int = 15,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Mongo $set fields when a worker begins executing (PROCESSING)."""
    now = _utc_now()
    attempt = int(report.get("pptx_attempt") or 1)
    job_id = report.get("pptx_job_id") or str(uuid.uuid4())

    fields: Dict[str, Any] = {
        "pptx_job_id": job_id,
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": stage,
        "pptx_progress": progress,
        "pptx_started_at": report.get("pptx_started_at") or now,
        "pptx_last_update": now,
        "pptx_finished_at": None,
        "pptx_attempt": attempt,
        "pptx_stale": False,
        "pptx_retryable": False,
        "pptx_cancel_requested": False,
        "pptx_queue_status": PPTX_QUEUE_RUNNING,
        "pptx_error": None,
        "pptx_enqueued_at": report.get("pptx_enqueued_at") or now,
    }
    if extra:
        fields.update(extra)
    return fields


def enqueue_job_update_fields(
    report: Dict[str, Any],
    *,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Mongo $set fields when a job is persisted and pushed to the Redis queue."""
    now = _utc_now()
    attempt = int(report.get("pptx_attempt") or 0) + 1
    job_id = str(uuid.uuid4())

    fields: Dict[str, Any] = {
        "pptx_job_id": job_id,
        "pptx_status": PPTX_STATUS_QUEUED,
        "pptx_stage": "queued",
        "pptx_progress": 5,
        "pptx_started_at": None,
        "pptx_last_update": now,
        "pptx_finished_at": None,
        "pptx_attempt": attempt,
        "pptx_stale": False,
        "pptx_retryable": False,
        "pptx_cancel_requested": False,
        "pptx_queue_status": PPTX_QUEUE_QUEUED,
        "pptx_enqueued_at": now,
        "pptx_worker_id": None,
        "pptx_lease_expires_at": None,
        "pptx_error": None,
    }
    if extra:
        fields.update(extra)
    return fields


def worker_lease_update_fields(
    worker_id: str,
    *,
    lease_seconds: int,
) -> Dict[str, Any]:
    """Attach worker lease metadata while a job is running."""
    now = _utc_now()
    expires = now + timedelta(seconds=lease_seconds)
    return {
        "pptx_worker_id": worker_id,
        "pptx_lease_expires_at": expires,
        "pptx_last_update": now,
        "pptx_queue_status": PPTX_QUEUE_RUNNING,
    }


def clear_worker_lease_fields() -> Dict[str, Any]:
    return {
        "pptx_worker_id": None,
        "pptx_lease_expires_at": None,
        "pptx_queue_status": PPTX_QUEUE_DONE,
    }


def touch_job_update_fields(
    *,
    status: str,
    progress: int,
    stage: Optional[str] = None,
    error: Optional[Any] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Mongo $set fields for an in-flight progress heartbeat."""
    fields: Dict[str, Any] = {
        "pptx_status": status,
        "pptx_progress": progress,
        "pptx_last_update": _utc_now(),
        "pptx_stale": False,
    }
    if stage is not None:
        fields["pptx_stage"] = stage
    if error is not None:
        fields["pptx_error"] = error
    if extra:
        fields.update(extra)
    return fields


def terminal_job_update_fields(
    *,
    status: str,
    progress: int,
    stage: str,
    error: Optional[Any] = None,
    retryable: bool = True,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Mongo $set fields when a job reaches READY / FAILED / CANCELLED."""
    now = _utc_now()
    fields: Dict[str, Any] = {
        "pptx_status": status,
        "pptx_progress": progress,
        "pptx_stage": stage,
        "pptx_last_update": now,
        "pptx_finished_at": now,
        "pptx_stale": False,
        "pptx_retryable": retryable,
        "pptx_cancel_requested": False,
    }
    if error is not None:
        fields["pptx_error"] = error
    elif status == PPTX_STATUS_READY:
        fields["pptx_error"] = None
    if extra:
        fields.update(extra)
    return fields


async def mark_job_failed_stale(
    db,
    report_id: str,
    survey_id: str,
    *,
    stage: Optional[str],
    progress: int,
    idle_seconds: Optional[float],
) -> Dict[str, Any]:
    """Persist FAILED for an interrupted/stale PROCESSING job."""
    existing = await db.get_collection("survey_reports").find_one(
        {"_id": ObjectId(report_id)},
        {"pptx_job_id": 1, "pptx_worker_id": 1, "pptx_attempt": 1},
    )
    error = build_structured_error(
        code=ERROR_CODE_STALE,
        message="Export was interrupted or timed out without progress updates.",
        stage=stage,
        retryable=True,
        extra={
            "idle_seconds": round(idle_seconds, 1) if idle_seconds is not None else None,
            "reason": "worker_interrupted_or_stale",
        },
    )
    update = terminal_job_update_fields(
        status=PPTX_STATUS_FAILED,
        progress=progress,
        stage=stage or "failed",
        error=error,
        retryable=True,
        extra={"pptx_stale": True},
    )
    await db.get_collection("survey_reports").update_one(
        {"_id": ObjectId(report_id)},
        {"$set": update},
    )
    await invalidate_status_cache(survey_id)
    from backend.utils.pptx_observability import (
        JobTransitionContext,
        TRANSITION_STALE_FAILED,
        log_job_transition,
    )

    log_job_transition(
        TRANSITION_STALE_FAILED,
        JobTransitionContext(
            job_id=(existing or {}).get("pptx_job_id"),
            survey_id=survey_id,
            report_id=report_id,
            stage=stage,
            progress=progress,
            attempt=int((existing or {}).get("pptx_attempt") or 1),
            worker_id=(existing or {}).get("pptx_worker_id"),
            error_code=ERROR_CODE_STALE,
            extra={"idle_seconds": idle_seconds},
        ),
    )
    return update


async def recover_stale_job_if_needed(
    db,
    survey_id: str,
    report: Dict[str, Any],
) -> Tuple[Dict[str, Any], bool]:
    """
    On status read: auto-fail stale PROCESSING jobs.
    Returns (possibly updated report doc fields, was_recovered).
    """
    if not is_stale_recovery_enabled():
        return report, False

    stale, stage, idle = is_pptx_job_stale(report)
    if not stale:
        return report, False

    report_id = str(report["_id"])
    progress = int(report.get("pptx_progress") or 0)
    await mark_job_failed_stale(
        db,
        report_id,
        survey_id,
        stage=stage,
        progress=progress,
        idle_seconds=idle,
    )
    refreshed = await db.get_collection("survey_reports").find_one(
        {"_id": ObjectId(report_id)},
        STATUS_PROJECTION,
    )
    return refreshed or report, True


async def apply_enqueue_recovery(
    db,
    survey_id: str,
    report: Dict[str, Any],
    *,
    reason: str,
) -> None:
    """Mark an active/stale PROCESSING job failed before starting a new one."""
    if not is_stale_recovery_enabled():
        return
    if report.get("pptx_status") not in (PPTX_STATUS_PROCESSING, PPTX_STATUS_QUEUED):
        return

    stale, stage, idle = is_pptx_job_stale(report)
    if not stale and report.get("pptx_status") == PPTX_STATUS_PROCESSING:
        stage = report.get("pptx_stage")
        idle = seconds_since(report.get("pptx_last_update"))

    await mark_job_failed_stale(
        db,
        str(report["_id"]),
        survey_id,
        stage=stage,
        progress=int(report.get("pptx_progress") or 0),
        idle_seconds=idle,
    )
    from backend.utils.pptx_observability import (
        JobTransitionContext,
        TRANSITION_STALE_RECOVERED,
        log_job_transition,
    )

    log_job_transition(
        TRANSITION_STALE_RECOVERED,
        JobTransitionContext(
            job_id=report.get("pptx_job_id"),
            survey_id=survey_id,
            report_id=str(report["_id"]),
            stage=report.get("pptx_stage"),
            progress=int(report.get("pptx_progress") or 0),
            attempt=int(report.get("pptx_attempt") or 1),
            extra={"reason": reason},
        ),
    )
    logger.info("[PPTX-Job] Enqueue recovery: %s | survey=%s", reason, survey_id)


async def is_cancel_requested(db, report_id: str) -> bool:
    doc = await db.get_collection("survey_reports").find_one(
        {"_id": ObjectId(report_id)},
        {"pptx_cancel_requested": 1},
    )
    return bool(doc and doc.get("pptx_cancel_requested"))


async def request_pptx_cancel(db, survey_id: str) -> Dict[str, Any]:
    """
    Set cooperative cancel flag for active PPTX jobs.
    Worker/generator observe pptx_cancel_requested between stages/charts.
    """
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)],
    )
    if not report:
        raise ValueError("Report not found")

    status = report.get("pptx_status")
    if status not in (PPTX_STATUS_QUEUED, PPTX_STATUS_PROCESSING):
        return {
            "accepted": False,
            "message": "No active export to cancel.",
            "pptx_status": status,
        }

    await db.get_collection("survey_reports").update_one(
        {"_id": report["_id"]},
        {
            "$set": {
                "pptx_cancel_requested": True,
                "pptx_last_update": _utc_now(),
                "pptx_stage_detail": "Cancellation requested — stopping export…",
            }
        },
    )
    await invalidate_status_cache(survey_id)
    return {
        "accepted": True,
        "message": "Cancellation requested. Export will stop at the next safe checkpoint.",
        "pptx_job_id": report.get("pptx_job_id"),
        "pptx_status": status,
    }


async def finalize_pptx_job_failure(
    db,
    report_id: str,
    survey_id: str,
    exc: BaseException,
    *,
    stage: Optional[str] = None,
    progress: Optional[int] = None,
    chart_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Terminal FAILED with classified error payload."""
    from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
        build_classified_error,
    )

    report = await db.get_collection("survey_reports").find_one(
        {"_id": ObjectId(report_id)},
        {"pptx_progress": 1, "pptx_stage": 1, "pptx_job_id": 1, "pptx_attempt": 1, "pptx_worker_id": 1},
    )
    prog = progress if progress is not None else int((report or {}).get("pptx_progress") or 0)
    st = stage or (report or {}).get("pptx_stage") or "failed"

    error = build_classified_error(exc, stage=st, chart_id=chart_id, extra=extra)
    update = terminal_job_update_fields(
        status=PPTX_STATUS_FAILED,
        progress=prog,
        stage=st if st != "ready" else "failed",
        error=error,
        retryable=bool(error.get("retryable", True)),
        extra={"pptx_queue_status": PPTX_QUEUE_DONE},
    )
    await db.get_collection("survey_reports").update_one(
        {"_id": ObjectId(report_id)},
        {"$set": update},
    )
    if survey_id:
        await invalidate_status_cache(survey_id)
    from backend.utils.pptx_observability import (
        JobTransitionContext,
        TRANSITION_FAILED,
        log_job_transition,
        pptx_metrics,
    )

    log_job_transition(
        TRANSITION_FAILED,
        JobTransitionContext(
            job_id=(report or {}).get("pptx_job_id"),
            survey_id=survey_id,
            report_id=report_id,
            stage=st,
            progress=prog,
            error_code=error.get("code"),
        ),
    )
    pptx_metrics.log_snapshot(context="job_failed")
    return update


async def finalize_pptx_job_cancelled(
    db,
    report_id: str,
    survey_id: str,
    *,
    stage: Optional[str] = None,
    message: str = "Export cancelled by user.",
) -> Dict[str, Any]:
    from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
        ERROR_CANCELLED,
        retry_guidance_for_code,
    )

    st = stage or "cancelled"
    error = build_structured_error(
        code=ERROR_CANCELLED,
        message=message,
        stage=st,
        retryable=True,
        retry_guidance=retry_guidance_for_code(ERROR_CANCELLED, True),
    )
    update = terminal_job_update_fields(
        status=PPTX_STATUS_CANCELLED,
        progress=0,
        stage=st,
        error=error,
        retryable=True,
        extra={"pptx_queue_status": PPTX_QUEUE_DONE},
    )
    await db.get_collection("survey_reports").update_one(
        {"_id": ObjectId(report_id)},
        {"$set": update},
    )
    if survey_id:
        await invalidate_status_cache(survey_id)
    from backend.utils.pptx_observability import (
        JobTransitionContext,
        TRANSITION_CANCELLED,
        log_job_transition,
    )

    log_job_transition(
        TRANSITION_CANCELLED,
        JobTransitionContext(
            survey_id=survey_id,
            report_id=report_id,
            stage=st,
            error_code=ERROR_CANCELLED,
        ),
    )
    return update
