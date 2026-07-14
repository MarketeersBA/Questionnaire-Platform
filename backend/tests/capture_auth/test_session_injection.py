"""Phase 6 — CaptureSessionContext token injection for Playwright."""
from __future__ import annotations

import json
import re

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    CAPTURE_TOKEN_SUBJECT,
    decode_capture_access_token,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_browser_inject import (
    build_playwright_storage_init_script,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
    CaptureSessionContext,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_session import (
    CAPTURE_SESSION_SOURCE_MINTED,
    resolve_capture_session_for_batch,
)
from backend.tests.capture_auth.conftest import SURVEY_MATCH


def test_resolve_session_storage_entries_contain_token_and_role():
    resolution = resolve_capture_session_for_batch(
        survey_id=SURVEY_MATCH,
        report_id="report-inject-1",
        job_id="job-inject-1",
    )
    session = resolution.session

    assert session.source == CAPTURE_SESSION_SOURCE_MINTED
    assert session.survey_id == SURVEY_MATCH
    assert session.report_id == "report-inject-1"
    assert session.job_id == "job-inject-1"

    entries = session.storage_entries()
    assert entries["token"]
    assert entries["role"] in {"admin", "analyst"}
    assert entries["token"] == session.auth_token

    claims = decode_capture_access_token(
        entries["token"],
        expected_survey_id=SURVEY_MATCH,
    )
    assert claims.subject == CAPTURE_TOKEN_SUBJECT
    assert claims.report_id == "report-inject-1"
    assert claims.job_id == "job-inject-1"


def test_playwright_init_script_sets_local_storage_keys():
    session = CaptureSessionContext(
        auth_token="jwt-for-playwright",
        role="analyst",
        local_storage={"extra_flag": "1"},
    )
    entries = session.storage_entries()
    script = build_playwright_storage_init_script(entries)

    assert "jwt-for-playwright" in script
    assert "localStorage.setItem" in script
    assert '"token"' in script
    assert '"role"' in script
    assert '"analyst"' in script
    assert '"extra_flag"' in script

    # Script embeds the same JSON payload as storage_entries
    match = re.search(r"const entries = (\{.*?\});", script, re.DOTALL)
    assert match
    embedded = json.loads(match.group(1))
    assert embedded == entries


def test_capture_batch_passes_session_with_token_to_browser_factory(
    tmp_path,
    monkeypatch,
):
    """Worker must forward minted session.storage_entries() into the browser layer."""
    from backend.analytics_module.pptx_builder.browser_capture import BrowserCaptureWorker
    from backend.analytics_module.pptx_builder.hybrid_export.capture_config import (
        BrowserCaptureConfig,
    )
    from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
        ChartCaptureRequest,
    )

    captured_sessions: list[CaptureSessionContext] = []

    from contextlib import contextmanager

    @contextmanager
    def recording_factory(session: CaptureSessionContext):
        captured_sessions.append(session)
        from backend.tests.analytics.test_browser_capture import FakePage

        page = FakePage()
        yield page

    config = BrowserCaptureConfig(
        frontend_base_url="http://frontend.test",
        navigation_timeout_ms=1000,
        ready_timeout_ms=1000,
        screenshot_timeout_ms=1000,
        device_scale_factor=2.0,
        default_theme="light",
        default_frame="chart_body",
        max_attempts=1,
        ready_settle_ms=0,
        chart_root_selector='[data-export-chart-root="true"]',
        frame_ready_selector='[data-export-ready="true"]',
        per_chart_timeout_sec=90,
        batch_timeout_sec=600,
    )

    resolution = resolve_capture_session_for_batch(survey_id=SURVEY_MATCH)
    worker = BrowserCaptureWorker(
        config=config,
        output_root=tmp_path,
        browser_session_factory=recording_factory,
    )
    worker.capture_batch(
        report_id="report-1",
        survey_id=SURVEY_MATCH,
        requests=[ChartCaptureRequest(chart_id="audience_affinity", chart_type="table")],
        session=resolution.session,
    )

    assert len(captured_sessions) == 1
    injected = captured_sessions[0].storage_entries()
    assert injected["token"] == resolution.session.auth_token
    assert injected["role"] == resolution.session.role
