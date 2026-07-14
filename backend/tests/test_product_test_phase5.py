"""Phase 5 — structured submission contract and analytics registry."""

import pytest

from backend.services.analytics_service import analytics_service
from backend.services.product_test_analytics_service import (
    extract_product_test_flat_evaluations,
)


MOCK_SUBMISSION = {
    "__structured": {
        "product_test": {
            "phases": [
                {
                    "timing": "before_use",
                    "label": "Before Use",
                    "sections": [
                        {
                            "sectionId": "s1",
                            "title": "Appearance",
                            "module": "product_test",
                            "timing": "before_use",
                            "answers": {"pt_q01": 4},
                        }
                    ],
                }
            ],
            "flat_evaluations": [
                {
                    "question_id": "pt_q01",
                    "attribute": "Appearance",
                    "timing": "before_use",
                    "diagnostic_tag": "PF",
                    "module": "product_test",
                    "value": 4,
                }
            ],
            "attribute_registry": [
                {
                    "question_id": "pt_q01",
                    "timing": "before_use",
                    "diagnostic_tag": "PF",
                    "module": "product_test",
                }
            ],
            "meta": {
                "language": "en",
                "totalAnswers": 1,
                "duration_seconds": 90,
                "submitted_at": "2026-06-30T12:00:00Z",
            },
        }
    }
}


def test_extract_product_test_flat_evaluations_phase5_shape():
    rows = extract_product_test_flat_evaluations(MOCK_SUBMISSION)
    assert len(rows) == 1
    assert rows[0]["timing"] == "before_use"
    assert rows[0]["diagnostic_tag"] == "PF"


@pytest.mark.asyncio
async def test_get_attribute_registry_product_test_survey():
    survey = {
        "type": "product_test",
        "product_test_snapshot": {
            "version": 1,
            "language": "en",
            "phases": [
                {
                    "timing": "before_use",
                    "sections": [
                        {
                            "id": "s1",
                            "title": "Appearance",
                            "module": "product_test",
                            "questions": [
                                {
                                    "id": "pt_q01",
                                    "text": "Look",
                                    "type": "scale",
                                    "diagnostic_tag": "PF",
                                }
                            ],
                        }
                    ],
                }
            ],
            "meta": {"totalQuestions": 1},
        },
    }

    registry = await analytics_service.get_attribute_registry(survey)

    assert len(registry) == 1
    assert registry[0]["timing"] == "before_use"
    assert registry[0]["diagnostic_tag"] == "PF"
