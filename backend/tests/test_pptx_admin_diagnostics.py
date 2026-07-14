"""Phase 7 — admin PPTX diagnostics payloads."""
from datetime import datetime, timedelta, timezone

import pytest

from backend.utils.pptx_admin_diagnostics import (
    build_stale_thresholds_payload,
    extend_status_payload_for_admin,
)
from backend.utils.pptx_job_state import is_pptx_job_stale


def test_stale_thresholds_payload():
    payload = build_stale_thresholds_payload()
    assert "default_ttl_seconds" in payload
    assert "capturing_charts" in payload["stage_ttl_seconds"]


def test_extend_status_payload_for_admin():
    now = datetime.now(timezone.utc)
    report = {
        "_id": "abc",
        "survey_id": "s1",
        "pptx_status": "PROCESSING",
        "pptx_stage": "capturing_charts",
        "pptx_last_update": now - timedelta(seconds=1000),
        "pptx_error": {"code": "capture_timeout", "message": "timed out"},
    }
    stale, _, _ = is_pptx_job_stale(report)
    assert stale is True

    payload = {"survey_id": "s1", "pptx_status": "PROCESSING"}
    extend_status_payload_for_admin(payload, report, lease_info={"owner": "worker-1", "ttl_seconds": 120})
    assert "admin_debug" in payload
    assert payload["admin_debug"]["latest_error_code"] == "capture_timeout"
    assert payload["admin_debug"]["stale_detected"] is True
