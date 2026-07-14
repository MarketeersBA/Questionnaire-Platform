"""Phase 9 — module version immutability (prior versions preserved)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.models import ModuleQuestion, ModuleSection, QuestionModuleUpdate
from backend.services.question_module_service import QuestionModuleService


@pytest.mark.asyncio
@patch("backend.services.question_module_service.db")
async def test_upsert_increments_version_and_deactivates_prior(mock_db):
    mock_col = MagicMock()
    mock_db.get_collection.return_value = mock_col

    latest_doc = {
        "module_id": "brand_usage",
        "version": 2,
        "is_active": True,
    }
    inserted_id = "new_id"
    created_doc = {
        "_id": inserted_id,
        "module_id": "brand_usage",
        "version": 3,
        "is_active": True,
        "question_count": 1,
    }

    mock_col.find_one = AsyncMock(side_effect=[latest_doc, created_doc])
    mock_col.update_many = AsyncMock()
    mock_col.insert_one = AsyncMock(return_value=MagicMock(inserted_id=inserted_id))

    service = QuestionModuleService()
    payload = QuestionModuleUpdate(
        name="Brand Usage Module",
        sections=[
            ModuleSection(
                section_id="usage",
                title_en="Usage",
                title_ar="Usage",
                order=1,
                questions=[
                    ModuleQuestion(
                        question_id="us_q1",
                        type="scq",
                        ar_text="ar",
                        en_text="en",
                        order=1,
                        required=True,
                    )
                ],
            )
        ],
    )

    result = await service.upsert_module_version("brand_usage", payload, username="qa")

    mock_col.update_many.assert_awaited_once()
    deactivate_call = mock_col.update_many.await_args
    assert deactivate_call[0][0] == {"module_id": "brand_usage", "is_active": True}
    assert result["version"] == 3
