"""Phase 4 — capture report API auth preflight."""
from __future__ import annotations

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    create_capture_access_token,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
    CaptureEnvironmentError,
    run_pre_capture_checks,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight_auth import (
    build_report_api_probe_url,
    check_capture_report_api_access,
)
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    ERROR_AUTH_INVALID,
    ERROR_CAPTURE_AUTH_DENIED,
    classify_pptx_failure,
)
from backend.config import settings


@pytest.fixture(autouse=True)
def _secret_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-preflight-auth")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", raising=False)


def test_build_report_api_probe_url_frontend():
    url = build_report_api_probe_url("http://frontend:5173", "survey-xyz")
    assert url == "http://frontend:5173/api/analytics/report/survey-xyz"


def test_build_report_api_probe_url_direct_backend(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_API_BASE_URL", "http://backend:8080")
    url = build_report_api_probe_url("http://backend:8080", "survey-xyz")
    assert url == "http://backend:8080/analytics/report/survey-xyz"


def test_report_api_probe_accepts_200(monkeypatch):
    token = create_capture_access_token(survey_id="s1", role="admin")

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            assert headers["Authorization"] == f"Bearer {token}"
            class _R:
                status_code = 200
                text = '{"status":"ready"}'

            return _R()

    monkeypatch.setattr("httpx.Client", _Client)
    issue = check_capture_report_api_access(
        api_base_url="http://frontend:5173",
        survey_id="s1",
        bearer_token=token,
        timeout_sec=5.0,
    )
    assert issue is None


def test_report_api_probe_maps_401_to_auth_invalid(monkeypatch):
    token = create_capture_access_token(survey_id="s1", role="admin")

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            class _R:
                status_code = 401
                text = "Unauthorized"

            return _R()

    monkeypatch.setattr("httpx.Client", _Client)
    issue = check_capture_report_api_access(
        api_base_url="http://frontend:5173",
        survey_id="s1",
        bearer_token=token,
        timeout_sec=5.0,
    )
    assert issue is not None
    assert issue.code == ERROR_AUTH_INVALID


def test_report_api_probe_maps_403_to_capture_auth_denied(monkeypatch):
    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            class _R:
                status_code = 403
                text = "Forbidden"

            return _R()

    monkeypatch.setattr("httpx.Client", _Client)
    issue = check_capture_report_api_access(
        api_base_url="http://frontend:5173",
        survey_id="s1",
        bearer_token="token",
        timeout_sec=5.0,
    )
    assert issue is not None
    assert issue.code == ERROR_CAPTURE_AUTH_DENIED


def test_classify_preflight_auth_failure(monkeypatch):
    from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
        CapturePreflightIssue,
    )

    exc = CaptureEnvironmentError(
        [
            CapturePreflightIssue(
                code=ERROR_AUTH_INVALID,
                message="Capture token was rejected",
                remediation="Fix SECRET_KEY",
            )
        ]
    )
    code, _, _, _ = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_AUTH_INVALID


def test_pre_capture_checks_fail_fast_on_401(monkeypatch):
    from backend.analytics_module.pptx_builder.hybrid_export.capture_config import (
        BrowserCaptureConfig,
    )

    monkeypatch.setenv("PPTX_RENDER_MODE", "hybrid")
    monkeypatch.setenv("PPTX_EXPORT_FRONTEND_BASE_URL", "http://frontend:5173")

    class _OkClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, url, headers=None):
            class _R:
                status_code = 200
                text = "<html><body>" + ("x" * 100) + "</body></html>"

            if "/api/analytics/report/" in url or "/analytics/report/" in url:
                _R.status_code = 401
                _R.text = "Unauthorized"
            return _R()

    monkeypatch.setattr("httpx.Client", _OkClient)
    monkeypatch.delenv("PPTX_CAPTURE_API_BASE_URL", raising=False)

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

    result = run_pre_capture_checks(
        "survey-real",
        report_id="report-1",
        config=config,
    )
    assert not result.ok
    assert result.primary_code == ERROR_AUTH_INVALID

    with pytest.raises(CaptureEnvironmentError) as exc_info:
        result.raise_if_failed()
    assert ERROR_AUTH_INVALID in str(exc_info.value)
    assert exc_info.value.primary_code == ERROR_AUTH_INVALID
