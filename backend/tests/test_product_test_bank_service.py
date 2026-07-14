"""Unit tests for product test bank health service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from backend.models import ProductTestBankStatus
from backend.services.product_test_bank_service import ProductTestBankService


@pytest.fixture
def service():
    return ProductTestBankService()


@patch("backend.services.product_test_bank_service.db.get_collection")
@pytest.mark.asyncio
async def test_get_bank_status_seeded(mock_get_collection, service):
    pt_col = MagicMock()
    pkg_col = MagicMock()
    meta_col = MagicMock()

    pt_col.count_documents = AsyncMock(side_effect=[41, 18, 23])
    pkg_col.count_documents = AsyncMock(side_effect=[7, 0, 7])
    meta_col.find_one = AsyncMock(return_value={
        "_id": "bank_meta",
        "last_seeded_at": datetime(2026, 6, 28),
        "source": "excel",
        "excel_available": True,
    })

    mock_get_collection.side_effect = lambda name: {
        "product_test_questions": pt_col,
        "package_test_questions": pkg_col,
        "product_test_bank_meta": meta_col,
    }[name]

    status = await service.get_bank_status()

    assert isinstance(status, ProductTestBankStatus)
    assert status.product_count == 41
    assert status.fixed_count == 18
    assert status.package_count == 7
    assert status.seeded is True
    assert status.healthy is True
    assert status.seed_source == "excel"


@patch("backend.services.product_test_bank_service.db.get_collection")
@pytest.mark.asyncio
async def test_get_bank_status_empty(mock_get_collection, service):
    col = MagicMock()
    col.count_documents = AsyncMock(return_value=0)
    col.find_one = AsyncMock(return_value=None)
    mock_get_collection.return_value = col

    status = await service.get_bank_status()

    assert status.product_count == 0
    assert status.seeded is False
    assert status.healthy is False
