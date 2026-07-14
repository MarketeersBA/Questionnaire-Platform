"""
Structured PPTX export observability — job transition logs and metrics-ready counters (Phase 7).
"""
from __future__ import annotations

import logging
import time
from collections import Counter, deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Any, Deque, Dict, List, Optional

logger = logging.getLogger("pptx.observability")

# Transition names (stable for log aggregation)
TRANSITION_ENQUEUED = "enqueued"
TRANSITION_DEQUEUED = "dequeued"
TRANSITION_STARTED = "started"
TRANSITION_STAGE = "stage"
TRANSITION_HEARTBEAT = "heartbeat"
TRANSITION_CAPTURE_COMPLETE = "capture_complete"
TRANSITION_COMPLETED = "completed"
TRANSITION_FAILED = "failed"
TRANSITION_CANCELLED = "cancelled"
TRANSITION_STALE_RECOVERED = "stale_recovered"
TRANSITION_STALE_FAILED = "stale_failed"
TRANSITION_RETRY = "retry"
TRANSITION_RECONCILE = "reconcile"

_MAX_DURATION_SAMPLES = 500


@dataclass
class JobTransitionContext:
    job_id: Optional[str] = None
    survey_id: Optional[str] = None
    report_id: Optional[str] = None
    stage: Optional[str] = None
    progress: Optional[int] = None
    attempt: Optional[int] = None
    duration_ms: Optional[int] = None
    worker_id: Optional[str] = None
    error_code: Optional[str] = None
    chart_id: Optional[str] = None
    extra: Optional[Dict[str, Any]] = None


def _format_log_line(payload: Dict[str, Any]) -> str:
    return " ".join(f"{key}={value!r}" for key, value in payload.items())


def log_job_transition(
    transition: str,
    ctx: Optional[JobTransitionContext] = None,
    **kwargs: Any,
) -> None:
    """
    Emit a structured log line for every job lifecycle transition.
    Fields align with Phase 7 requirements for grep/Loki/Datadog parsing.
    """
    base = ctx or JobTransitionContext()
    payload: Dict[str, Any] = {
        "event": "pptx_job_transition",
        "transition": transition,
    }
    for key, value in (
        ("job_id", kwargs.get("job_id", base.job_id)),
        ("survey_id", kwargs.get("survey_id", base.survey_id)),
        ("report_id", kwargs.get("report_id", base.report_id)),
        ("stage", kwargs.get("stage", base.stage)),
        ("progress", kwargs.get("progress", base.progress)),
        ("attempt", kwargs.get("attempt", base.attempt)),
        ("duration_ms", kwargs.get("duration_ms", base.duration_ms)),
        ("worker_id", kwargs.get("worker_id", base.worker_id)),
        ("error_code", kwargs.get("error_code", base.error_code)),
        ("chart_id", kwargs.get("chart_id", base.chart_id)),
    ):
        if value is not None:
            payload[key] = value

    extra = kwargs.get("extra") or base.extra
    if extra:
        for key, value in extra.items():
            if value is not None:
                payload[key] = value

    logger.info("[PPTX-Obs] %s", _format_log_line(payload))
    pptx_metrics.record_transition(transition, payload)


@dataclass
class PptxMetricsRegistry:
    """In-process counters — log snapshots for metrics scrapers until Prometheus wiring."""

    jobs_started: int = 0
    jobs_completed: int = 0
    jobs_cancelled: int = 0
    stale_recovered: int = 0
    retries: int = 0
    failed_by_code: Counter = field(default_factory=Counter)
    _capture_batch_ms: Deque[int] = field(default_factory=lambda: deque(maxlen=_MAX_DURATION_SAMPLES))
    _chart_capture_ms: Deque[int] = field(default_factory=lambda: deque(maxlen=_MAX_DURATION_SAMPLES))
    _lock: Lock = field(default_factory=Lock)

    def record_transition(self, transition: str, payload: Dict[str, Any]) -> None:
        with self._lock:
            if transition == TRANSITION_ENQUEUED:
                self.jobs_started += 1
                attempt = payload.get("attempt")
                if isinstance(attempt, int) and attempt > 1:
                    self.retries += 1
            elif transition == TRANSITION_RETRY:
                self.retries += 1
            elif transition == TRANSITION_COMPLETED:
                self.jobs_completed += 1
            elif transition == TRANSITION_FAILED:
                code = str(payload.get("error_code") or "unknown")
                self.failed_by_code[code] += 1
            elif transition == TRANSITION_CANCELLED:
                self.jobs_cancelled += 1
            elif transition == TRANSITION_STALE_RECOVERED:
                self.stale_recovered += 1
            elif transition == TRANSITION_STALE_FAILED:
                self.failed_by_code["worker_interrupted_or_stale"] += 1

    def record_capture_batch(
        self,
        *,
        batch_duration_ms: int,
        chart_durations_ms: List[int],
    ) -> None:
        with self._lock:
            if batch_duration_ms > 0:
                self._capture_batch_ms.append(batch_duration_ms)
            for ms in chart_durations_ms:
                if ms > 0:
                    self._chart_capture_ms.append(ms)

    @staticmethod
    def _avg(samples: Deque[int]) -> Optional[float]:
        if not samples:
            return None
        return round(sum(samples) / len(samples), 1)

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "jobs_started": self.jobs_started,
                "jobs_completed": self.jobs_completed,
                "jobs_cancelled": self.jobs_cancelled,
                "jobs_failed_total": sum(self.failed_by_code.values()),
                "jobs_failed_by_code": dict(self.failed_by_code),
                "stale_recovered": self.stale_recovered,
                "retries": self.retries,
                "avg_capture_batch_duration_ms": self._avg(self._capture_batch_ms),
                "avg_chart_capture_duration_ms": self._avg(self._chart_capture_ms),
                "capture_batch_samples": len(self._capture_batch_ms),
                "chart_capture_samples": len(self._chart_capture_ms),
            }

    def log_snapshot(self, context: str = "periodic") -> None:
        snap = self.snapshot()
        snap["event"] = "pptx_metrics_snapshot"
        snap["context"] = context
        logger.info("[PPTX-Metrics] %s", _format_log_line(snap))


pptx_metrics = PptxMetricsRegistry()


class JobTimer:
    """Context manager for duration_ms on terminal transitions."""

    def __init__(self) -> None:
        self._started = time.monotonic()

    @property
    def duration_ms(self) -> int:
        return int((time.monotonic() - self._started) * 1000)


def record_capture_manifest_metrics(
    manifest: Any,
    *,
    job_id: Optional[str] = None,
    survey_id: Optional[str] = None,
    report_id: Optional[str] = None,
    batch_duration_ms: Optional[int] = None,
) -> None:
    """Record per-chart and batch durations from a BrowserCaptureManifest."""
    chart_ms: List[int] = []
    total_ms = 0
    captures = getattr(manifest, "captures", None) or []
    for record in captures:
        ms = int(getattr(record, "duration_ms", 0) or 0)
        if ms > 0:
            chart_ms.append(ms)
            total_ms += ms

    batch_ms = batch_duration_ms if batch_duration_ms is not None else total_ms
    pptx_metrics.record_capture_batch(
        batch_duration_ms=batch_ms,
        chart_durations_ms=chart_ms,
    )

    log_job_transition(
        TRANSITION_CAPTURE_COMPLETE,
        JobTransitionContext(
            job_id=job_id,
            survey_id=survey_id,
            report_id=report_id,
            stage="capturing_charts",
            duration_ms=batch_ms,
            extra={
                "capture_success": getattr(manifest, "success_count", None),
                "capture_failure": getattr(manifest, "failure_count", None),
                "capture_total": len(captures),
                "avg_chart_duration_ms": pptx_metrics.snapshot().get(
                    "avg_chart_capture_duration_ms"
                ),
            },
        ),
    )
