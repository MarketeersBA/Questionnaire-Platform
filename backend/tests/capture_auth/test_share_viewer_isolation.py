"""
Report share-viewer tokens must never satisfy a platform-user dependency.

A viewer token is minted for an external client who typed a PIN. It names a
survey, so the temptation for a future route is to treat it as "authenticated
enough". These tests pin the opposite: every general-purpose auth dependency
refuses it, and the refusal comes from the reserved-subject check rather than
from a user lookup happening to miss.

The distinction matters. Before ``NON_USER_SUBJECTS`` existed, a viewer token
was rejected only because no user document was named ``report-viewer``. The
last test here is the one that would have caught that: it plants exactly such a
user and asserts the token is still refused.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from backend.services.report_viewer_token import (
    SCOPE_READ,
    VIEWER_TOKEN_SUBJECT,
    create_viewer_access_token,
)
from backend.tests.capture_auth.conftest import SURVEY_MATCH, SURVEY_OTHER

SHARE_ID = "shr_test_isolation"


@pytest.fixture
def bearer_viewer_token():
    def _factory(
        *,
        survey_id: str = SURVEY_MATCH,
        share_id: str = SHARE_ID,
        pin_version: int = 1,
        scope=(SCOPE_READ,),
    ) -> str:
        token, _ = create_viewer_access_token(
            share_id=share_id,
            survey_id=survey_id,
            scope=scope,
            pin_version=pin_version,
            viewer_id="viewer-test-1",
        )
        return token

    return _factory


def _headers(bearer_viewer_token, **kwargs):
    return {"Authorization": f"Bearer {bearer_viewer_token(**kwargs)}"}


# ── Unit level: the dependencies themselves ────────────────────────────────


async def test_reject_capture_token_refuses_viewer_subject(bearer_viewer_token):
    from backend.routers.capture_auth_deps import reject_capture_token

    with pytest.raises(HTTPException) as exc:
        await reject_capture_token(bearer_viewer_token())

    assert exc.value.status_code == 403
    assert "share viewer" in str(exc.value.detail).lower()


async def test_get_current_user_refuses_viewer_subject(bearer_viewer_token):
    from backend.routers.capture_auth_deps import get_current_user

    with pytest.raises(HTTPException) as exc:
        await get_current_user(bearer_viewer_token())

    assert exc.value.status_code == 403


async def test_resolve_report_read_auth_refuses_viewer_even_for_its_own_survey(
    bearer_viewer_token,
):
    """
    The raw report route accepts a capture token scoped to the same survey, so
    a viewer token naming that survey is the plausible near-miss. It must still
    be refused: that route returns the unsanitised document.
    """
    from backend.routers.capture_auth_deps import resolve_report_read_auth

    with pytest.raises(HTTPException) as exc:
        await resolve_report_read_auth(
            bearer_viewer_token(survey_id=SURVEY_MATCH),
            SURVEY_MATCH,
        )

    assert exc.value.status_code == 403


# ── Integration level: real routes ─────────────────────────────────────────


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/auth/me"),
        ("get", f"/analytics/report/{SURVEY_MATCH}"),
        ("get", f"/analytics/report/{SURVEY_MATCH}/status"),
        ("get", f"/analytics/reports/{SURVEY_MATCH}/ai-costs"),
        ("get", f"/analytics/report/{SURVEY_MATCH}/download"),
        ("post", f"/analytics/generate-report/{SURVEY_MATCH}"),
        ("post", f"/analytics/report/{SURVEY_MATCH}/generate-pptx"),
        ("delete", f"/analytics/report/{SURVEY_MATCH}"),
    ],
)
def test_viewer_token_rejected_on_account_routes(
    capture_api_client,
    bearer_viewer_token,
    method,
    path,
):
    response = getattr(capture_api_client, method)(
        path,
        headers=_headers(bearer_viewer_token),
    )
    assert response.status_code != 200, f"{method.upper()} {path} accepted a viewer token"
    assert response.status_code in (401, 403, 422)


def test_viewer_token_for_other_survey_is_equally_rejected(
    capture_api_client,
    bearer_viewer_token,
):
    """Cross-survey access is not a special case — no viewer token works here at all."""
    response = capture_api_client.get(
        f"/analytics/report/{SURVEY_MATCH}",
        headers=_headers(bearer_viewer_token, survey_id=SURVEY_OTHER),
    )
    assert response.status_code in (401, 403)


# ── The regression this guard exists for ───────────────────────────────────


async def test_viewer_subject_refused_even_when_a_matching_user_exists(
    monkeypatch,
    bearer_viewer_token,
):
    """
    Plant a real, active user literally named ``report-viewer``.

    Without the reserved-subject check the token would now authenticate as that
    user — the escalation that "no such user exists" was silently relying on.
    """
    from backend.models import UserInDB
    from backend.routers import capture_auth_deps

    planted = UserInDB(
        username=VIEWER_TOKEN_SUBJECT,
        role="admin",
        is_active=True,
        email=None,
        hashed_password="x",
    )

    async def _fake_get_user(username: str):
        return planted if username == VIEWER_TOKEN_SUBJECT else None

    monkeypatch.setattr(capture_auth_deps, "_get_user", _fake_get_user)

    with pytest.raises(HTTPException) as exc:
        await capture_auth_deps.get_current_user(bearer_viewer_token())

    assert exc.value.status_code == 403
