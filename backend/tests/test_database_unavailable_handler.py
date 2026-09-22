"""
A database outage must surface as a short, clean response — not the
unhandled 500 + multi-thousand-line traceback this used to produce.

`db.get_collection` retries the connection on every call and raises
`DatabaseUnavailableError` (a `RuntimeError` subclass) when Mongo genuinely
can't be reached. Before `main.py` registered a handler for it, that fell
through FastAPI's default handling as an unhandled exception: a wall of
Starlette/FastAPI internals in both the HTTP response and the server logs,
and a frontend stuck on an endless loading skeleton with nothing telling
anyone what was actually wrong. This is exactly what happened in production
during a real Atlas DNS/SRV outage.
"""
from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.database import DatabaseUnavailableError
from backend.utils.security import create_access_token

client = TestClient(app, raise_server_exceptions=False)


def _auth_headers():
    token = create_access_token({"sub": "admin"})
    return {"Authorization": f"Bearer {token}"}


def test_a_db_outage_returns_a_clean_503_not_an_unhandled_500():
    with patch(
        "backend.database.db.get_collection",
        side_effect=DatabaseUnavailableError("Database unavailable — cannot access 'users'."),
    ):
        resp = client.get("/surveys/", headers=_auth_headers())

    assert resp.status_code == 503
    body = resp.json()
    assert body["error"] == "database_unavailable"
    # The whole point: short and human-readable, not a traceback dump.
    assert len(resp.text) < 500


def test_the_response_never_leaks_internal_exception_detail():
    with patch(
        "backend.database.db.get_collection",
        side_effect=DatabaseUnavailableError("Database unavailable — cannot access 'users'. Last error: ConfigurationError: ..."),
    ):
        resp = client.get("/surveys/", headers=_auth_headers())

    # The raw Mongo/DNS error text is for the server log, not the client.
    assert "ConfigurationError" not in resp.text
    assert "Traceback" not in resp.text


def test_a_plain_runtime_error_elsewhere_is_not_silently_reclassified():
    """
    `DatabaseUnavailableError` is a `RuntimeError` subclass so existing
    `except RuntimeError` call sites keep working, but the *handler* is
    registered for the subclass specifically — an unrelated bug that happens
    to raise a bare `RuntimeError` must not be mistaken for a database outage
    and hidden behind a reassuring "try again" message.
    """
    with patch("backend.database.db.get_collection", side_effect=RuntimeError("unrelated bug")):
        resp = client.get("/surveys/", headers=_auth_headers())

    # Falls through to Starlette's own default handling (plain text, not our
    # JSON shape) — proof our handler's `DatabaseUnavailableError` type match
    # didn't widen to catch every `RuntimeError`.
    assert resp.status_code == 500
    assert "database_unavailable" not in resp.text
