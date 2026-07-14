"""Shared fixtures for capture-auth integration tests (Phase 6)."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from unittest.mock import MagicMock


def _ensure_slowapi_stub() -> None:
    """Allow importing analytics router when slowapi is not installed locally."""
    if "slowapi" in sys.modules:
        return
    stub = MagicMock()
    stub.Limiter = MagicMock(return_value=MagicMock())
    stub._rate_limit_exceeded_handler = MagicMock()
    sys.modules["slowapi"] = stub
    sys.modules["slowapi.util"] = MagicMock()
    sys.modules["slowapi.errors"] = MagicMock()


_ensure_slowapi_stub()

from typing import Any, Dict, Optional
from unittest.mock import patch

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from backend.config import settings
from backend.database import db

SURVEY_MATCH = "507f1f77bcf86cd799439011"
SURVEY_OTHER = "507f1f77bcf86cd799439022"


def _ready_report(survey_id: str) -> Dict[str, Any]:
    return {
        "_id": ObjectId(),
        "survey_id": survey_id,
        "status": "ready",
        "generated_at": datetime.now(timezone.utc),
        "charts": [{"chart_id": "audience_affinity", "chart_type": "affinity_heatmap"}],
        "metadata": {"title": "Test report"},
    }


class FakeSurveyReportsCollection:
    def __init__(self, reports: Dict[str, Dict[str, Any]]):
        self._reports = reports

    async def find_one(self, query: Dict[str, Any], *args, **kwargs):
        survey_id = query.get("survey_id")
        if survey_id is not None:
            return self._reports.get(str(survey_id))
        oid = query.get("_id")
        if oid is not None:
            for doc in self._reports.values():
                if doc.get("_id") == oid:
                    return doc
        return None

    async def update_one(self, *args, **kwargs):
        return None


@pytest.fixture(autouse=True)
def _capture_auth_secret(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "phase6-capture-auth-test-secret")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", raising=False)


@pytest.fixture
def survey_reports_db(monkeypatch):
    """In-memory survey_reports for analytics report-read tests."""
    reports = {
        SURVEY_MATCH: _ready_report(SURVEY_MATCH),
        SURVEY_OTHER: _ready_report(SURVEY_OTHER),
    }
    fake_col = FakeSurveyReportsCollection(reports)

    def _get_collection(name: str):
        if name == "survey_reports":
            return fake_col
        raise KeyError(f"Unexpected collection in capture_auth tests: {name}")

    monkeypatch.setattr("backend.routers.analytics.db.get_collection", _get_collection)
    return reports


@pytest.fixture
def capture_api_client(survey_reports_db):
    """
    Minimal FastAPI app (auth + analytics only) — real capture auth deps, no full main.py.
    """
    from fastapi import FastAPI
    from backend.routers import analytics, auth

    test_app = FastAPI()
    test_app.include_router(auth.router)
    test_app.include_router(analytics.router)

    with TestClient(test_app) as client:
        yield client


@pytest.fixture
def bearer_capture_token():
    from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
        create_capture_access_token,
    )

    def _factory(
        *,
        survey_id: str = SURVEY_MATCH,
        role: str = "admin",
        report_id: Optional[str] = None,
        expires_minutes: int = 20,
    ) -> str:
        return create_capture_access_token(
            survey_id=survey_id,
            role=role,
            report_id=report_id,
            expires_minutes=expires_minutes,
        )

    return _factory
