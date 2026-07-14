"""Phase 6 — capture tokens must not work on general/admin routes."""
from __future__ import annotations

from backend.tests.capture_auth.conftest import SURVEY_MATCH


def _capture_headers(bearer_capture_token):
    token = bearer_capture_token(survey_id=SURVEY_MATCH)
    return {"Authorization": f"Bearer {token}"}


def test_capture_token_rejected_on_auth_me(capture_api_client, bearer_capture_token):
    response = capture_api_client.get("/auth/me", headers=_capture_headers(bearer_capture_token))
    assert response.status_code == 403
    assert "capture" in response.json()["detail"].lower()


def test_capture_token_rejected_on_ai_costs_admin_route(
    capture_api_client,
    bearer_capture_token,
):
    response = capture_api_client.get(
        f"/analytics/reports/{SURVEY_MATCH}/ai-costs",
        headers=_capture_headers(bearer_capture_token),
    )
    assert response.status_code == 403


def test_capture_token_rejected_on_report_status_polling(
    capture_api_client,
    bearer_capture_token,
):
    """Status uses get_current_user — capture token must not return 200."""
    response = capture_api_client.get(
        f"/analytics/report/{SURVEY_MATCH}/status",
        headers=_capture_headers(bearer_capture_token),
    )
    assert response.status_code != 200
    assert response.status_code in (403, 422)


def test_capture_token_rejected_on_generate_report_mutation(
    capture_api_client,
    bearer_capture_token,
):
    response = capture_api_client.post(
        f"/analytics/generate-report/{SURVEY_MATCH}",
        headers=_capture_headers(bearer_capture_token),
        json={},
    )
    assert response.status_code == 403
