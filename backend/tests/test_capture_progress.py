"""Tests for granular PPTX capture progress (Phase 3)."""
from backend.analytics_module.pptx_builder.hybrid_export.capture_progress import (
    CaptureProgressEvent,
    CaptureProgressPhase,
    compute_capture_progress,
)
from backend.analytics_module.pptx_builder.hybrid_export.progress import (
    PPTXExportStage,
    STAGE_PROGRESS,
)


def test_capture_progress_at_start_is_40():
    assert compute_capture_progress(0, 20, CaptureProgressPhase.CHART_START) == 40


def test_capture_progress_scales_to_64_at_completion():
    progress = compute_capture_progress(20, 20, CaptureProgressPhase.BATCH_COMPLETE)
    assert progress == STAGE_PROGRESS[PPTXExportStage.ASSEMBLING_DECK] - 1


def test_capture_progress_mid_batch():
    mid = compute_capture_progress(10, 20, CaptureProgressPhase.CHART_DONE)
    assert 50 <= mid <= 55


def test_event_stage_detail_includes_chart_index():
    event = CaptureProgressEvent(
        phase=CaptureProgressPhase.CHART_START,
        completed=2,
        total=10,
        chart_index=2,
        chart_id="brand_awareness",
        chart_title="Brand Awareness",
        chart_type="bar",
    )
    assert "3 of 10" in event.stage_detail()
    assert "Brand Awareness" in event.stage_detail()


def test_event_mongo_fields():
    event = CaptureProgressEvent(
        phase=CaptureProgressPhase.CHART_DONE,
        completed=5,
        total=10,
        chart_index=4,
        chart_id="c1",
        chart_title="Chart One",
        success=True,
    )
    fields = event.as_mongo_fields()
    assert fields["pptx_capture_total"] == 10
    assert fields["pptx_capture_completed"] == 5
    assert fields["pptx_current_chart_id"] == "c1"
    assert fields["pptx_current_chart_title"] == "Chart One"
    assert fields["pptx_stage_detail"]
