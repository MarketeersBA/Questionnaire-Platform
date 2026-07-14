from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import pytest

from backend.analytics_module.pptx_builder.browser_capture import BrowserCaptureWorker
from backend.analytics_module.pptx_builder.hybrid_export.capture_config import BrowserCaptureConfig
from backend.analytics_module.pptx_builder.hybrid_export.capture_defaults import (
  chart_body_capture_pixels,
  chart_body_viewport_pixels,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
  CaptureSessionContext,
  ChartCaptureRequest,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_planning import (
  build_capture_requests_from_report,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_progress import (
  CaptureProgressPhase,
)
from backend.tests.analytics.pptx_acceptance_contract import REPRESENTATIVE_SCREEN_CHARTS


class FakeLocator:
  def __init__(self, page: "FakePage"):
    self._page = page

  def wait_for(self, timeout: int | None = None) -> None:
    return None

  def screenshot(self, path: str, timeout: int | None = None) -> None:
    Path(path).write_bytes(b"fake-png-bytes")


class FakePage:
  def __init__(self):
    self.urls: list[str] = []
    self.viewport: dict[str, int] | None = None
    self.export_ready = True
    self.export_error: str | None = None
    self.failures_before_success = 0
    self.attempts = 0

  def set_viewport_size(self, viewport: dict[str, int]) -> None:
    self.viewport = viewport

  def goto(self, url: str, wait_until: str, timeout: int) -> None:
    self.urls.append(url)
    self.attempts += 1
    if self.failures_before_success >= self.attempts:
      raise RuntimeError("navigation_failed")

  def wait_for_selector(self, selector: str, timeout: int) -> None:
    if not self.export_ready:
      raise RuntimeError("frame_not_ready")

  def wait_for_function(self, script: str, timeout: int) -> None:
    if not self.export_ready:
      raise RuntimeError("window_not_ready")

  def wait_for_timeout(self, timeout_ms: int) -> None:
    return None

  def evaluate(self, script: str):
    if script.startswith("() => window.__EXPORT_ERROR__"):
      return self.export_error
    return None

  def locator(self, selector: str) -> FakeLocator:
    return FakeLocator(self)

  def screenshot(self, path: str, full_page: bool = False) -> None:
    Path(path).write_bytes(b"diag-png")

  def content(self) -> str:
    return "<html><body>export frame stub</body></html>"


@contextmanager
def fake_browser_session(_session: CaptureSessionContext):
  page = FakePage()
  try:
    yield page
  finally:
    page.close = lambda: None  # type: ignore[method-assign]


@pytest.fixture
def capture_config(tmp_path: Path) -> BrowserCaptureConfig:
  return BrowserCaptureConfig(
    frontend_base_url="http://frontend.test",
    navigation_timeout_ms=1000,
    ready_timeout_ms=1000,
    screenshot_timeout_ms=1000,
    device_scale_factor=2.0,
    default_theme="light",
    default_frame="chart_body",
    max_attempts=2,
    ready_settle_ms=0,
    chart_root_selector='[data-export-chart-root="true"]',
    frame_ready_selector='[data-export-ready="true"]',
    per_chart_timeout_sec=90,
    batch_timeout_sec=600,
  )


def test_build_export_frame_url_includes_chart_identity(capture_config: BrowserCaptureConfig):
  worker = BrowserCaptureWorker(config=capture_config, output_root=Path("."))
  url = worker.build_export_frame_url(
    "survey-1",
    ChartCaptureRequest(chart_id="audience_affinity", chart_type="affinity_heatmap"),
  )
  assert url == (
    "http://frontend.test/surveys/survey-1/export-frame?"
    "chart_id=audience_affinity&theme=light&frame=chart_body"
  )


def test_resolve_viewport_matches_frontend_chart_body_frame():
  worker = BrowserCaptureWorker(
    config=BrowserCaptureConfig.from_env(),
    output_root=Path("."),
  )
  assert worker.resolve_viewport("chart_body") == chart_body_viewport_pixels()
  assert worker.resolve_capture_pixels("chart_body") == chart_body_capture_pixels()


def test_build_capture_requests_from_report_uses_phase0_candidates():
  report_doc = {
    "metadata": {"title": "Pilot"},
    "insights": {
      "executive_summary": "Summary",
      "market_position_report": {"headline": "Position"},
    },
    "charts": REPRESENTATIVE_SCREEN_CHARTS,
  }
  requests = build_capture_requests_from_report(report_doc)
  chart_ids = {item.chart_id for item in requests}
  assert "audience_affinity" in chart_ids
  assert "criteria_table" in chart_ids


def test_capture_batch_writes_png_and_manifest(capture_config: BrowserCaptureConfig, tmp_path: Path):
  worker = BrowserCaptureWorker(
    config=capture_config,
    output_root=tmp_path,
    browser_session_factory=fake_browser_session,
  )
  manifest = worker.capture_batch(
    report_id="report-1",
    survey_id="survey-1",
    requests=[
      ChartCaptureRequest(chart_id="audience_affinity", chart_type="affinity_heatmap"),
    ],
    session=CaptureSessionContext(auth_token="token-123", role="analyst"),
  )

  assert manifest.success_count == 1
  assert manifest.failure_count == 0
  record = manifest.captures[0]
  assert record.status == "success"
  assert record.image_path is not None
  assert Path(record.image_path).exists()
  assert record.attempts == 1
  payload = manifest.as_dict()
  assert payload["artifact_root"].endswith("capture_artifacts")
  assert payload["captures"][0]["viewport_url"].startswith("http://frontend.test/")


def test_capture_batch_retries_once_then_records_failure(capture_config: BrowserCaptureConfig, tmp_path: Path):
  @contextmanager
  def failing_session(_session: CaptureSessionContext):
    page = FakePage()
    page.failures_before_success = 2
    yield page

  worker = BrowserCaptureWorker(
    config=capture_config,
    output_root=tmp_path,
    browser_session_factory=failing_session,
  )
  manifest = worker.capture_batch(
    report_id="report-2",
    survey_id="survey-2",
    requests=[ChartCaptureRequest(chart_id="nps_recommend", chart_type="gauge")],
  )

  assert manifest.success_count == 0
  assert manifest.failure_count == 1
  record = manifest.captures[0]
  assert record.status == "failed"
  assert record.attempts == 2
  assert record.error == "navigation_failed"
  assert record.image_path is None
  assert record.failure_kind == "navigation"
  failures_dir = tmp_path / "report-2" / "capture_artifacts" / "failures" / "nps_recommend"
  assert failures_dir.exists() or record.diagnostic_bundle_path


def test_capture_batch_invokes_progress_callback(capture_config: BrowserCaptureConfig, tmp_path: Path):
  worker = BrowserCaptureWorker(
    config=capture_config,
    output_root=tmp_path,
    browser_session_factory=fake_browser_session,
  )
  events = []

  def _cb(event):
    events.append(event.phase)

  worker.capture_batch(
    report_id="report-3",
    survey_id="survey-3",
    requests=[
      ChartCaptureRequest(chart_id="chart_a", chart_type="bar", chart_title="Chart A"),
      ChartCaptureRequest(chart_id="chart_b", chart_type="line", chart_title="Chart B"),
    ],
    progress_callback=_cb,
  )

  assert events[0] == CaptureProgressPhase.BATCH_START
  assert CaptureProgressPhase.CHART_START in events
  assert CaptureProgressPhase.CHART_DONE in events
  assert events[-1] == CaptureProgressPhase.BATCH_COMPLETE
  assert events.count(CaptureProgressPhase.CHART_START) == 2
  assert events.count(CaptureProgressPhase.CHART_DONE) == 2
