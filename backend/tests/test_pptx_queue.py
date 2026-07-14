"""Tests for PPTX durable queue and job state (Phase 2)."""
import json
from datetime import datetime, timedelta, timezone

from backend.utils.pptx_job_state import (
    PPTX_STATUS_QUEUED,
    PptxEnqueueAction,
    enqueue_job_update_fields,
    evaluate_pptx_enqueue,
    is_pptx_job_stale,
)
from backend.workers.pptx_queue import PptxQueueJob


def test_queue_job_roundtrip_json():
    job = PptxQueueJob(
        job_id="job-abc",
        report_id="report-1",
        survey_id="survey-1",
        attempt=2,
    )
    restored = PptxQueueJob.from_json(job.to_json())
    assert restored.job_id == job.job_id
    assert restored.report_id == job.report_id
    assert restored.attempt == 2


def test_enqueue_fields_use_queued_status():
    fields = enqueue_job_update_fields({"pptx_attempt": 0})
    assert fields["pptx_status"] == PPTX_STATUS_QUEUED
    assert fields["pptx_queue_status"] == "queued"
    assert fields["pptx_job_id"]
    assert fields["pptx_enqueued_at"] is not None


def test_enqueue_rejects_active_queued_job():
    now = datetime.now(timezone.utc)
    report = {
        "pptx_status": PPTX_STATUS_QUEUED,
        "pptx_stage": "queued",
        "pptx_enqueued_at": now,
    }
    action, _ = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.REJECT_ACTIVE


def test_stale_queued_job_can_recover():
    report = {
        "pptx_status": PPTX_STATUS_QUEUED,
        "pptx_stage": "queued",
        "pptx_enqueued_at": datetime.now(timezone.utc) - timedelta(hours=2),
    }
    stale, _, _ = is_pptx_job_stale(report)
    assert stale is True
    action, _ = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.RECOVER_STALE_AND_START
