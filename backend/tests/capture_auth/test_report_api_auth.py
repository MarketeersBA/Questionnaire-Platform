"""Phase 6 — GET /analytics/report/{survey_id} capture token acceptance."""
from __future__ import annotations

from backend.tests.capture_auth.conftest import SURVEY_MATCH, SURVEY_OTHER


def test_report_read_accepts_valid_capture_token(capture_api_client, bearer_capture_token):
    token = bearer_capture_token(survey_id=SURVEY_MATCH)
    response = capture_api_client.get(
        f"/analytics/report/{SURVEY_MATCH}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["survey_id"] == SURVEY_MATCH
    assert body["status"] == "ready"
    assert "_id" in body


def test_report_read_rejects_capture_token_for_wrong_survey(
    capture_api_client,
    bearer_capture_token,
):
    token = bearer_capture_token(survey_id=SURVEY_MATCH)
    response = capture_api_client.get(
        f"/analytics/report/{SURVEY_OTHER}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401


def test_report_read_without_token_is_unauthorized(capture_api_client):
    response = capture_api_client.get(f"/analytics/report/{SURVEY_MATCH}")
    assert response.status_code == 401
