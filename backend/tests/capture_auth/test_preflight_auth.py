"""Phase 6 — preflight fails early with auth-specific errors."""
from __future__ import annotations

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
    CaptureEnvironmentError,
    run_pre_capture_checks,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_config import (
    BrowserCaptureConfig,
)
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    ERROR_AUTH_INVALID,
)
from backend.tests.capture_auth.conftest import SURVEY_MATCH


@pytest.fixture
def capture_config():
    return BrowserCaptureConfig(
        frontend_base_url="http://frontend:5173",
        navigation_timeout_ms=1000,
        ready_timeout_ms=1000,
        screenshot_timeout_ms=1000,
        device_scale_factor=2.0,
        default_theme="light",
        default_frame="chart_body",
        max_attempts=2,
        ready_settle_ms=0,
        chart_root_selector='[data-export-chart-root="true"]',
        frame_ready_selector='[data-export-ready="true"]',
        per_chart_timeout_sec=90,
        batch_timeout_sec=600,
    )


def test_preflight_fails_auth_invalid_when_report_api_returns_401(
    monkeypatch,
    capture_config,
):
    monkeypatch.setenv("PPTX_RENDER_MODE", "hybrid")
    monkeypatch.setenv("PPTX_EXPORT_FRONTEND_BASE_URL", "http://frontend:5173")

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            class _R:
                status_code = 200
                text = "<html><body>" + ("export-frame " * 20) + "</body></html>"

            if "/api/analytics/report/" in url:
                _R.status_code = 401
                _R.text = "Unauthorized"
            return _R()

    monkeypatch.setattr("httpx.Client", _Client)

    result = run_pre_capture_checks(
        SURVEY_MATCH,
        report_id="report-preflight",
        config=capture_config,
    )
    assert not result.ok
    assert result.primary_code == ERROR_AUTH_INVALID

    with pytest.raises(CaptureEnvironmentError) as exc_info:
        result.raise_if_failed()
    assert exc_info.value.primary_code == ERROR_AUTH_INVALID
    assert "[auth_invalid]" in str(exc_info.value)
