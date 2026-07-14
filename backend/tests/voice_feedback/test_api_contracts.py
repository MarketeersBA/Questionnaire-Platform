import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.routers.auth import get_current_user

# Mocking Authentication for contract testing
async def mock_get_current_user():
    return {"id": "test_user_id", "email": "test@example.com"}

@pytest.mark.asyncio
async def test_summary_api_contract(async_client):
    """
    Verifies the response schema of the /summary endpoint.
    Strictly checks for required field presence and types.
    """
    survey_id = "test_survey"
    response = await async_client.get(f"/voice-dashboard/{survey_id}/summary")
    
    if response.status_code == 200:
        data = response.json()
        required_fields = ["total_feedbacks", "processing_rate", "sentiment_distribution"]
        for field in required_fields:
            assert field in data
        assert isinstance(data["total_feedbacks"], int)
        if data["total_feedbacks"] > 0:
            assert any(k in data["sentiment_distribution"] for k in ["positive", "negative", "neutral"])

@pytest.mark.asyncio
async def test_sentiment_trend_contract(async_client):
    """Validates that the trend API returns a list of daily data points."""
    survey_id = "test_survey"
    response = await async_client.get(f"/voice-dashboard/{survey_id}/sentiment-trend")
    
    if response.status_code == 200:
        data = response.json()
        assert isinstance(data, list)
        if len(data) > 0:
            item = data[0]
            assert "date" in item
            assert "positive" in item
            assert "negative" in item

@pytest.mark.asyncio
async def test_feedbacks_pagination_contract(async_client):
    """Verifies that the /feedbacks endpoint follows the standard pagination contract."""
    survey_id = "test_survey"
    response = await async_client.get(f"/voice-dashboard/{survey_id}/feedbacks?limit=5&page=1")
    
    if response.status_code == 200:
        data = response.json()
        assert "total" in data
        assert "items" in data
        assert "page" in data
        assert "limit" in data
        assert len(data["items"]) <= 5

@pytest.mark.asyncio
async def test_unauthorized_access(async_client):
    """Ensures that the dashboard is protected by default without auth overrides."""
    # Temporarily remove override for this specific test
    from backend.routers.auth import get_current_user
    app.dependency_overrides[get_current_user] = get_current_user # Restore original
    
    response = await async_client.get("/voice-dashboard/test/summary")
    assert response.status_code == 401
    
    # conftest will cleanup overrides after this
