"""
The survey's master link must never resume a finished or stale attempt.

`POST /s/master-link/{survey_id}/generate-token` decides whether a visitor to
the shareable link gets a brand-new token or the token from an existing
attempt tied to their `device_id` (or, failing that, their IP). Two real bugs
lived here:

1. The reuse lookup carried no status filter at all, so a `submitted` or
   `failed` token was handed straight back. `GET /s/{token}` rejects both
   statuses with a 403 — so the moment anyone on a shared device (a fieldwork
   tablet, an office computer used to test survey after survey) finished or
   was screened out, that device could never open the survey again. Every
   later visitor, real or a teammate testing, hit the same dead end.
2. A still-open attempt (`unused` / `passed`) was reused regardless of age,
   so a teammate's test from hours or days earlier resumed for the next
   person on that device — landing them mid-survey instead of at the start,
   which is what this whole file was written to catch after that exact report.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.public import router as public_router

app = FastAPI()
app.include_router(public_router)

SURVEY_ID = "507f1f77bcf86cd799439011"
DEVICE_ID = "dev_abc123"


def _survey(status: str = "active"):
    return {"_id": ObjectId(SURVEY_ID), "status": status}


class _FakeTokensCollection:
    """Just enough of the Mongo collection surface this endpoint calls."""

    def __init__(self, existing=None):
        self.existing = existing  # a single pre-seeded token doc, or None
        self.inserted = []

    async def find_one(self, query, sort=None):
        if self.existing is None:
            return None
        # Mirror the two things the real query filters on: the status
        # exclusion and, when present, the device/IP match.
        if self.existing.get("status") in (query.get("status") or {}).get("$nin", []):
            return None
        if "device_id" in query and self.existing.get("device_id") != query["device_id"]:
            return None
        if "ip_address" in query and self.existing.get("ip_address") != query["ip_address"]:
            return None
        return self.existing

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return MagicMock(inserted_id=ObjectId())


def _mock_db(*, survey, tokens_col):
    surveys_col = MagicMock()
    surveys_col.find_one = AsyncMock(return_value=survey)

    def get_collection(name):
        return {"tokens": tokens_col, "surveys": surveys_col}.get(name, MagicMock())

    return get_collection


@pytest.fixture
def client():
    return TestClient(app)


def _generate(client, device_id=DEVICE_ID):
    return client.post(
        f"/s/master-link/{SURVEY_ID}/generate-token",
        json={"device_id": device_id} if device_id else {},
    )


def test_no_prior_attempt_mints_a_fresh_token(client):
    tokens_col = _FakeTokensCollection(existing=None)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client)

    assert resp.status_code == 200
    assert len(tokens_col.inserted) == 1
    assert tokens_col.inserted[0]["status"] == "unused"


def test_a_recent_in_progress_attempt_is_resumed(client):
    """The legitimate case this endpoint exists for: a dropped connection or
    an accidental tab close a few minutes ago should pick back up, not
    restart."""
    existing = {
        "token": "existing-token-1",
        "status": "passed",
        "device_id": DEVICE_ID,
        "created_at": datetime.utcnow() - timedelta(minutes=5),
    }
    tokens_col = _FakeTokensCollection(existing=existing)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client)

    assert resp.status_code == 200
    assert resp.json()["token"] == "existing-token-1"
    assert tokens_col.inserted == []


@pytest.mark.parametrize("status", ["submitted", "failed"])
def test_a_finished_attempt_never_blocks_the_next_visitor(client, status):
    """The device-lockout bug: once one person on a shared device finishes or
    is screened out, the next person must still be able to take the survey —
    not be handed that same closed-out token and 403 on GET /s/{token}."""
    existing = {
        "token": "finished-token",
        "status": status,
        "device_id": DEVICE_ID,
        "created_at": datetime.utcnow(),  # even brand-new must not be reused
    }
    tokens_col = _FakeTokensCollection(existing=existing)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client)

    assert resp.status_code == 200
    assert resp.json()["token"] != "finished-token"
    assert len(tokens_col.inserted) == 1
    assert tokens_col.inserted[0]["status"] == "unused"


def test_a_stale_in_progress_attempt_is_treated_as_abandoned(client):
    """The report this fixes: a teammate's test from hours earlier must not
    resume for the next person who opens the same shareable link on the same
    device — they get a fresh start from the beginning instead."""
    existing = {
        "token": "stale-token",
        "status": "passed",
        "device_id": DEVICE_ID,
        "created_at": datetime.utcnow() - timedelta(hours=3),
    }
    tokens_col = _FakeTokensCollection(existing=existing)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client)

    assert resp.status_code == 200
    assert resp.json()["token"] != "stale-token"
    assert len(tokens_col.inserted) == 1


def test_right_at_the_window_boundary_still_resumes(client):
    """Just inside the resume window: still the same sitting."""
    existing = {
        "token": "boundary-token",
        "status": "unused",
        "device_id": DEVICE_ID,
        "created_at": datetime.utcnow() - timedelta(minutes=59),
    }
    tokens_col = _FakeTokensCollection(existing=existing)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client)

    assert resp.json()["token"] == "boundary-token"


def test_the_ip_fallback_path_gets_the_same_protections(client):
    """No device_id (e.g. localStorage cleared / blocked) falls back to
    matching by IP — that path must exclude finished attempts too, or the
    same shared-device lockout happens by IP instead of by device_id."""
    existing = {
        "token": "finished-by-ip",
        "status": "submitted",
        "ip_address": "testclient",
        "created_at": datetime.utcnow(),
    }
    tokens_col = _FakeTokensCollection(existing=existing)
    with patch("backend.routers.public.db.get_collection", _mock_db(survey=_survey(), tokens_col=tokens_col)):
        resp = _generate(client, device_id=None)

    assert resp.status_code == 200
    assert resp.json()["token"] != "finished-by-ip"
