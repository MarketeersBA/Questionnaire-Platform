"""Integration tests for public GET product test payload (Phase 2 gateway)."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.public import router as public_router

app = FastAPI()
app.include_router(public_router)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "ABCD1234EFGH"

STORED_SNAPSHOT = {
    "version": 1,
    "language": "en",
    "phases": [
        {
            "timing": "before_use",
            "label": "Before Use",
            "sections": [
                {
                    "id": "before_use_product_appearance",
                    "title": "Product Appearance",
                    "module": "product_test",
                    "timing": "before_use",
                    "questions": [{"id": "pt_q01", "text": "Look", "type": "scale"}],
                }
            ],
        }
    ],
    "meta": {"totalQuestions": 1, "sectionCount": 1, "phaseCount": 1, "generatedAt": "2026-01-01"},
}

MOCK_SURVEY = {
    "_id": ObjectId(SURVEY_ID),
    "company_name": "Test Co",
    "template_id": str(ObjectId()),
    "customizations": {"category": "Shampoo"},
    "type": "product_test",
    "product_test_config": {
        "language": "en",
        "package_test_enabled": False,
        "selected_attributes": ["Product Appearance"],
    },
    "product_test_snapshot": STORED_SNAPSHOT,
    "template_snapshot_l2": {
        "sections": [
            {"module": "product_test", "title": "Legacy PT", "questions": []},
            {"module": "taste_test", "title": "Should Stay", "questions": []},
        ]
    },
    "template_snapshot_questions": [],
    "layer1_screening_config": {},
}


@pytest.fixture
def client():
    return TestClient(app)


def _mock_db(token_doc, survey_doc):
    tokens_col = MagicMock()
    tokens_col.find_one = AsyncMock(return_value=token_doc)

    surveys_col = MagicMock()
    surveys_col.find_one = AsyncMock(return_value=survey_doc)

    templates_col = MagicMock()
    templates_col.find_one = AsyncMock(return_value=None)

    def get_collection(name):
        return {
            "tokens": tokens_col,
            "surveys": surveys_col,
            "templates": templates_col,
        }.get(name, MagicMock())

    return get_collection


@patch("backend.routers.public.db.get_collection")
def test_public_get_serves_product_test_snapshot(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(
        {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID},
        MOCK_SURVEY,
    )

    res = client.get(f"/s/{TOKEN}")
    assert res.status_code == 200
    body = res.json()

    assert body["survey_type"] == "product_test"
    assert body["product_test_config"]["language"] == "en"
    assert body["product_test_snapshot"]["meta"]["totalQuestions"] == 1
    assert body["language"] == "en"
    assert "product_test" in body["selected_modules"]
    assert "product_test" in body["module_sequence"]

    l2_modules = [s.get("module") for s in body["layer2_questions"].get("sections", [])]
    assert "product_test" not in l2_modules
    assert "taste_test" in l2_modules


@patch("backend.routers.public.db.get_collection")
@patch("backend.routers.public.orchestration_service.compose_product_test_snapshot", new_callable=AsyncMock)
def test_public_get_runtime_compose_when_snapshot_missing(mock_compose, mock_get_collection, client):
    mock_compose.return_value = STORED_SNAPSHOT
    survey = {**MOCK_SURVEY, "product_test_snapshot": None}
    mock_get_collection.side_effect = _mock_db(
        {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID},
        survey,
    )

    res = client.get(f"/s/{TOKEN}")
    assert res.status_code == 200
    assert res.json()["product_test_snapshot"]["meta"]["totalQuestions"] == 1
    mock_compose.assert_awaited_once()


@patch("backend.routers.public.db.get_collection")
@patch("backend.routers.public.orchestration_service.compose_product_test_snapshot", new_callable=AsyncMock)
def test_public_get_503_when_bank_empty(mock_compose, mock_get_collection, client):
    mock_compose.return_value = {
        "version": 1,
        "language": "en",
        "phases": [],
        "meta": {"totalQuestions": 0, "sectionCount": 0, "phaseCount": 0},
    }
    survey = {**MOCK_SURVEY, "product_test_snapshot": None, "template_snapshot_l2": {"sections": []}}
    mock_get_collection.side_effect = _mock_db(
        {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID},
        survey,
    )

    res = client.get(f"/s/{TOKEN}")
    assert res.status_code == 503
    assert "DATA_LAYER.md" in res.json()["detail"]
