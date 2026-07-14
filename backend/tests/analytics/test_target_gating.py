import pytest
from backend.services.analytics_service import AnalyticsService
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_db():
    return AsyncMock()

@pytest.fixture
def mock_config():
    return MagicMock()

@pytest.mark.asyncio
async def test_target_reached_calculation(mock_db, mock_config):
    # Setup: Survey with target 100
    mock_db.surveys.find_one.return_value = {
        "survey_id": "s1",
        "respondent_target": 100
    }
    # 105 responses found
    mock_db.responses.count_documents.return_value = 105
    
    service = AnalyticsService(mock_db, mock_config)
    status = await service.get_target_status("s1")
    
    assert status["target_reached"] is True
    assert status["respondent_count"] == 105
    assert status["target"] == 100

@pytest.mark.asyncio
async def test_target_not_reached(mock_db, mock_config):
    # Setup: Survey with target 100
    mock_db.surveys.find_one.return_value = {
        "survey_id": "s1",
        "respondent_target": 100
    }
    # 5 responses found
    mock_db.responses.count_documents.return_value = 5
    
    service = AnalyticsService(mock_db, mock_config)
    status = await service.get_target_status("s1")
    
    assert status["target_reached"] is False
    assert status["respondent_count"] == 5
