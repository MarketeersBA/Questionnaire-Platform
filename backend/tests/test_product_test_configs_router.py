"""Phase 2 — product_test_configs & product_test_questions API auth and routing."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend.models import User
from backend.routers.auth import get_current_user, get_current_active_analyst
from backend.routers.product_test_configs import router as config_router
from backend.routers.product_test_questions import router as questions_router

app = FastAPI()
app.include_router(config_router)
app.include_router(questions_router)

MOCK_USER = User(
    _id="507f1f77bcf86cd799439011",
    username="analyst",
    email="a@test.com",
    role="analyst",
    is_active=True,
)

MOCK_CONFIG = {
    "config_id": "config-slug-123",
    "family_id": "family-slug-123",
    "version": 1,
    "language": "ar",
    "selected_attributes": ["Product Color"],
    "fixed_questions": ["pt_q01"],
    "optional_questions": ["pt_q02"],
    "package_test_enabled": True,
    "package_test_attributes": ["Pack Shape"],
    "status": "draft",
    "created_by": "analyst",
}

@pytest.fixture
def client():
    return TestClient(app)

def test_list_configs_requires_auth(client):
    res = client.get("/product-test-configs/")
    assert res.status_code in (401, 403)

@patch("backend.routers.product_test_configs.db.get_collection")
def test_create_config_with_auth(mock_get_collection, client):
    mock_col = MagicMock()
    mock_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id="mock_id"))
    mock_col.find_one = AsyncMock(return_value=MOCK_CONFIG)
    
    mock_get_collection.return_value = mock_col
    
    app.dependency_overrides[get_current_active_analyst] = lambda: MOCK_USER
    try:
        res = client.post(
            "/product-test-configs/",
            json={
                "language": "ar",
                "selected_attributes": ["Product Color"],
                "fixed_questions": ["pt_q01"],
                "optional_questions": ["pt_q02"],
                "package_test_enabled": True,
                "package_test_attributes": ["Pack Shape"],
            }
        )
        assert res.status_code == 200
        assert res.json()["config_id"] == "config-slug-123"
        assert res.json()["package_test_enabled"] is True
    finally:
        app.dependency_overrides.clear()

@patch("backend.routers.product_test_questions.db.get_collection")
def test_list_product_test_questions(mock_get_collection, client):
    mock_col = MagicMock()
    # Mocking chain: col.find().sort().to_list()
    mock_cursor = MagicMock()
    mock_cursor.sort = MagicMock(return_value=mock_cursor)
    mock_cursor.to_list = AsyncMock(return_value=[
        {
            "question_id": "pt_q01",
            "attribute": "Product Look",
            "attribute_type": "sub",
            "parent_attribute": "Product Appearance",
            "diagnostic_tag": "PF",
            "question_type": "scale 1-5",
            "ar_text": "ar",
            "en_text": "en",
            "timing": "Before Use",
            "question_status": "optional",
            "order": 1
        }
    ])
    mock_col.find = MagicMock(return_value=mock_cursor)
    mock_get_collection.return_value = mock_col
    
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    try:
        res = client.get("/product-test-questions/")
        assert res.status_code == 200
        questions = res.json()
        assert len(questions) == 1
        assert questions[0]["question_id"] == "pt_q01"
        assert questions[0]["diagnostic_tag"] == "PF"
    finally:
        app.dependency_overrides.clear()


@patch("backend.routers.product_test_questions.product_test_bank_service.get_bank_status", new_callable=AsyncMock)
def test_get_product_test_bank_status(mock_get_status, client):
    from backend.models import ProductTestBankStatus
    from datetime import datetime

    mock_get_status.return_value = ProductTestBankStatus(
        product_count=41,
        package_count=7,
        fixed_count=18,
        optional_count=23,
        package_fixed_count=0,
        package_optional_count=7,
        seeded=True,
        healthy=True,
        last_seeded_at=datetime(2026, 6, 28, 12, 0, 0),
        seed_source="excel",
        excel_available=True,
    )

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    try:
        res = client.get("/product-test-questions/status")
        assert res.status_code == 200
        body = res.json()
        assert body["product_count"] == 41
        assert body["fixed_count"] == 18
        assert body["seeded"] is True
        assert body["healthy"] is True
        assert body["seed_source"] == "excel"
    finally:
        app.dependency_overrides.clear()


def test_bank_status_requires_auth(client):
    res = client.get("/product-test-questions/status")
    assert res.status_code in (401, 403)
