"""
Phase 8 — backend unit tests: stale detection, enqueue idempotency, retry,
failure classification, cache invalidation, rollout flags.
"""
from datetime import datetime, timedelta, timezone

import pytest

from backend.utils.pptx_job_state import (
    PptxEnqueueAction,
    PPTX_STATUS_FAILED,
    PPTX_STATUS_PROCESSING,
    PPTX_STATUS_QUEUED,
    build_status_payload,
    evaluate_pptx_enqueue,
    is_pptx_job_stale,
    recover_stale_job_if_needed,
)
from backend.utils.pptx_rollout_flags import (
    get_rollout_flags_payload,
    is_capture_progress_enabled,
    is_pptx_queue_enabled,
    is_stale_recovery_enabled,
)
from backend.utils.report_status_cache import (
    invalidate_status_cache,
    status_fingerprint,
)
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    ERROR_CAPTURE_TIMEOUT,
    classify_pptx_failure,
)
from backend.utils import pptx_rollout_flags


def _utc_now():
    return datetime.now(timezone.utc)


# --- Rollout flags ---


def test_rollout_flags_payload_shape():
    payload = get_rollout_flags_payload()
    assert "pptx_queue_enabled" in payload
    assert "pptx_stale_recovery_enabled" in payload
    assert "pptx_capture_progress_enabled" in payload


def test_stale_recovery_disabled_rejects_stale_enqueue(monkeypatch):
    monkeypatch.setattr(
        "backend.utils.pptx_job_state.is_stale_recovery_enabled",
        lambda: False,
    )
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_last_update": _utc_now() - timedelta(hours=2),
    }
    action, detail = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.REJECT_ACTIVE
    assert detail


def test_force_retry_overrides_active_job():
    report = {
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "preparing",
        "pptx_last_update": _utc_now(),
    }
    action, _ = evaluate_pptx_enqueue(report, force_retry=True)
    assert action == PptxEnqueueAction.RECOVER_STALE_AND_START


def test_failed_non_retryable_rejected():
    report = {
        "pptx_status": PPTX_STATUS_FAILED,
        "pptx_retryable": False,
    }
    action, detail = evaluate_pptx_enqueue(report)
    assert action == PptxEnqueueAction.REJECT_ACTIVE
    assert detail


def test_capture_progress_disabled_omits_granular_fields(monkeypatch):
    monkeypatch.setattr(
        "backend.utils.pptx_job_state.is_capture_progress_enabled",
        lambda: False,
    )
    report = {
        "_id": "r1",
        "status": "ready",
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_progress": 50,
        "pptx_last_update": _utc_now(),
        "pptx_capture_total": 10,
        "pptx_capture_completed": 5,
        "pptx_current_chart_id": "chart_a",
    }
    payload = build_status_payload("survey-1", report)
    assert "pptx_capture_total" not in payload
    assert "pptx_capture_completed" not in payload
    assert "pptx_current_chart_id" not in payload


# --- Failure classification ---


def test_capture_timeout_classified():
    from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
        PptxExportTimeout,
    )

    code, _, retryable, _ = classify_pptx_failure(
        PptxExportTimeout("capturing_charts", 90),
        stage="capturing_charts",
    )
    assert code == ERROR_CAPTURE_TIMEOUT
    assert retryable is True


# --- Cache ---


@pytest.mark.asyncio
async def test_status_cache_invalidation(monkeypatch):
    stored: dict = {}

    async def mock_get(key):
        return stored.get(key)

    async def mock_set(key, value, ttl=2):
        stored[key] = value

    async def mock_delete(key):
        stored.pop(key, None)

    monkeypatch.setattr("backend.utils.report_status_cache.cache.get", mock_get)
    monkeypatch.setattr("backend.utils.report_status_cache.cache.set", mock_set)
    monkeypatch.setattr("backend.utils.report_status_cache.cache.delete", mock_delete)

    from backend.utils.report_status_cache import get_cached_status

    survey_id = "survey-cache-test"
    calls = {"n": 0}

    async def loader():
        calls["n"] += 1
        return {"survey_id": survey_id, "pptx_status": "PROCESSING", "pptx_progress": 10}

    data1, hit1 = await get_cached_status(survey_id, loader)
    data2, hit2 = await get_cached_status(survey_id, loader)
    assert hit1 is False
    assert hit2 is True
    assert calls["n"] == 1

    await invalidate_status_cache(survey_id)
    _, hit3 = await get_cached_status(survey_id, loader)
    assert hit3 is False
    assert calls["n"] == 2


def test_status_fingerprint_detects_progress_change():
    a = status_fingerprint({"pptx_status": "PROCESSING", "pptx_progress": 40})
    b = status_fingerprint({"pptx_status": "PROCESSING", "pptx_progress": 45})
    assert a != b


# --- Stale recovery skip when disabled ---


@pytest.mark.asyncio
async def test_recover_stale_skipped_when_flag_off(monkeypatch):
    monkeypatch.setattr(
        "backend.utils.pptx_job_state.is_stale_recovery_enabled",
        lambda: False,
    )

    class _FakeColl:
        async def update_one(self, *args, **kwargs):
            raise AssertionError("should not update when recovery disabled")

    class _FakeDb:
        def get_collection(self, name):
            return _FakeColl()

    report = {
        "_id": "abc",
        "pptx_status": PPTX_STATUS_PROCESSING,
        "pptx_stage": "capturing_charts",
        "pptx_last_update": _utc_now() - timedelta(hours=2),
    }
    out, recovered = await recover_stale_job_if_needed(_FakeDb(), "s1", report)
    assert recovered is False
    assert out is report
