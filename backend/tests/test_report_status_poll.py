"""Tests for report status polling helpers."""
from backend.utils.report_status_cache import (
    compute_poll_interval_seconds,
    status_fingerprint,
)


def test_poll_interval_active_report():
    assert compute_poll_interval_seconds("generating", None) == 3.0


def test_poll_interval_active_pptx():
    assert compute_poll_interval_seconds("ready", "PROCESSING") == 2.5


def test_poll_interval_terminal():
    assert compute_poll_interval_seconds("ready", "READY") == 30.0


def test_status_fingerprint_changes_with_status():
    a = status_fingerprint({"status": "generating", "pptx_status": None})
    b = status_fingerprint({"status": "ready", "pptx_status": None})
    assert a != b
