"""Tests for normalized PPTX job state and stale recovery."""
from datetime import datetime, timedelta, timezone

from backend.utils.pptx_job_state import (
    ERROR_CODE_STALE,
    PptxEnqueueAction,
    PPTX_STATUS_FAILED,
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_READY,
    begin_job_update_fields,
    build_status_payload,
    build_user_message,
    evaluate_pptx_enqueue,
    is_pptx_job_stale,
    stale_ttl_for_stage,
)


def _utc_now():
    return datetime.now(timezone.utc)


def test_stale_ttl_capturing_charts_is_longer():
    assert stale_ttl_for_stage("capturing_charts") >= stale_ttl_for_stage("preparing")


def test_job_stale_when_idle_exceeds_stage_ttl():
    ttl = stale_ttl_for_stage("capturing_charts")
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_last_update": _utc_now() - timedelta(seconds=ttl + 120),
    }
    stale, stage, idle = is_pptx_job_stale(report)
    assert stale is True
    assert stage == "capturing_charts"
    assert idle is not None and idle > ttl


def test_job_not_stale_when_recently_updated():
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_last_update": _utc_now() - timedelta(seconds=30),
    }
    stale, _, _ = is_pptx_job_stale(report)
    assert stale is False


def test_enqueue_rejects_active_healthy_job():
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "preparing",
        "pptx_last_update": _utc_now(),
    }
    action, detail = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.REJECT_ACTIVE
    assert detail


def test_enqueue_recovers_stale_processing_job():
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_last_update": _utc_now() - timedelta(hours=1),
    }
    action, _ = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.RECOVER_STALE_AND_START


def test_enqueue_allows_retry_after_failed():
    report = {
        "pptx_status": PPTX_STATUS_FAILED,
        "pptx_retryable": True,
        "pptx_error": {"code": ERROR_CODE_STALE},
    }
    action, _ = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.START


def test_begin_job_sets_normalized_fields():
    fields = begin_job_update_fields(
        {"pptx_attempt": 2, "pptx_job_id": "existing-job"},
        stage="preparing",
        progress=15,
    )
    assert fields["pptx_job_id"] == "existing-job"
    assert fields["pptx_status"] == PPTX_STATUS_PROCESSING
    assert fields["pptx_attempt"] == 2
    assert fields["pptx_queue_status"] == "running"
    assert fields["pptx_stale"] is False
    assert fields["pptx_retryable"] is False
    assert fields["pptx_started_at"] is not None


def test_status_payload_includes_user_message_and_timing():
    now = _utc_now()
    report = {
        "_id": "abc",
        "status": "ready",
        "pptx_job_id": "job-1",
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_progress": 40,
        "pptx_last_update": now - timedelta(seconds=10),
        "pptx_started_at": now - timedelta(seconds=60),
        "pptx_retryable": False,
        "pptx_stale": False,
    }
    payload = build_status_payload("survey-1", report)
    assert payload["survey_id"] == "survey-1"
    assert payload["pptx_job_id"] == "job-1"
    assert payload["pptx_elapsed_seconds"] is not None
    assert payload["user_message"]
    assert "Capturing chart" in payload["user_message"]


def test_user_message_for_stale_failure():
    report = {
        "pptx_status": PPTX_STATUS_FAILED,
        "pptx_error": {"code": ERROR_CODE_STALE, "message": "interrupted"},
    }
    msg = build_user_message(report)
    assert "interrupted" in msg.lower() or "retry" in msg.lower()


def test_user_message_for_ready():
    report = {"pptx_status": PPTX_STATUS_READY}
    assert "ready" in build_user_message(report).lower()
