"""Phase 2 — capture JWT accepted only on report-read routes."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    create_capture_access_token,
)
from backend.config import settings
from backend.routers.auth import get_current_user, get_current_user_or_capture_user
from backend.routers.capture_auth_deps import (
    CAPTURE_SERVICE_USERNAME,
    reject_capture_token,
    resolve_report_read_auth,
)
from backend.utils.security import create_access_token


@pytest.fixture(autouse=True)
def _secret_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-phase2")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")


@pytest.mark.asyncio
async def test_reject_capture_token_on_general_routes():
    token = create_capture_access_token(
        survey_id="survey-1",
        role="admin",
        expires_minutes=20,
    )
    with pytest.raises(HTTPException) as exc:
        await reject_capture_token(token)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_current_user_rejects_capture_subject(monkeypatch):
    """Defense-in-depth if a capture JWT bypasses reject_capture_token."""
    token = create_capture_access_token(
        survey_id="survey-1",
        role="admin",
        expires_minutes=20,
    )

    async def _should_not_run(_username: str):
        raise AssertionError("capture token must not query users collection")

    monkeypatch.setattr(
        "backend.routers.capture_auth_deps._get_user",
        _should_not_run,
    )

    with pytest.raises(HTTPException) as exc:
        await get_current_user(token)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_resolve_report_read_accepts_capture_token():
    ctx = await resolve_report_read_auth(
        create_capture_access_token(survey_id="survey-1", role="analyst"),
        "survey-1",
    )
    assert ctx.is_capture
    assert ctx.user.username == CAPTURE_SERVICE_USERNAME
    assert ctx.user.role == "analyst"
    assert ctx.capture_claims is not None
    assert ctx.capture_claims.survey_id == "survey-1"


@pytest.mark.asyncio
async def test_resolve_report_read_survey_mismatch_401():
    token = create_capture_access_token(survey_id="survey-a", role="admin")
    with pytest.raises(HTTPException) as exc:
        await resolve_report_read_auth(token, "survey-b")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_or_capture_user_sets_request_state():
    class FakeRequest:
        state = type("State", (), {})()

    request = FakeRequest()
    token = create_capture_access_token(survey_id="s1", role="admin")

    user = await get_current_user_or_capture_user(request, "s1", token)

    assert user.username == CAPTURE_SERVICE_USERNAME
    assert request.state.auth_kind == "capture"
    assert request.state.capture_claims.survey_id == "s1"


@pytest.mark.asyncio
async def test_resolve_report_read_rejects_regular_token_without_user(monkeypatch):
    """Regular JWT path still requires a DB user (unchanged behavior)."""
    token = create_access_token(data={"sub": "nobody-here", "role": "admin"})

    async def _no_user(_username: str):
        return None

    monkeypatch.setattr(
        "backend.routers.capture_auth_deps._get_user",
        _no_user,
    )

    with pytest.raises(HTTPException) as exc:
        await resolve_report_read_auth(token, "s1")
    assert exc.value.status_code == 401
