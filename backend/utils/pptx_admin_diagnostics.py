"""
Admin / debug diagnostics for PPTX export queue and jobs (Phase 7).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId

from backend.utils.pptx_job_state import (
    DEFAULT_STALE_TTL_SECONDS,
    STAGE_STALE_TTL_SECONDS,
    STATUS_PROJECTION,
    is_pptx_job_stale,
    seconds_since,
    stale_ttl_for_stage,
)
from backend.utils.pptx_observability import pptx_metrics
from backend.workers.pptx_queue import (
    DEDUP_SET_KEY,
    LEASE_KEY_PREFIX,
    QUEUE_KEY,
    PptxJobQueue,
    SyncPptxJobQueue,
)

PPTX_QUEUE_ENABLED = os.getenv("PPTX_QUEUE_ENABLED", "true").lower() in (
    "1",
    "true",
    "yes",
)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


async def _redis_queue_stats() -> Dict[str, Any]:
    queue = PptxJobQueue()
    connected = await queue.connect()
    stats: Dict[str, Any] = {
        "redis_connected": connected,
        "queue_key": QUEUE_KEY,
        "dedup_key": DEDUP_SET_KEY,
        "queue_depth": 0,
        "dedup_count": 0,
        "active_leases": [],
    }
    if not connected or not queue._client:
        return stats

    client = queue._client
    stats["queue_depth"] = int(await client.llen(QUEUE_KEY))
    stats["dedup_count"] = int(await client.scard(DEDUP_SET_KEY))

    leases: List[Dict[str, Any]] = []
    async for key in client.scan_iter(match=f"{LEASE_KEY_PREFIX}*", count=50):
        job_id = key.replace(LEASE_KEY_PREFIX, "", 1)
        owner = await client.get(key)
        ttl = await client.ttl(key)
        leases.append({"job_id": job_id, "worker_id": owner, "ttl_seconds": ttl})
    stats["active_leases"] = leases[:50]
    await queue.close()
    return stats


def build_stale_thresholds_payload() -> Dict[str, Any]:
    return {
        "default_ttl_seconds": DEFAULT_STALE_TTL_SECONDS,
        "stage_ttl_seconds": dict(STAGE_STALE_TTL_SECONDS),
        "queued_ttl_seconds": int(os.getenv("PPTX_STALE_TTL_QUEUED_SEC", "600")),
    }


async def build_survey_pptx_diagnostics(
    db,
    survey_id: str,
    *,
    include_queue: bool = True,
) -> Dict[str, Any]:
    """Per-survey admin debug payload."""
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        STATUS_PROJECTION,
        sort=[("generated_at", -1)],
    )
    if not report:
        return {"survey_id": survey_id, "found": False}

    stale, stale_stage, idle = is_pptx_job_stale(report)
    stage = report.get("pptx_stage") or "preparing"
    job_id = report.get("pptx_job_id")

    lease_owner: Optional[str] = None
    lease_ttl: Optional[int] = None
    if job_id and include_queue:
        sync_q = SyncPptxJobQueue()
        if sync_q.connect() and sync_q._client:
            key = f"{LEASE_KEY_PREFIX}{job_id}"
            lease_owner = sync_q._client.get(key)
            lease_ttl = sync_q._client.ttl(key)

    error = report.get("pptx_error") or {}
    return {
        "found": True,
        "survey_id": survey_id,
        "report_id": str(report.get("_id")),
        "pptx_job_id": job_id,
        "pptx_status": report.get("pptx_status"),
        "pptx_stage": stage,
        "pptx_progress": report.get("pptx_progress"),
        "pptx_attempt": report.get("pptx_attempt"),
        "pptx_queue_status": report.get("pptx_queue_status"),
        "pptx_worker_id": report.get("pptx_worker_id"),
        "pptx_lease_expires_at": _iso(report.get("pptx_lease_expires_at")),
        "pptx_last_update": _iso(report.get("pptx_last_update")),
        "pptx_started_at": _iso(report.get("pptx_started_at")),
        "pptx_enqueued_at": _iso(report.get("pptx_enqueued_at")),
        "pptx_elapsed_seconds": report.get("pptx_elapsed_seconds"),
        "pptx_idle_seconds": report.get("pptx_idle_seconds"),
        "pptx_stale": bool(report.get("pptx_stale")),
        "pptx_stale_detected": stale,
        "pptx_stale_stage": stale_stage,
        "pptx_idle_seconds_computed": round(idle, 1) if idle is not None else None,
        "stale_threshold_seconds": stale_ttl_for_stage(stage),
        "latest_error_code": error.get("code") if isinstance(error, dict) else None,
        "latest_error_message": error.get("message") if isinstance(error, dict) else None,
        "latest_error_stage": error.get("stage") if isinstance(error, dict) else None,
        "pptx_retryable": report.get("pptx_retryable"),
        "pptx_cancel_requested": report.get("pptx_cancel_requested"),
        "pptx_capture_total": report.get("pptx_capture_total"),
        "pptx_capture_completed": report.get("pptx_capture_completed"),
        "pptx_current_chart_id": report.get("pptx_current_chart_id"),
        "pptx_stage_detail": report.get("pptx_stage_detail"),
        "pptx_contract_warnings": report.get("pptx_contract_warnings", []),
        "worker_lease": {
            "has_lease": bool(lease_owner),
            "owner": lease_owner,
            "ttl_seconds": lease_ttl,
        },
    }


async def build_global_pptx_diagnostics(db) -> Dict[str, Any]:
    """Platform-wide PPTX queue + active jobs snapshot for admins."""
    active_jobs: List[Dict[str, Any]] = []
    cursor = db.get_collection("survey_reports").find(
        {"pptx_status": {"$in": ["QUEUED", "PROCESSING"]}},
        STATUS_PROJECTION,
    ).limit(100)

    async for report in cursor:
        survey_id = str(report.get("survey_id") or "")
        stale, stage, idle = is_pptx_job_stale(report)
        active_jobs.append(
            {
                "survey_id": survey_id,
                "report_id": str(report.get("_id")),
                "pptx_job_id": report.get("pptx_job_id"),
                "pptx_status": report.get("pptx_status"),
                "pptx_stage": report.get("pptx_stage"),
                "pptx_progress": report.get("pptx_progress"),
                "pptx_worker_id": report.get("pptx_worker_id"),
                "stale": stale,
                "idle_seconds": round(idle, 1) if idle is not None else None,
                "error_code": (report.get("pptx_error") or {}).get("code"),
                "contract_warnings": report.get("pptx_contract_warnings", []),
            }
        )

    queue_stats = await _redis_queue_stats() if PPTX_QUEUE_ENABLED else {"enabled": False}

    return {
        "pptx_queue_enabled": PPTX_QUEUE_ENABLED,
        "stale_thresholds": build_stale_thresholds_payload(),
        "queue": queue_stats,
        "metrics": pptx_metrics.snapshot(),
        "active_jobs_count": len(active_jobs),
        "active_jobs": active_jobs,
    }


def extend_status_payload_for_admin(
    payload: Dict[str, Any],
    report: Dict[str, Any],
    *,
    lease_info: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Merge admin-only fields into a standard status response when requested."""
    stale, stale_stage, idle = is_pptx_job_stale(report)
    stage = report.get("pptx_stage") or "preparing"
    error = report.get("pptx_error") or {}

    payload["admin_debug"] = {
        "stale_threshold_seconds": stale_ttl_for_stage(stage),
        "stale_detected": stale,
        "stale_stage": stale_stage,
        "idle_seconds": round(idle, 1) if idle is not None else None,
        "pptx_worker_id": report.get("pptx_worker_id"),
        "pptx_lease_expires_at": _iso(report.get("pptx_lease_expires_at")),
        "pptx_queue_status": report.get("pptx_queue_status"),
        "latest_error_code": error.get("code") if isinstance(error, dict) else None,
        "pptx_contract_warnings": report.get("pptx_contract_warnings", []),
        "worker_lease": lease_info or {},
    }
    return payload
