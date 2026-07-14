from __future__ import annotations

from pathlib import Path

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.artifact_store import (
  apply_capture_manifest_to_report,
  cleanup_capture_artifacts,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
  BrowserCaptureManifest,
  ChartCaptureRecord,
)
from backend.analytics_module.pptx_builder.hybrid_export.orchestration import HybridExportOrchestrator
from backend.analytics_module.pptx_builder.hybrid_export.progress import PPTXExportStage, STAGE_PROGRESS
from backend.analytics_module.pptx_builder.hybrid_export.progress import (
  NATIVE_STAGE_PROGRESS,
  stage_progress_for_mode,
)
from backend.analytics_module.pptx_builder.hybrid_export.render_mode import PPTXRenderMode
from backend.tests.analytics.pptx_acceptance_contract import REPRESENTATIVE_SCREEN_CHARTS


def test_stage_progress_milestones_are_monotonic():
  ordered = [
    STAGE_PROGRESS[PPTXExportStage.PREPARING],
    STAGE_PROGRESS[PPTXExportStage.CAPTURING_CHARTS],
    STAGE_PROGRESS[PPTXExportStage.ASSEMBLING_DECK],
    STAGE_PROGRESS[PPTXExportStage.VALIDATING],
    STAGE_PROGRESS[PPTXExportStage.READY],
  ]
  assert ordered == sorted(ordered)
  assert ordered[-1] == 100


def test_stage_progress_for_native_mode_skips_capture_band():
  native = stage_progress_for_mode("native")
  assert native[PPTXExportStage.CAPTURING_CHARTS] == native[PPTXExportStage.PREPARING]
  assert native[PPTXExportStage.ASSEMBLING_DECK] > native[PPTXExportStage.PREPARING]
  assert native[PPTXExportStage.READY] == 100
  assert native == NATIVE_STAGE_PROGRESS


def test_apply_capture_manifest_to_report_sets_chart_paths(tmp_path: Path):
  report_doc = {
    "charts": [
      {"chart_id": "audience_affinity", "chart_type": "affinity_heatmap"},
      {"chart_id": "product_preference", "chart_type": "grouped_bar"},
    ]
  }
  image_path = tmp_path / "audience_affinity.png"
  image_path.write_bytes(b"png")
  manifest = BrowserCaptureManifest(
    report_id="report-1",
    survey_id="survey-1",
    artifact_root=str(tmp_path),
    captures=[
      ChartCaptureRecord(
        chart_id="audience_affinity",
        chart_type="affinity_heatmap",
        status="success",
        image_path=str(image_path),
        image_bytes=3,
        width=1747,
        height=720,
        viewport_url="http://frontend.test",
        theme="light",
        frame="chart_body",
        attempts=1,
        error=None,
        duration_ms=10,
      )
    ],
  )

  updated = apply_capture_manifest_to_report(report_doc, manifest)
  affinity = next(chart for chart in updated["charts"] if chart["chart_id"] == "audience_affinity")
  grouped = next(chart for chart in updated["charts"] if chart["chart_id"] == "product_preference")

  assert affinity["pptx_capture_path"] == str(image_path)
  assert affinity["pptx_capture_status"] == "success"
  assert "pptx_capture_path" not in grouped


def test_orchestrator_builds_capture_requests_from_planner_scope():
  orchestrator = HybridExportOrchestrator(
    output_root=Path("."),
    render_mode=PPTXRenderMode.HYBRID,
  )
  report_doc = {
    "metadata": {"title": "Pilot"},
    "insights": {
      "executive_summary": "Summary",
      "market_position_report": {"headline": "Position"},
    },
    "charts": REPRESENTATIVE_SCREEN_CHARTS,
  }
  requests = orchestrator.build_capture_requests(report_doc)
  assert requests
  assert orchestrator.should_capture() is True


def test_cleanup_capture_artifacts_removes_report_folder(tmp_path: Path):
  artifact_dir = tmp_path / "report-1" / "capture_artifacts"
  artifact_dir.mkdir(parents=True)
  (artifact_dir / "audience_affinity.png").write_bytes(b"png")

  cleanup_capture_artifacts(tmp_path, "report-1")

  assert not artifact_dir.exists()
