"""Phase 9 — question_modules API auth and routing."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.models import User
from backend.routers.auth import get_current_active_analyst, get_current_user
from backend.routers.question_modules import router

app = FastAPI()
app.include_router(router)

MOCK_USER = User(
    _id="507f1f77bcf86cd799439011",
    username="analyst",
    email="a@test.com",
    role="analyst",
    is_active=True,
)
MOCK_MODULE = {
    "module_id": "purchase_funnel",
    "name": "Purchase Funnel Module",
    "version": 2,
    "is_active": True,
    "sections": [],
    "question_count": 7,
}


@pytest.fixture
def client():
    return TestClient(app)


def test_list_modules_requires_auth(client):
    res = client.get("/modules/")
    assert res.status_code in (401, 403)


def test_get_module_with_auth(client):
    with patch(
        "backend.routers.question_modules.question_module_service.get_active_module",
        new_callable=AsyncMock,
        return_value=MOCK_MODULE,
    ):
        app.dependency_overrides[get_current_user] = lambda: MOCK_USER
        try:
            res = client.get("/modules/purchase_funnel")
            assert res.status_code == 200
            assert res.json()["module_id"] == "purchase_funnel"
            assert res.json()["version"] == 2
        finally:
            app.dependency_overrides.clear()


def test_put_module_requires_analyst(client):
    client_user = User(
        _id="507f1f77bcf86cd799439012",
        username="client",
        email="c@test.com",
        role="client",
        is_active=True,
    )
    app.dependency_overrides[get_current_user] = lambda: client_user
    try:
        res = client.put(
            "/modules/purchase_funnel",
            json={"name": "X", "sections": []},
        )
        assert res.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_put_module_analyst_allowed(client):
    updated = {**MOCK_MODULE, "version": 3}
    with patch(
        "backend.routers.question_modules.question_module_service.upsert_module_version",
        new_callable=AsyncMock,
        return_value=updated,
    ):
        app.dependency_overrides[get_current_active_analyst] = lambda: MOCK_USER
        try:
            res = client.put(
                "/modules/purchase_funnel",
                json={
                    "name": "Purchase Funnel Module",
                    "sections": [
                        {
                            "section_id": "awareness",
                            "title_en": "Awareness",
                            "title_ar": "Awareness",
                            "order": 1,
                            "questions": [
                                {
                                    "question_id": "pf_q1",
                                    "type": "open_single",
                                    "ar_text": "ar",
                                    "en_text": "en",
                                    "order": 1,
                                    "required": True,
                                }
                            ],
                        }
                    ],
                },
            )
            assert res.status_code == 200
            assert res.json()["version"] == 3
        finally:
            app.dependency_overrides.clear()


def test_rollout_endpoint(client):
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    try:
        res = client.get("/modules/rollout")
        assert res.status_code == 200
        body = res.json()
        assert "module_rollout_stage" in body
        assert "rollout_order" in body
    finally:
        app.dependency_overrides.clear()
