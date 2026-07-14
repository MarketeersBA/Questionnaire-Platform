"""Phase 5 — capture preflight and environment validation."""
from __future__ import annotations

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.capture_config import (
    BrowserCaptureConfig,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
    CaptureEnvironmentError,
    build_export_frame_probe_url,
    check_export_frame_probe,
    check_frontend_base_reachable,
    run_capture_preflight,
    validate_capture_configuration,
)


def test_validate_configuration_requires_secret_key_or_url(monkeypatch):
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", raising=False)
    monkeypatch.setattr("backend.config.settings.SECRET_KEY", "", raising=False)
    config = BrowserCaptureConfig(
        frontend_base_url="",
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
    result = validate_capture_configuration(config)
    assert not result.ok
    codes = {issue.code for issue in result.issues}
    assert "frontend_base_url_missing" in codes
    assert "capture_auth_config" in codes or "auth_missing" in codes


def test_validate_configuration_accepts_secret_key(monkeypatch):
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", raising=False)
    monkeypatch.setattr("backend.config.settings.SECRET_KEY", "test-secret", raising=False)
    config = BrowserCaptureConfig(
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
    result = validate_capture_configuration(config)
    assert result.ok


def test_build_export_frame_probe_url():
    url = build_export_frame_probe_url("http://frontend:5173", "survey-abc")
    assert "/surveys/survey-abc/export-frame" in url
    assert "chart_id=__pptx_health_probe__" in url


def test_validate_configuration_accepts_env_override(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", "true")
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN", "a" * 40)
    config = BrowserCaptureConfig(
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
    result = validate_capture_configuration(config)
    assert result.ok


def test_run_preflight_skip_network(monkeypatch):
    monkeypatch.setattr("backend.config.settings.SECRET_KEY", "test-secret", raising=False)
    config = BrowserCaptureConfig(
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
    result = run_capture_preflight(
        config=config,
        skip_network=True,
    )
    assert result.ok


def test_preflight_raises_actionable_error(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN", "")
    config = BrowserCaptureConfig(
        frontend_base_url="not-a-url",
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
    result = validate_capture_configuration(config)
    with pytest.raises(CaptureEnvironmentError) as exc_info:
        result.raise_if_failed()
    assert "remediation" in str(exc_info.value).lower() or "→" in str(exc_info.value)


def test_check_frontend_unreachable(monkeypatch):
    import httpx

    class _FailClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url):
            raise httpx.ConnectError("connection refused", request=httpx.Request("GET", url))

    monkeypatch.setattr("httpx.Client", _FailClient)
    issue = check_frontend_base_reachable("http://127.0.0.1:59999")
    assert issue is not None
    assert issue.code == "frontend_unreachable"


def test_check_export_frame_accepts_spa_shell(monkeypatch):
    import httpx

    class _OkClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url):
            class _Resp:
                status_code = 200
                text = "<html><body><div id='root'>export-frame shell</div></body></html>" * 5

            return _Resp()

    monkeypatch.setattr("httpx.Client", _OkClient)
    issue = check_export_frame_probe("http://frontend:5173", "survey-1")
    assert issue is None
