"""
PPTX export failure taxonomy, exceptions, and classification (Phase 4).
"""
from __future__ import annotations

import asyncio
from typing import Any, Dict, Optional, Tuple

ERROR_CAPTURE_TIMEOUT = "capture_timeout"
ERROR_FRONTEND_NOT_READY = "frontend_not_ready"
ERROR_AUTH_MISSING = "auth_missing"
ERROR_AUTH_INVALID = "auth_invalid"
ERROR_CAPTURE_AUTH_DENIED = "capture_auth_denied"
ERROR_CAPTURE_AUTH_CONFIG = "capture_auth_config"
ERROR_WORKER_INTERRUPTED = "worker_interrupted_or_stale"
ERROR_VALIDATION_FAILED = "validation_failed"
ERROR_STORAGE_ERROR = "storage_error"
ERROR_ENGINE_ERROR = "engine_error"
ERROR_CANCELLED = "cancelled"
ERROR_EXPORT_TIMEOUT = "export_timeout"
ERROR_QUEUE_UNAVAILABLE = "queue_unavailable"


class PptxExportCancelled(Exception):
    """Cooperative cancel — user or API requested stop."""

    def __init__(self, message: str = "Export cancelled by user", stage: Optional[str] = None):
        super().__init__(message)
        self.stage = stage


class PptxExportTimeout(Exception):
    """Stage or job exceeded configured timeout."""

    def __init__(self, stage: str, timeout_seconds: int, message: Optional[str] = None):
        self.stage = stage
        self.timeout_seconds = timeout_seconds
        super().__init__(
            message
            or f"Export timed out during '{stage}' after {timeout_seconds}s",
        )


def retry_guidance_for_code(code: str, retryable: bool) -> str:
    if not retryable:
        return "Contact support if this keeps happening."
    if code == ERROR_CANCELLED:
        return "Start a new export when you are ready."
    if code in (ERROR_CAPTURE_TIMEOUT, ERROR_FRONTEND_NOT_READY, ERROR_EXPORT_TIMEOUT):
        return "Retry the export. If it fails again, refresh the report page and confirm the app is running."
    if code == ERROR_AUTH_MISSING:
        return (
            "Ensure SECRET_KEY is set on pptx-worker (server-minted capture tokens). "
            "For emergency debug only, set PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true and a valid JWT."
        )
    if code == ERROR_AUTH_INVALID:
        return (
            "Verify pptx-worker and API share the same SECRET_KEY, redeploy both services, "
            "then retry export."
        )
    if code == ERROR_CAPTURE_AUTH_DENIED:
        return (
            "Confirm capture auth (Phase 2) is deployed on the API and the worker can reach "
            "the report endpoint with an admin/analyst capture token."
        )
    if code == ERROR_CAPTURE_AUTH_CONFIG:
        return (
            "Set SECRET_KEY on pptx-worker and PPTX_EXPORT_FRONTEND_BASE_URL (or "
            "PPTX_CAPTURE_API_BASE_URL), then restart the worker."
        )
    if code == ERROR_WORKER_INTERRUPTED:
        return "Retry export. The previous run was interrupted by a restart or timeout."
    if code == ERROR_VALIDATION_FAILED:
        return "Review validation errors, fix report data issues, then retry export."
    if code == ERROR_STORAGE_ERROR:
        return "Check disk space and report output permissions, then retry."
    return "Retry export from the export dialog."


_AUTH_FAILURE_CODES = frozenset({
    ERROR_AUTH_MISSING,
    ERROR_AUTH_INVALID,
    ERROR_CAPTURE_AUTH_DENIED,
    ERROR_CAPTURE_AUTH_CONFIG,
})


def _preflight_primary_code(exc: BaseException) -> Optional[str]:
    """Map CaptureEnvironmentError (and similar) to export failure codes."""
    code = getattr(exc, "primary_code", None)
    if code in _AUTH_FAILURE_CODES:
        return str(code)
    issues = getattr(exc, "issues", None)
    if issues:
        first = issues[0]
        issue_code = getattr(first, "code", None)
        if issue_code in _AUTH_FAILURE_CODES:
            return str(issue_code)
    return None


def classify_pptx_failure(
    exc: BaseException,
    *,
    stage: Optional[str] = None,
    chart_id: Optional[str] = None,
) -> Tuple[str, str, bool, str]:
    """
    Return (code, message, retryable, retry_guidance).
    """
    if isinstance(exc, PptxExportCancelled):
        return (
            ERROR_CANCELLED,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_CANCELLED, True),
        )

    if isinstance(exc, PptxExportTimeout):
        st = exc.stage or stage or "unknown"
        return (
            ERROR_EXPORT_TIMEOUT if st != "capturing_charts" else ERROR_CAPTURE_TIMEOUT,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_CAPTURE_TIMEOUT, True),
        )

    if isinstance(exc, asyncio.TimeoutError):
        st = stage or "unknown"
        code = ERROR_CAPTURE_TIMEOUT if st == "capturing_charts" else ERROR_EXPORT_TIMEOUT
        return (
            code,
            f"Timed out during '{st}'.",
            True,
            retry_guidance_for_code(code, True),
        )

    msg = str(exc).lower()
    st = stage or "unknown"

    if "cancel" in msg and "requested" in msg:
        return ERROR_CANCELLED, str(exc), True, retry_guidance_for_code(ERROR_CANCELLED, True)

    if any(x in msg for x in ("timeout", "timed out", "time-out")):
        code = ERROR_CAPTURE_TIMEOUT if st == "capturing_charts" else ERROR_EXPORT_TIMEOUT
        detail = f"Chart '{chart_id}' timed out." if chart_id and st == "capturing_charts" else str(exc)
        return code, detail, True, retry_guidance_for_code(code, True)

    if any(
        x in msg
        for x in (
            "frame_not_ready",
            "__export_ready__",
            "export_ready",
            "waiting for selector",
            "window_not_ready",
        )
    ):
        return (
            ERROR_FRONTEND_NOT_READY,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_FRONTEND_NOT_READY, True),
        )

    preflight_code = _preflight_primary_code(exc)
    if preflight_code:
        return (
            preflight_code,
            str(exc),
            True,
            retry_guidance_for_code(preflight_code, True),
        )

    if any(x in msg for x in ("capture_auth_denied", "[capture_auth_denied]")):
        return (
            ERROR_CAPTURE_AUTH_DENIED,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_CAPTURE_AUTH_DENIED, True),
        )

    if any(x in msg for x in ("auth_invalid", "[auth_invalid]", "invalid capture token")):
        return (
            ERROR_AUTH_INVALID,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_AUTH_INVALID, True),
        )

    if "403" in msg or "forbidden" in msg:
        return (
            ERROR_CAPTURE_AUTH_DENIED,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_CAPTURE_AUTH_DENIED, True),
        )

    if any(x in msg for x in ("401", "unauthorized")):
        return (
            ERROR_AUTH_INVALID,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_AUTH_INVALID, True),
        )

    if any(
        x in msg
        for x in (
            "auth_missing",
            "[auth_missing]",
            "pptx_capture_auth_token",
            "could not validate credentials",
            "missing token",
            "login",
        )
    ):
        return (
            ERROR_AUTH_MISSING,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_AUTH_MISSING, True),
        )

    if any(x in msg for x in ("validation", "integrity", "forensic", "passes_gate")):
        return (
            ERROR_VALIDATION_FAILED,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_VALIDATION_FAILED, True),
        )

    if any(
        x in msg
        for x in (
            "no space",
            "disk",
            "permission denied",
            "read-only",
            "enospc",
            "file not found",
            "pptx_path",
        )
    ):
        return (
            ERROR_STORAGE_ERROR,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_STORAGE_ERROR, True),
        )

    if any(x in msg for x in ("stale", "interrupted", "worker")):
        return (
            ERROR_WORKER_INTERRUPTED,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_WORKER_INTERRUPTED, True),
        )

    if "engine" in msg or st == "assembling_deck":
        return (
            ERROR_ENGINE_ERROR,
            str(exc),
            True,
            retry_guidance_for_code(ERROR_ENGINE_ERROR, True),
        )

    return (
        ERROR_ENGINE_ERROR,
        str(exc),
        True,
        retry_guidance_for_code(ERROR_ENGINE_ERROR, True),
    )


def build_classified_error(
    exc: BaseException,
    *,
    stage: Optional[str] = None,
    chart_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    code, message, retryable, guidance = classify_pptx_failure(
        exc, stage=stage, chart_id=chart_id
    )
    payload: Dict[str, Any] = {
        "code": code,
        "message": message,
        "stage": stage,
        "retryable": retryable,
        "retry_guidance": guidance,
    }
    if chart_id:
        payload["chart_id"] = chart_id
    if extra:
        payload.update(extra)
    return payload
