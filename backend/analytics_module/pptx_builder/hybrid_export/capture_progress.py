"""
Granular PPTX chart-capture progress (40–64% band) and progress events.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Dict, Optional

from .progress import PPTXExportStage, STAGE_PROGRESS

logger = logging.getLogger(__name__)

CAPTURE_PROGRESS_MIN = STAGE_PROGRESS[PPTXExportStage.CAPTURING_CHARTS]
CAPTURE_PROGRESS_MAX = STAGE_PROGRESS[PPTXExportStage.ASSEMBLING_DECK] - 1


class CaptureProgressPhase(str, Enum):
    BATCH_START = "batch_start"
    CHART_START = "chart_start"
    CHART_DONE = "chart_done"
    HEARTBEAT = "heartbeat"
    BATCH_COMPLETE = "batch_complete"


@dataclass(frozen=True)
class CaptureProgressEvent:
    phase: CaptureProgressPhase
    completed: int
    total: int
    chart_index: int
    chart_id: str
    chart_title: str
    chart_type: str = ""
    success: Optional[bool] = None
    error: Optional[str] = None

    @property
    def progress_percent(self) -> int:
        return compute_capture_progress(self.completed, self.total, self.phase)

    def stage_detail(self) -> str:
        total = max(self.total, 1)
        label = self.chart_title or self.chart_id or "chart"
        if self.phase == CaptureProgressPhase.BATCH_START:
            return f"Starting capture of {self.total} chart(s)"
        if self.phase == CaptureProgressPhase.CHART_START:
            return f"Capturing chart {self.chart_index + 1} of {total}: {label}"
        if self.phase == CaptureProgressPhase.CHART_DONE:
            status = "ok" if self.success else "failed"
            return f"Captured chart {self.completed} of {total}: {label} ({status})"
        if self.phase == CaptureProgressPhase.HEARTBEAT:
            return f"Still capturing chart {min(self.chart_index + 1, total)} of {total}: {label}"
        if self.phase == CaptureProgressPhase.BATCH_COMPLETE:
            return f"Finished capturing {self.completed} of {total} chart(s)"
        return f"Capture in progress ({self.completed}/{total})"

    def as_mongo_fields(self) -> Dict[str, Any]:
        return {
            "pptx_capture_total": self.total,
            "pptx_capture_completed": self.completed,
            "pptx_current_chart_id": self.chart_id or None,
            "pptx_current_chart_title": self.chart_title or None,
            "pptx_stage_detail": self.stage_detail(),
        }

    def heartbeat_copy(self) -> "CaptureProgressEvent":
        return CaptureProgressEvent(
            phase=CaptureProgressPhase.HEARTBEAT,
            completed=self.completed,
            total=self.total,
            chart_index=self.chart_index,
            chart_id=self.chart_id,
            chart_title=self.chart_title,
            chart_type=self.chart_type,
            success=self.success,
            error=self.error,
        )


ProgressCallback = Callable[[CaptureProgressEvent], None]


def compute_capture_progress(
    completed: int,
    total: int,
    phase: CaptureProgressPhase,
) -> int:
    """
    Map completed/total into the capture band (40% .. 64%).
    """
    if total <= 0:
        return CAPTURE_PROGRESS_MAX if phase == CaptureProgressPhase.BATCH_COMPLETE else CAPTURE_PROGRESS_MIN

    span = CAPTURE_PROGRESS_MAX - CAPTURE_PROGRESS_MIN
    if phase == CaptureProgressPhase.CHART_START:
        ratio = completed / total
    elif phase in (CaptureProgressPhase.CHART_DONE, CaptureProgressPhase.BATCH_COMPLETE):
        ratio = completed / total
    elif phase == CaptureProgressPhase.HEARTBEAT:
        ratio = max(completed, 0) / total
    else:
        ratio = 0.0

    return CAPTURE_PROGRESS_MIN + int(span * min(max(ratio, 0.0), 1.0))


class AsyncCaptureProgressBridge:
    """
    Thread-safe bridge: sync capture callbacks -> async Mongo status updates.
    Re-emits heartbeats every `heartbeat_interval_sec` while capture is active.
    """

    def __init__(
        self,
        loop: asyncio.AbstractEventLoop,
        apply_fn: Callable[[CaptureProgressEvent], Any],
        *,
        heartbeat_interval_sec: float = 10.0,
    ):
        self._loop = loop
        self._apply_fn = apply_fn
        self._heartbeat_interval = heartbeat_interval_sec
        self._queue: asyncio.Queue[Optional[CaptureProgressEvent]] = asyncio.Queue()
        self._last_event: Optional[CaptureProgressEvent] = None
        self._active = False

    def emit(self, event: CaptureProgressEvent) -> None:
        if not self._active:
            return
        self._loop.call_soon_threadsafe(self._queue.put_nowait, event)

    def start(self) -> None:
        self._active = True

    def stop(self) -> None:
        self._active = False
        self._loop.call_soon_threadsafe(self._queue.put_nowait, None)

    async def consume_until_done(self) -> None:
        self.start()
        try:
            while True:
                try:
                    event = await asyncio.wait_for(
                        self._queue.get(),
                        timeout=self._heartbeat_interval,
                    )
                except asyncio.TimeoutError:
                    if (
                        self._last_event
                        and self._last_event.phase
                        in (
                            CaptureProgressPhase.CHART_START,
                            CaptureProgressPhase.HEARTBEAT,
                        )
                    ):
                        hb = self._last_event.heartbeat_copy()
                        await self._apply_fn(hb)
                    continue

                if event is None:
                    break

                self._last_event = event
                await self._apply_fn(event)

                if event.phase == CaptureProgressPhase.BATCH_COMPLETE:
                    break
        finally:
            self._active = False
