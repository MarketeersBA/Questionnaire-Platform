"""Rollout flag helpers."""
import os

from backend.utils import pptx_rollout_flags


def test_queue_enabled_default_true(monkeypatch):
    monkeypatch.delenv("PPTX_QUEUE_ENABLED", raising=False)
    assert pptx_rollout_flags.is_pptx_queue_enabled() is True


def test_queue_disabled(monkeypatch):
    monkeypatch.setenv("PPTX_QUEUE_ENABLED", "false")
    assert pptx_rollout_flags.is_pptx_queue_enabled() is False


def test_stale_recovery_disabled(monkeypatch):
    monkeypatch.setenv("PPTX_STALE_RECOVERY_ENABLED", "0")
    assert pptx_rollout_flags.is_stale_recovery_enabled() is False


def test_capture_progress_disabled(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_PROGRESS_ENABLED", "no")
    assert pptx_rollout_flags.is_capture_progress_enabled() is False
