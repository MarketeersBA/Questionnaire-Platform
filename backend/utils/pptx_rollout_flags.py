"""
PPTX export feature flags for phased rollout (Phase 8).
"""
from __future__ import annotations

import os
from typing import Any, Dict


def _env_bool(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def is_pptx_queue_enabled() -> bool:
    """Durable Redis worker queue vs FastAPI BackgroundTasks."""
    return _env_bool("PPTX_QUEUE_ENABLED", "true")


def is_stale_recovery_enabled() -> bool:
    """Auto-fail stale jobs on status poll + enqueue recovery."""
    return _env_bool("PPTX_STALE_RECOVERY_ENABLED", "true")


def is_capture_progress_enabled() -> bool:
    """Per-chart capture progress fields and 40–64% progress band."""
    return _env_bool("PPTX_CAPTURE_PROGRESS_ENABLED", "true")


def get_rollout_flags_payload() -> Dict[str, Any]:
    """Expose active flags on status/diagnostics API responses."""
    return {
        "pptx_queue_enabled": is_pptx_queue_enabled(),
        "pptx_stale_recovery_enabled": is_stale_recovery_enabled(),
        "pptx_capture_progress_enabled": is_capture_progress_enabled(),
    }
