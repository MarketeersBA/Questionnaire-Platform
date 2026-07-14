"""
Structured logging for browser chart capture (Phase 5).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional

logger = logging.getLogger("pptx.capture")


@dataclass(frozen=True)
class CaptureRunContext:
    report_id: str
    survey_id: str
    job_id: Optional[str] = None

    def base_fields(
        self,
        *,
        chart_index: Optional[int] = None,
        chart_id: Optional[str] = None,
        chart_title: Optional[str] = None,
        attempt: Optional[int] = None,
        url: Optional[str] = None,
        duration_ms: Optional[int] = None,
        failure_kind: Optional[str] = None,
        selector: Optional[str] = None,
        ready_state: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        fields: Dict[str, Any] = {
            "report_id": self.report_id,
            "survey_id": self.survey_id,
        }
        if self.job_id:
            fields["job_id"] = self.job_id
        if chart_index is not None:
            fields["chart_index"] = chart_index
        if chart_id:
            fields["chart_id"] = chart_id
        if chart_title:
            fields["chart_title"] = chart_title
        if attempt is not None:
            fields["attempt"] = attempt
        if url:
            fields["url"] = url
        if duration_ms is not None:
            fields["duration_ms"] = duration_ms
        if failure_kind:
            fields["failure_kind"] = failure_kind
        if selector:
            fields["selector"] = selector
        if ready_state:
            fields["ready_state"] = ready_state
        if extra:
            fields.update(extra)
        return fields


def _format_fields(fields: Dict[str, Any]) -> str:
    return " ".join(f"{key}={value!r}" for key, value in fields.items())


def log_capture_info(ctx: CaptureRunContext, message: str, **kwargs: Any) -> None:
    fields = ctx.base_fields(**kwargs)
    logger.info("[BrowserCapture] %s | %s", message, _format_fields(fields))


def log_capture_warning(ctx: CaptureRunContext, message: str, **kwargs: Any) -> None:
    fields = ctx.base_fields(**kwargs)
    logger.warning("[BrowserCapture] %s | %s", message, _format_fields(fields))


def log_capture_error(ctx: CaptureRunContext, message: str, **kwargs: Any) -> None:
    fields = ctx.base_fields(**kwargs)
    logger.error("[BrowserCapture] %s | %s", message, _format_fields(fields))


def classify_failure_kind(exc: BaseException, *, selector: str = "") -> str:
    msg = str(exc).lower()
    if "navigation" in msg or "goto" in msg or "net::" in msg:
        return "navigation"
    if "frame_not_ready" in msg or selector.lower() in msg or "waiting for selector" in msg:
        return "selector"
    if "__export_ready__" in msg or "window_not_ready" in msg or "export_ready" in msg:
        return "ready_state"
    if "__export_error__" in msg or "export_error" in msg:
        return "export_error"
    if "screenshot" in msg:
        return "screenshot"
    return "unknown"
