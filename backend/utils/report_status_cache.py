"""
Report status polling helpers — short TTL cache + server-driven poll intervals.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Optional, Tuple

from backend.utils.cache_utils import cache

STATUS_CACHE_TTL_SEC = 2


def status_fingerprint(payload: Dict[str, Any]) -> str:
    """Stable hash for cache keys and change detection."""
    core = {
        "status": payload.get("status"),
        "pptx_job_id": payload.get("pptx_job_id"),
        "pptx_status": payload.get("pptx_status"),
        "pptx_progress": payload.get("pptx_progress"),
        "pptx_stage": payload.get("pptx_stage"),
        "pptx_capture_completed": payload.get("pptx_capture_completed"),
        "pptx_capture_total": payload.get("pptx_capture_total"),
        "pptx_stage_detail": payload.get("pptx_stage_detail"),
        "pptx_stale": payload.get("pptx_stale"),
        "pptx_retryable": payload.get("pptx_retryable"),
        "pptx_last_update": payload.get("pptx_last_update"),
        "user_message": payload.get("user_message"),
        "error": payload.get("error"),
        "retry_count": payload.get("retry_count"),
    }
    raw = json.dumps(core, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def compute_poll_interval_seconds(
    report_status: Optional[str],
    pptx_status: Optional[str],
) -> float:
    """
    Server-advised poll interval (seconds).
    Active jobs poll faster; terminal states slow down (client should stop).
    """
    active_report = report_status in ("generating", "processing", "pending")
    active_pptx = pptx_status in ("PROCESSING", "QUEUED", "STARTING")

    if active_report or active_pptx:
        if pptx_status == "QUEUED":
            return 3.0
        if active_pptx and (pptx_status == "PROCESSING"):
            return 2.5
        return 3.0

    if report_status in ("ready", "failed") or pptx_status in ("READY", "FAILED"):
        return 30.0

    return 5.0


async def get_cached_status(
    survey_id: str,
    loader,
) -> Tuple[Dict[str, Any], bool]:
    """
    Return (payload, cache_hit).
    loader: async callable returning the status dict.
    """
    cache_key = f"report_status:v1:{survey_id}"
    cached = await cache.get(cache_key)
    if isinstance(cached, dict) and cached.get("_fp"):
        return cached["data"], True

    data = await loader()
    fp = status_fingerprint(data)
    await cache.set(
        cache_key,
        {"_fp": fp, "data": data},
        ttl=STATUS_CACHE_TTL_SEC,
    )
    return data, False


async def invalidate_status_cache(survey_id: str) -> None:
    await cache.delete(f"report_status:v1:{survey_id}")
