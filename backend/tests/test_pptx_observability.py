"""Phase 7 — PPTX observability and metrics."""
from backend.utils.pptx_observability import (
    JobTransitionContext,
    PptxMetricsRegistry,
    TRANSITION_COMPLETED,
    TRANSITION_ENQUEUED,
    TRANSITION_FAILED,
    TRANSITION_STALE_RECOVERED,
    log_job_transition,
    pptx_metrics,
)


def test_metrics_registry_counts_transitions():
    reg = PptxMetricsRegistry()
    reg.record_transition(TRANSITION_ENQUEUED, {"attempt": 1})
    reg.record_transition(TRANSITION_ENQUEUED, {"attempt": 2})
    reg.record_transition(TRANSITION_COMPLETED, {})
    reg.record_transition(TRANSITION_FAILED, {"error_code": "capture_timeout"})
    reg.record_transition(TRANSITION_STALE_RECOVERED, {})

    snap = reg.snapshot()
    assert snap["jobs_started"] == 2
    assert snap["retries"] == 1
    assert snap["jobs_completed"] == 1
    assert snap["jobs_failed_by_code"]["capture_timeout"] == 1
    assert snap["stale_recovered"] == 1


def test_record_capture_batch_averages():
    reg = PptxMetricsRegistry()
    reg.record_capture_batch(batch_duration_ms=120_000, chart_durations_ms=[1000, 2000, 3000])
    snap = reg.snapshot()
    assert snap["avg_capture_batch_duration_ms"] == 120_000
    assert snap["avg_chart_capture_duration_ms"] == 2000


def test_log_job_transition_does_not_raise():
    log_job_transition(
        TRANSITION_ENQUEUED,
        JobTransitionContext(
            job_id="job-1",
            survey_id="survey-1",
            report_id="report-1",
            stage="queued",
            progress=5,
            attempt=1,
            worker_id="worker-a",
        ),
    )


def test_global_metrics_singleton():
    pptx_metrics.record_transition(TRANSITION_FAILED, {"error_code": "test_code"})
    assert "test_code" in pptx_metrics.snapshot()["jobs_failed_by_code"]
