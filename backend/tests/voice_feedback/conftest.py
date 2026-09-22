import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from backend.main import app
from backend.routers.auth import get_current_user
from backend.models import User
from backend.database import db


@pytest.fixture(autouse=True)
async def setup_database():
    """
    A database client bound to *this* test's event loop.

    Deliberately function-scoped. Motor binds its client to the loop that
    created it, and `asyncio_mode = auto` gives every test its own loop — so a
    session-scoped client works for whichever test happens to run first and then
    fails for the rest, as the loop it was built on is already closed. That
    presented as "Database unavailable" and looked like a DNS or Atlas problem;
    running any one of these tests alone passed, which is the tell.

    Reconnecting per test costs a few hundred milliseconds and removes an
    entire class of order-dependent failure.
    """
    db.connect()
    yield
    if db.client:
        db.client.close()
        db.client = None
        db.db = None


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
