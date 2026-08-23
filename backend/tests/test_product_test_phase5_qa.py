"""
Phase 5 — integrated QA smoke tests mapping manual respondent checklist
to automated backend regression for Phases 1–3 behavior.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.public import router as public_router
from backend.services.product_test_orchestration import build_product_test_snapshot
from backend.voice_feedback.followup_eligibility import is_followup_question_eligible

app = FastAPI()
app.include_router(public_router)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "PHASE5QA000001"


def _survey_with_ai():
    return {
        "_id": ObjectId(SURVEY_ID),
        "company_name": "Test Co",
        "ai_followup": {
            "is_enabled": True,
            "max_rounds": 2,
            "apply_to_voice": True,
            "apply_to_text": True,
        },
        "layer2_questions": {
            "sections": [
                {
                    "title": "General Evaluation",
                    "questions": [
                        {
                            "id": "q_like",
                            "type": "open-ended",
                            "text": "What did you like?",
                        }
                    ],
                }
            ]
        },
        "product_test_snapshot": {
            "phases": [
                {
                    "timing": "after_use",
                    "sections": [
                        {
                            "brand": "Own Brand",
                            "questions": [
                                {
                                    "id": "Own Brand_pt_q30",
                                    "type": "scale",
                                    "text": "Recommend to family?",
                                },
                                {
                                    "id": "Own Brand_pt_q31",
                                    "type": "open-ended",
                                    "text": "Why would you recommend this to your family?",
                                },
                            ],
                        }
                    ],
                }
            ]
        },
    }


def _mock_db(survey):
    class _FakeHistoryCursor:
        def sort(self, *_args, **_kwargs):
            return self

        def __aiter__(self):
            return self

        async def __anext__(self):
            raise StopAsyncIteration

    tokens_col = AsyncMock()
    tokens_col.find_one = AsyncMock(
        return_value={"token": TOKEN, "status": "active", "survey_id": SURVEY_ID}
    )
    surveys_col = AsyncMock()
    surveys_col.find_one = AsyncMock(return_value=survey)
    voice_col = AsyncMock()
    voice_col.find = MagicMock(return_value=_FakeHistoryCursor())
    voice_col.find_one = AsyncMock(return_value=None)
    voice_col.update_one = AsyncMock()
    voice_col.insert_one = AsyncMock()

    def get_collection(name):
        return {
            "tokens": tokens_col,
            "surveys": surveys_col,
            "voice_feedbacks": voice_col,
        }.get(name, MagicMock())

    return get_collection


@pytest.fixture
def client():
    return TestClient(app)


def test_qa_taste_l2_like_dislike_recommend_eligible_on_backend():
    survey = _survey_with_ai()
    for text in (
        "What did you like about the taste?",
        "What did you dislike about the taste?",
        "Would you recommend this to your family?",
    ):
        eligible, _ = is_followup_question_eligible(
            survey,
            question_id="q_like",
            question_text=text,
            respondent_surface="taste_l2_open_end",
        )
        assert eligible, text


def test_qa_module_and_specify_rejected_on_backend():
    survey = _survey_with_ai()
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="bu_usage_open_1",
        question_text="How do you use this brand?",
    )
    assert not eligible

    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="pf_specify_1",
        question_text="Please specify your answer",
        respondent_surface="product_test_open_end",
    )
    assert not eligible


def test_qa_heatmap_comment_allowed_on_backend():
    survey = _survey_with_ai()
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="hm1",
        question_text="Overall packaging comment",
        respondent_surface="product_test_heatmap_comment",
    )
    assert eligible


def test_qa_recommend_open_end_allowed_generic_rejected():
    survey = _survey_with_ai()
    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="Own Brand_pt_q31",
        question_text="Why would you recommend this to your family?",
        respondent_surface="product_test_open_end",
    )
    assert eligible

    eligible, _ = is_followup_question_eligible(
        survey,
        question_id="Own Brand_pt_q99",
        question_text="Tell us anything else",
        respondent_surface="product_test_open_end",
    )
    assert not eligible


def test_qa_snapshot_pairs_recommend_visibility_for_brand_scoped_ids():
    bank = [
        {
            "question_id": "pt_q30",
            "attribute": "Recommendation",
            "attribute_type": "sub",
            "parent_attribute": "Overall Evaluation",
            "question_type": "scale 1-10",
            "en_text": "How likely are you to recommend this product to family or friends?",
            "timing": "After Use",
            "question_status": "optional",
        },
        {
            "question_id": "pt_q31",
            "attribute": "Why Recommend",
            "attribute_type": "sub",
            "parent_attribute": "Overall Evaluation",
            "question_type": "Open-End",
            "en_text": "Why would you recommend this product to your family?",
            "en_options": "open-end",
            "timing": "After Use",
            "question_status": "optional",
        },
    ]
    snapshot = build_product_test_snapshot(
        {"selected_attributes": ["Overall Evaluation"]},
        bank,
        [],
        "en",
        brand_context={
            "brands": ["Own Brand", "Competitor X"],
            "own_brand": "Own Brand",
            "category": "Foam",
            "testing_protocol": "branded",
            "blind_codes": {},
        },
    )
    after = next(p for p in snapshot["phases"] if p["timing"] == "after_use")
    own = next(s for s in after["sections"] if s.get("brand") == "Own Brand")
    why = next(q for q in own["questions"] if q.get("canonicalQuestionId") == "pt_q31")
    assert why["visibilityCondition"] == {
        "dependsOnQuestionId": "Own Brand_pt_q30",
        "min": 6,
        "max": 10,
    }


@patch("backend.routers.public.db.get_collection")
def test_qa_followup_api_rejects_module_question(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(_survey_with_ai())
    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            "question_id": "bu_usage_open_1",
            "question_text": "How do you use this brand?",
            "answer_text": "Every morning",
            "current_round": 1,
            "source": "text",
        },
    )
    assert res.status_code == 200
    assert res.json()["action"] == "complete"
    # Configurable-module questions (e.g. Brand Usage) don't resolve to a
    # supported respondent surface — this is the same rejection path covered
    # by test_public_followup.py::test_followup_rejects_configurable_module_question.
    assert res.json().get("reasoning") == "Could not resolve a supported respondent surface for this question."


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_qa_followup_api_allows_recommend_open_end(mock_get_collection, mock_evaluate, client):
    mock_evaluate.return_value = {
        "action": "probe",
        "followup_text": "What stood out?",
        "key_insights": [],
        "reasoning": "brief",
    }
    mock_get_collection.side_effect = _mock_db(_survey_with_ai())
    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            "question_id": "Own Brand_pt_q31",
            "question_text": "Why would you recommend this to your family?",
            "answer_text": "Great taste and easy to use",
            "current_round": 1,
            "source": "text",
            "respondent_surface": "product_test_open_end",
        },
    )
    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()
