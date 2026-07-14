import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.routers.auth import get_current_user
from backend.models import User
from backend.database import db


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="session", autouse=True)
async def setup_database():
    """Initializes the database connection once for the entire test session."""
    db.connect()
    yield
    # No need to close in lifespan if we manage it here
    if db.client:
        db.client.close()


@pytest.fixture
async def async_client():
    """
    Provides a high-performance AsyncClient with a default authenticated user override.
    Using AsyncClient avoids the loop conflicts common with sync TestClient.
    """
    mock_user = User(
        username="test_analyst",
        email="analyst@example.com",
        role="analyst",
        is_active=True,
    )
    
    # Apply override
    app.dependency_overrides[get_current_user] = lambda: mock_user

    async with AsyncClient(
        transport=ASGITransport(app=app), 
        base_url="http://test"
    ) as client:
        yield client

    # Clean up
    app.dependency_overrides.clear()


@pytest.fixture
def authenticated_client(async_client):
    """Alias for backward compatibility if needed, though it's now async."""
    return async_client
