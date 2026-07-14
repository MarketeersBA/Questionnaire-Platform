from __future__ import annotations



import json

import logging

import time

from contextlib import contextmanager

from pathlib import Path

from typing import Callable, Iterator, List, Optional, TYPE_CHECKING



if TYPE_CHECKING:

  from .hybrid_export.capture_progress import CaptureProgressEvent, ProgressCallback



from .hybrid_export.capture_browser_inject import build_playwright_storage_init_script
from .hybrid_export.pptx_failure import PptxExportCancelled, PptxExportTimeout

from urllib.parse import urlencode



from .hybrid_export.capture_config import BrowserCaptureConfig, resolve_capture_artifact_dir

from .hybrid_export.capture_defaults import (

  chart_body_capture_pixels,

  chart_body_viewport_pixels,

  slide_canvas_pixels,

)

from .hybrid_export.capture_diagnostics import (

  PageCaptureInstrumentation,

  failure_bundle_dir,

  write_minimal_diagnostic_bundle,

)

from .hybrid_export.capture_logging import (

  CaptureRunContext,

  classify_failure_kind,

  log_capture_error,

  log_capture_info,

  log_capture_warning,

)

from .hybrid_export.capture_models import (

  BrowserCaptureManifest,

  CaptureSessionContext,

  ChartCaptureRecord,

  ChartCaptureRequest,

)



logger = logging.getLogger(__name__)





class BrowserCaptureWorker:

  """Headless browser capture worker for hybrid PPTX chart images (sequential)."""



  def __init__(

    self,

    config: Optional[BrowserCaptureConfig] = None,

    output_root: Optional[Path] = None,

    browser_session_factory: Optional[Callable[[CaptureSessionContext], Iterator[object]]] = None,

  ):

    self.config = config or BrowserCaptureConfig.from_env()

    self.output_root = Path(output_root or Path("backend/reports"))

    self._browser_session_factory = browser_session_factory

    self._instrumentation: Optional[PageCaptureInstrumentation] = None



  def capture_batch(

    self,

    report_id: str,

    survey_id: str,

    requests: List[ChartCaptureRequest],

    session: Optional[CaptureSessionContext] = None,

    progress_callback: Optional["ProgressCallback"] = None,

    cancel_checker: Optional[Callable[[], bool]] = None,

    job_id: Optional[str] = None,

  ) -> BrowserCaptureManifest:

    artifact_dir = resolve_capture_artifact_dir(self.output_root, report_id)

    artifact_dir.mkdir(parents=True, exist_ok=True)

    session = session or CaptureSessionContext()

    ctx = CaptureRunContext(report_id=report_id, survey_id=survey_id, job_id=job_id)



    if not requests:

      return BrowserCaptureManifest(

        report_id=report_id,

        survey_id=survey_id,

        artifact_root=str(artifact_dir.resolve()),

        captures=[],

      )



    from .hybrid_export.capture_progress import CaptureProgressEvent, CaptureProgressPhase



    total = len(requests)

    log_capture_info(

      ctx,

      "capture_batch_start",

      extra={"total_charts": total, "artifact_root": str(artifact_dir)},

    )



    if progress_callback:

      progress_callback(

        CaptureProgressEvent(

          phase=CaptureProgressPhase.BATCH_START,

          completed=0,

          total=total,

          chart_index=0,

          chart_id="",

          chart_title="",

        )

      )



    batch_started = time.monotonic()

    batch_deadline = batch_started + self.config.batch_timeout_sec



    captures: List[ChartCaptureRecord] = []

    with self._open_page(session) as page:

      for index, request in enumerate(requests):

        if cancel_checker and cancel_checker():

          raise PptxExportCancelled(

            "Chart capture cancelled by user",

            stage="capturing_charts",

          )

        if time.monotonic() > batch_deadline:

          raise PptxExportTimeout(

            "capturing_charts",

            self.config.batch_timeout_sec,

            f"Capture batch exceeded {self.config.batch_timeout_sec}s",

          )



        chart_title = request.chart_title or request.chart_id

        if progress_callback:

          progress_callback(

            CaptureProgressEvent(

              phase=CaptureProgressPhase.CHART_START,

              completed=index,

              total=total,

              chart_index=index,

              chart_id=request.chart_id,

              chart_title=chart_title,

              chart_type=request.chart_type,

            )

          )



        chart_deadline = min(

          batch_deadline,

          time.monotonic() + self.config.per_chart_timeout_sec,

        )

        record = self._capture_chart_with_retry(

          page=page,

          artifact_dir=artifact_dir,

          survey_id=survey_id,

          request=request,

          deadline=chart_deadline,

          ctx=ctx,

          chart_index=index,

          chart_total=total,

        )

        captures.append(record)



        if progress_callback:

          progress_callback(

            CaptureProgressEvent(

              phase=CaptureProgressPhase.CHART_DONE,

              completed=index + 1,

              total=total,

              chart_index=index,

              chart_id=request.chart_id,

              chart_title=chart_title,

              chart_type=request.chart_type,

              success=record.status == "success",

              error=record.error,

            )

          )



    if progress_callback:

      success_count = sum(1 for c in captures if c.status == "success")

      progress_callback(

        CaptureProgressEvent(

          phase=CaptureProgressPhase.BATCH_COMPLETE,

          completed=success_count,

          total=total,

          chart_index=max(total - 1, 0),

          chart_id="",

          chart_title="",

        )

      )



    log_capture_info(

      ctx,

      "capture_batch_complete",

      extra={

        "success_count": sum(1 for c in captures if c.status == "success"),

        "failure_count": sum(1 for c in captures if c.status != "success"),

        "duration_ms": int((time.monotonic() - batch_started) * 1000),

      },

    )



    return BrowserCaptureManifest(

      report_id=report_id,

      survey_id=survey_id,

      artifact_root=str(artifact_dir.resolve()),

      captures=captures,

    )



  def build_export_frame_url(

    self,

    survey_id: str,

    request: ChartCaptureRequest,

  ) -> str:

    theme = request.theme or self.config.default_theme

    frame = request.frame or self.config.default_frame

    query = urlencode(

      {

        "chart_id": request.chart_id,

        "theme": theme,

        "frame": frame,

      }

    )

    return f"{self.config.frontend_base_url}/surveys/{survey_id}/export-frame?{query}"



  def resolve_viewport(self, frame: str) -> tuple[int, int]:

    if frame == "viewport":

      return slide_canvas_pixels()

    return chart_body_viewport_pixels()



  def resolve_capture_pixels(self, frame: str) -> tuple[int, int]:

    if frame == "viewport":

      return slide_canvas_pixels()

    return chart_body_capture_pixels()



  @contextmanager

  def _open_page(self, session: CaptureSessionContext):

    if self._browser_session_factory is not None:

      with self._browser_session_factory(session) as page:

        yield page

      return



    from playwright.sync_api import sync_playwright



    instrumentation = PageCaptureInstrumentation()

    self._instrumentation = instrumentation



    with sync_playwright() as playwright:

      browser = playwright.chromium.launch(headless=True)

      width, height = self.resolve_viewport(self.config.default_frame)

      context = browser.new_context(

        viewport={"width": width, "height": height},

        device_scale_factor=self.config.device_scale_factor,

        ignore_https_errors=True,

      )

      storage_entries = session.storage_entries()

      if storage_entries:

        context.add_init_script(build_playwright_storage_init_script(storage_entries))

      page = context.new_page()

      instrumentation.attach(page)

      try:

        yield page

      finally:

        page.close()

        context.close()

        browser.close()

        self._instrumentation = None



  def _capture_chart_with_retry(

    self,

    page,

    artifact_dir: Path,

    survey_id: str,

    request: ChartCaptureRequest,

    deadline: Optional[float],

    ctx: CaptureRunContext,

    chart_index: int,

    chart_total: int,

  ) -> ChartCaptureRecord:

    last_error: Optional[str] = None

    last_kind: Optional[str] = None

    last_diag_path: Optional[str] = None

    started = time.perf_counter()

    viewport_url = self.build_export_frame_url(survey_id, request)

    chart_title = request.chart_title or request.chart_id



    for attempt in range(1, self.config.max_attempts + 1):

      if deadline and time.monotonic() > deadline:

        raise PptxExportTimeout(

          "capturing_charts",

          self.config.per_chart_timeout_sec,

          f"Chart '{request.chart_id}' exceeded per-chart timeout",

        )

      try:

        return self._capture_chart_once(

          page=page,

          artifact_dir=artifact_dir,

          survey_id=survey_id,

          request=request,

          attempt=attempt,

          started=started,

          ctx=ctx,

          chart_index=chart_index,

          chart_total=chart_total,

          viewport_url=viewport_url,

        )

      except Exception as exc:

        last_error = str(exc)

        last_kind = classify_failure_kind(

          exc,

          selector=self.config.frame_ready_selector,

        )

        log_capture_warning(

          ctx,

          "chart_capture_attempt_failed",

          chart_index=chart_index,

          chart_id=request.chart_id,

          chart_title=chart_title,

          attempt=attempt,

          url=viewport_url,

          failure_kind=last_kind,

          selector=self.config.frame_ready_selector,

          extra={"error": last_error, "chart_total": chart_total},

        )

        bundle = failure_bundle_dir(artifact_dir, request.chart_id, attempt)

        if self._instrumentation:

          diag = self._instrumentation.save_failure_bundle(

            page,

            bundle,

            chart_id=request.chart_id,

            attempt=attempt,

            failure_kind=last_kind or "unknown",

            error_message=last_error or "capture_failed",

            viewport_url=viewport_url,

          )

          last_diag_path = diag.manifest_path

        else:

          last_diag_path = write_minimal_diagnostic_bundle(

            bundle,

            chart_id=request.chart_id,

            attempt=attempt,

            failure_kind=last_kind or "unknown",

            error_message=last_error or "capture_failed",

            viewport_url=viewport_url,

          )



    duration_ms = int((time.perf_counter() - started) * 1000)

    theme = request.theme or self.config.default_theme

    frame = request.frame or self.config.default_frame

    capture_width, capture_height = self.resolve_capture_pixels(frame)



    log_capture_error(

      ctx,

      "chart_capture_exhausted_retries",

      chart_index=chart_index,

      chart_id=request.chart_id,

      chart_title=chart_title,

      attempt=self.config.max_attempts,

      url=viewport_url,

      duration_ms=duration_ms,

      failure_kind=last_kind,

      extra={"error": last_error, "diagnostic_bundle": last_diag_path},

    )



    return ChartCaptureRecord(

      chart_id=request.chart_id,

      chart_type=request.chart_type,

      status="failed",

      image_path=None,

      image_bytes=None,

      width=capture_width,

      height=capture_height,

      viewport_url=viewport_url,

      theme=theme,

      frame=frame,

      attempts=self.config.max_attempts,

      error=last_error or "capture_failed",

      duration_ms=duration_ms,

      failure_kind=last_kind,

      diagnostic_bundle_path=last_diag_path,

    )



  def _capture_chart_once(

    self,

    page,

    artifact_dir: Path,

    survey_id: str,

    request: ChartCaptureRequest,

    attempt: int,

    started: float,

    ctx: CaptureRunContext,

    chart_index: int,

    chart_total: int,

    viewport_url: str,

  ) -> ChartCaptureRecord:

    theme = request.theme or self.config.default_theme

    frame = request.frame or self.config.default_frame

    viewport_width, viewport_height = self.resolve_viewport(frame)

    capture_width, capture_height = self.resolve_capture_pixels(frame)

    chart_title = request.chart_title or request.chart_id



    log_capture_info(

      ctx,

      "chart_capture_start",

      chart_index=chart_index,

      chart_id=request.chart_id,

      chart_title=chart_title,

      attempt=attempt,

      url=viewport_url,

      extra={"chart_total": chart_total},

    )



    chart_started = time.perf_counter()
    output_path = artifact_dir / f"{request.chart_id}.png"

    try:
      page.set_viewport_size({"width": viewport_width, "height": viewport_height})

      page.goto(viewport_url, wait_until="load", timeout=self.config.navigation_timeout_ms)

      page.wait_for_selector(

        self.config.frame_ready_selector,

        timeout=self.config.ready_timeout_ms,

      )

      page.wait_for_function(

        "() => window.__EXPORT_READY__ === true",

        timeout=self.config.ready_timeout_ms,

      )

      if self.config.ready_settle_ms > 0:

        page.wait_for_timeout(self.config.ready_settle_ms)



      export_error = page.evaluate("() => window.__EXPORT_ERROR__ || null")

      if export_error:

        raise RuntimeError(f"export_error: {export_error}")



      chart_root = page.locator(self.config.chart_root_selector)

      chart_root.wait_for(timeout=self.config.screenshot_timeout_ms)
      chart_root.screenshot(path=str(output_path), timeout=self.config.screenshot_timeout_ms)

    except Exception as exc:

      kind = classify_failure_kind(

        exc,

        selector=self.config.frame_ready_selector,

      )

      log_capture_error(

        ctx,

        "chart_capture_failed",

        chart_index=chart_index,

        chart_id=request.chart_id,

        chart_title=chart_title,

        attempt=attempt,

        url=viewport_url,

        duration_ms=int((time.perf_counter() - chart_started) * 1000),

        failure_kind=kind,

        selector=self.config.frame_ready_selector,

        ready_state="not_ready" if kind == "ready_state" else None,

        extra={"error": str(exc)},

      )

      raise



    image_bytes = output_path.stat().st_size if output_path.exists() else None

    duration_ms = int((time.perf_counter() - started) * 1000)



    log_capture_info(

      ctx,

      "chart_capture_success",

      chart_index=chart_index,

      chart_id=request.chart_id,

      chart_title=chart_title,

      attempt=attempt,

      url=viewport_url,

      duration_ms=duration_ms,

    )



    return ChartCaptureRecord(

      chart_id=request.chart_id,

      chart_type=request.chart_type,

      status="success",

      image_path=str(output_path.resolve()),

      image_bytes=image_bytes,

      width=capture_width,

      height=capture_height,

      viewport_url=viewport_url,

      theme=theme,

      frame=frame,

      attempts=attempt,

      error=None,

      duration_ms=duration_ms,

    )


