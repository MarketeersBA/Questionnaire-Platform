from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, TYPE_CHECKING


if TYPE_CHECKING:
  from ..browser_capture import BrowserCaptureWorker
  from .capture_progress import ProgressCallback


from .artifact_store import (
  apply_capture_manifest_to_report,
  capture_manifest_metadata,
  cleanup_capture_artifacts,
  failed_capture_records,
)
from .capture_preflight import run_pre_capture_checks
from .capture_models import BrowserCaptureManifest, CaptureSessionContext, ChartCaptureRequest
from .capture_planning import build_capture_requests_from_report
from .capture_session import resolve_capture_session_for_batch
from .render_mode import PPTXRenderMode, resolve_render_mode


class HybridExportOrchestrator:
  """Coordinates report preparation, browser capture, and deck assembly inputs."""

  def __init__(
    self,
    output_root: Path,
    worker: Optional["BrowserCaptureWorker"] = None,
    render_mode: Optional[PPTXRenderMode] = None,
  ):
    from ..browser_capture import BrowserCaptureWorker
    self.output_root = Path(output_root)
    self.render_mode = render_mode or resolve_render_mode()
    self.worker = worker or BrowserCaptureWorker(output_root=self.output_root)

  def should_capture(self) -> bool:
    return self.render_mode == PPTXRenderMode.HYBRID

  def build_capture_requests(
    self,
    report_doc: Dict[str, Any],
    export_request: Optional[Dict[str, Any]] = None,
  ) -> List[ChartCaptureRequest]:
    return build_capture_requests_from_report(report_doc, export_request)

  def prepare_capture_artifacts(self, report_id: str) -> None:
    cleanup_capture_artifacts(self.output_root, report_id)

  def run_capture_batch(
    self,
    report_id: str,
    survey_id: str,
    requests: List[ChartCaptureRequest],
    session: Optional[CaptureSessionContext] = None,
    progress_callback: Optional["ProgressCallback"] = None,
    cancel_checker: Optional[Callable[[], bool]] = None,
    job_id: Optional[str] = None,
    *,
    skip_preflight: bool = False,
  ) -> BrowserCaptureManifest:
    resolution = resolve_capture_session_for_batch(
      survey_id=str(survey_id),
      report_id=report_id,
      job_id=job_id,
      session=session,
    )
    session = resolution.session

    if not skip_preflight:
      preflight = run_pre_capture_checks(
        str(survey_id),
        report_id=report_id,
        job_id=job_id,
      )
      if not preflight.ok:
        preflight.raise_if_failed()

    return self.worker.capture_batch(
      report_id=report_id,
      survey_id=str(survey_id),
      requests=requests,
      session=session,
      progress_callback=progress_callback,
      cancel_checker=cancel_checker,
      job_id=job_id,
    )

  def merge_capture_results(
    self,
    report_doc: Dict[str, Any],
    manifest: BrowserCaptureManifest,
  ) -> Dict[str, Any]:
    return apply_capture_manifest_to_report(report_doc, manifest)

  def manifest_for_storage(self, manifest: BrowserCaptureManifest) -> Dict[str, Any]:
    return capture_manifest_metadata(manifest)

  def capture_failures(self, manifest: BrowserCaptureManifest) -> List[Dict[str, Any]]:
    return failed_capture_records(manifest)

  def maybe_cleanup_after_export(self, report_id: str, *, export_succeeded: bool) -> None:
    if not export_succeeded:
      return
    cleanup_flag = os.environ.get("PPTX_CAPTURE_CLEANUP_ARTIFACTS", "false").strip().lower()
    if cleanup_flag in {"1", "true", "yes"}:
      cleanup_capture_artifacts(self.output_root, report_id)
