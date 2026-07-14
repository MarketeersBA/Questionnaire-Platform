"""Integration tests for public smart follow-up and voice-status endpoints."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.public import router as public_router

app = FastAPI()
app.include_router(public_router)

SURVEY_ID = "507f1f77bcf86cd799439011"
TOKEN = "FOLLOWUPTEST01"
FEEDBACK_ID = "507f1f77bcf86cd799439012"

FOLLOWUP_PAYLOAD = {
    "question_id": "q_open_1",
    "question_text": "What did you like about the taste?",
    "answer_text": "It was quite sweet and artificial",
    "current_round": 1,
    "brand_name": "BrandA",
    "source": "text",
    "respondent_surface": "taste_l2_open_end",
}


def _survey_with_ai(*, enabled: bool = True, max_rounds: int = 2):
    return {
        "_id": ObjectId(SURVEY_ID),
        "type": "taste_test",
        "company_name": "Test Co",
        "survey_objective": "Taste insight study",
        "ai_followup": {
            "is_enabled": enabled,
            "max_rounds": max_rounds,
            "apply_to_voice": True,
            "apply_to_text": True,
        },
        "layer2_questions": {
            "sections": [
                {
                    "title": "General Evaluation",
                    "questions": [
                        {
                            "id": "q_open_1",
                            "type": "open-ended",
                            "text": "What did you like about the taste?",
                        }
                    ],
                }
            ]
        },
    }


def _survey_template_snapshot_l2_only(*, question_id: str = "q_open_1", question_type: str = "open-ended"):
    """Production-shaped survey doc with L2 only in template_snapshot_l2."""
    survey = _survey_with_ai()
    survey.pop("layer2_questions", None)
    survey["template_snapshot_l2"] = {
        "sections": [
            {
                "title": "General Evaluation",
                "questions": [
                    {
                        "id": question_id,
                        "type": question_type,
                        "text": "What did you like about the taste?",
                    }
                ],
            }
        ]
    }
    return survey


def _token_doc():
    return {"token": TOKEN, "status": "active", "survey_id": SURVEY_ID}


class _FakeHistoryCursor:
    """Minimal async cursor for voice_feedbacks history lookup."""

    def __init__(self, docs=None):
        self._docs = docs or []

    def sort(self, *_args, **_kwargs):
        return self

    def __aiter__(self):
        self._index = 0
        return self

    async def __anext__(self):
        if self._index >= len(self._docs):
            raise StopAsyncIteration
        doc = self._docs[self._index]
        self._index += 1
        return doc


def _mock_db(*, survey, voice_doc=None, history_docs=None):
    tokens_col = MagicMock()
    tokens_col.find_one = AsyncMock(return_value=_token_doc())

    surveys_col = MagicMock()
    surveys_col.find_one = AsyncMock(return_value=survey)

    voice_col = MagicMock()
    voice_col.find = MagicMock(return_value=_FakeHistoryCursor(history_docs))
    voice_col.find_one = AsyncMock(return_value=voice_doc)
    voice_col.update_one = AsyncMock()
    voice_col.insert_one = AsyncMock()

    def get_collection(name):
        return {
            "tokens": tokens_col,
            "surveys": surveys_col,
            "voice_feedbacks": voice_col,
        }.get(name, MagicMock())

    return get_collection, voice_col


@pytest.fixture
def client():
    return TestClient(app)


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_probe_when_ai_enabled(mock_get_collection, mock_evaluate, client):
    """Valid taste open-end calls SmartFollowUpEngine when survey config allows."""
    mock_evaluate.return_value = {
        "action": "probe",
        "followup_text": "Can you describe the sweetness in more detail?",
        "key_insights": ["mentions sweetness"],
        "reasoning": "Answer is brief",
    }
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai())[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "probe"
    assert body["followup_text"] == "Can you describe the sweetness in more detail?"
    assert body["key_insights"] == ["mentions sweetness"]
    mock_evaluate.assert_awaited_once()
    call_kwargs = mock_evaluate.await_args.kwargs
    assert "context" in call_kwargs
    ctx = call_kwargs["context"]
    assert ctx.survey_type == "taste_test"
    assert ctx.respondent_surface == "taste_l2_open_end"
    assert ctx.question_category == "likes"
    assert ctx.brand_name == "BrandA"
    assert ctx.survey_objective == "Taste insight study"
    assert ctx.token == TOKEN
    assert ctx.question_id == FOLLOWUP_PAYLOAD["question_id"]
    assert ctx.current_round == 1
    assert ctx.source == "text"


@patch("backend.routers.public.db.get_collection")
def test_followup_complete_when_ai_disabled(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai(enabled=False))[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert body["key_insights"] == []
    assert body["rejection_code"] == "ai_disabled"


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_with_template_snapshot_l2_only(mock_get_collection, mock_evaluate, client):
    """Production surveys store L2 in template_snapshot_l2, not layer2_questions."""
    mock_evaluate.return_value = {
        "action": "probe",
        "followup_text": "Tell me more about the sweetness.",
        "key_insights": [],
        "reasoning": "brief",
    }
    survey = _survey_with_ai()
    survey.pop("layer2_questions", None)
    survey["template_snapshot_l2"] = {
        "sections": [
            {
                "title": "General Evaluation",
                "questions": [
                    {
                        "id": "q_open_1",
                        "type": "open-ended",
                        "text": "What did you like about the taste?",
                    }
                ],
            }
        ]
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_scale_in_template_snapshot_l2_rejected(mock_get_collection, mock_evaluate, client):
    survey = _survey_with_ai()
    survey.pop("layer2_questions", None)
    survey["template_snapshot_l2"] = {
        "sections": [
            {
                "questions": [
                    {
                        "id": "q_open_1",
                        "type": "scale",
                        "text": "What did you like about the taste?",
                    }
                ]
            }
        ]
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["rejection_code"] == "non_open_end_schema"
    mock_evaluate.assert_not_called()


class TestTemplateSnapshotL2PublicFollowup:
    """Phase 3 — POST /followup against template_snapshot_l2-only surveys."""

    @patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
    @patch("backend.routers.public.db.get_collection")
    def test_brand_scoped_question_id_probes(self, mock_get_collection, mock_evaluate, client):
        mock_evaluate.return_value = {
            "action": "probe",
            "followup_text": "What stood out most?",
            "key_insights": [],
            "reasoning": "brief",
        }
        survey = _survey_template_snapshot_l2_only(question_id="q_like")
        mock_get_collection.side_effect = _mock_db(survey=survey)[0]

        res = client.post(
            f"/s/{TOKEN}/followup",
            json={
                **FOLLOWUP_PAYLOAD,
                "question_id": "BrandA_q_like",
            },
        )
        assert res.status_code == 200
        assert res.json()["action"] == "probe"
        mock_evaluate.assert_awaited_once()

    @patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
    @patch("backend.routers.public.db.get_collection")
    def test_voice_channel_on_template_snapshot_l2(self, mock_get_collection, mock_evaluate, client):
        mock_evaluate.return_value = {
            "action": "probe",
            "followup_text": "Can you elaborate on the sweetness?",
            "key_insights": [],
            "reasoning": "voice transcript",
        }
        survey = _survey_template_snapshot_l2_only()
        mock_get_collection.side_effect = _mock_db(survey=survey)[0]

        res = client.post(
            f"/s/{TOKEN}/followup",
            json={
                **FOLLOWUP_PAYLOAD,
                "source": "voice",
                "answer_text": "It tasted very sweet and creamy to me",
            },
        )
        assert res.status_code == 200
        assert res.json()["action"] == "probe"
        mock_evaluate.assert_awaited_once()

    @patch("backend.routers.public.db.get_collection")
    def test_eligible_surfaces_excluding_taste_returns_surface_disabled(self, mock_get_collection, client):
        survey = _survey_template_snapshot_l2_only()
        survey["ai_followup"]["eligible_surfaces"] = ["product_test_open_end"]
        mock_get_collection.side_effect = _mock_db(survey=survey)[0]

        res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
        assert res.status_code == 200
        body = res.json()
        assert body["action"] == "complete"
        assert body["rejection_code"] == "surface_disabled"


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_disabled_text_channel_returns_complete(mock_get_collection, mock_evaluate, client):
    survey = _survey_with_ai()
    survey["ai_followup"]["apply_to_text"] = False
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={**FOLLOWUP_PAYLOAD, "source": "text"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert "Text channel disabled" in body.get("reasoning", "")
    mock_evaluate.assert_not_called()


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_disabled_voice_channel_returns_complete(mock_get_collection, mock_evaluate, client):
    survey = _survey_with_ai()
    survey["ai_followup"]["apply_to_voice"] = False
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={**FOLLOWUP_PAYLOAD, "source": "voice"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert "Voice channel disabled" in body.get("reasoning", "")
    mock_evaluate.assert_not_called()


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_disabled_category_returns_complete(mock_get_collection, mock_evaluate, client):
    survey = _survey_with_ai()
    survey["ai_followup"]["category_config"] = {"likes": {"enabled": False}}
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert "likes" in body.get("reasoning", "").lower()
    mock_evaluate.assert_not_called()


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_respects_round_cap(mock_get_collection, mock_evaluate, client):
    mock_evaluate.return_value = {
        "action": "probe",
        "followup_text": "Should be suppressed at cap",
        "key_insights": [],
        "reasoning": "probe",
    }
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai(max_rounds=2))[0]

    # Round 2 is still allowed (max_rounds = 2 probes)
    res = client.post(
        f"/s/{TOKEN}/followup",
        json={**FOLLOWUP_PAYLOAD, "current_round": 2},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "probe"
    assert body["followup_text"] == "Should be suppressed at cap"

    # Round 3 exceeds max_rounds=2 — suppressed after AI
    res2 = client.post(
        f"/s/{TOKEN}/followup",
        json={**FOLLOWUP_PAYLOAD, "current_round": 3},
    )
    assert res2.status_code == 200
    assert res2.json()["action"] == "complete"
    assert res2.json()["followup_text"] is None


@patch("backend.routers.public.db.get_collection")
def test_followup_rejects_round_beyond_max(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai(max_rounds=2))[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={**FOLLOWUP_PAYLOAD, "current_round": 3},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None


@patch("backend.routers.public.db.get_collection")
def test_followup_rejects_scale_question_with_explicit_surface(mock_get_collection, client):
    survey = _survey_with_ai()
    survey["layer2_questions"]["sections"][0]["questions"] = [
        {
            "id": "q_open_1",
            "type": "scale",
            "text": "How much do you like the taste?",
        }
    ]
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(f"/s/{TOKEN}/followup", json=FOLLOWUP_PAYLOAD)
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["rejection_code"] == "non_open_end_schema"


@patch("backend.routers.public.db.get_collection")
def test_followup_rejects_ineligible_question(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai())[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            **FOLLOWUP_PAYLOAD,
            "question_text": "What did you think overall about the product?",
            "respondent_surface": "taste_l2_open_end",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert body["rejection_code"] == "non_probe_category"


@patch("backend.routers.public.db.get_collection")
def test_followup_allows_product_test_heatmap_comment(mock_get_collection, client):
    survey = _survey_with_ai()
    survey["product_test_snapshot"] = {
        "phases": [
            {
                "sections": [
                    {
                        "questions": [
                            {
                                "id": "heatmap_1",
                                "type": "packaging-heatmap",
                                "text": "Mark areas on the pack",
                            }
                        ]
                    }
                ]
            }
        ]
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    with patch(
        "backend.routers.public.smart_followup_engine.evaluate_and_followup",
        new_callable=AsyncMock,
    ) as mock_evaluate:
        mock_evaluate.return_value = {
            "action": "probe",
            "followup_text": "What stood out on the pack?",
            "key_insights": [],
            "reasoning": "brief",
        }
        res = client.post(
            f"/s/{TOKEN}/followup",
            json={
                "question_id": "heatmap_1",
                "question_text": "Overall comment on packaging",
                "answer_text": "The logo caught my eye first",
                "current_round": 1,
                "source": "text",
                "respondent_surface": "product_test_heatmap_comment",
            },
        )

    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()


@patch("backend.routers.public.db.get_collection")
def test_followup_allows_product_test_heatmap_point_comment(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai())[0]

    with patch(
        "backend.routers.public.smart_followup_engine.evaluate_and_followup",
        new_callable=AsyncMock,
    ) as mock_evaluate:
        mock_evaluate.return_value = {
            "action": "probe",
            "followup_text": "What specifically about that point stood out?",
            "key_insights": [],
            "reasoning": "pin feedback",
        }
        res = client.post(
            f"/s/{TOKEN}/followup",
            json={
                **FOLLOWUP_PAYLOAD,
                "question_id": "heatmap_1__pin_1",
                "question_text": "What did you like about packaging point 1?",
                "answer_text": "The color block is very attractive",
                "respondent_surface": "product_test_heatmap_point_comment",
            },
        )

    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()


@patch("backend.routers.public.db.get_collection")
def test_followup_allows_product_test_recommend_open_end(mock_get_collection, client):
    survey = _survey_with_ai()
    survey["product_test_snapshot"] = {
        "phases": [
            {
                "timing": "after_use",
                "sections": [
                    {
                        "brand": "BrandA",
                        "questions": [
                            {
                                "id": "BrandA_pt_q31",
                                "type": "open-ended",
                                "text": "Why would you recommend this to your family?",
                            }
                        ],
                    }
                ],
            }
        ]
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    with patch(
        "backend.routers.public.smart_followup_engine.evaluate_and_followup",
        new_callable=AsyncMock,
    ) as mock_evaluate:
        mock_evaluate.return_value = {
            "action": "probe",
            "followup_text": "What made you recommend it?",
            "key_insights": [],
            "reasoning": "brief",
        }
        res = client.post(
            f"/s/{TOKEN}/followup",
            json={
                "question_id": "BrandA_pt_q31",
                "question_text": "Why would you recommend this to your family?",
                "answer_text": "It tastes great and is easy to use",
                "current_round": 1,
                "source": "text",
                "respondent_surface": "product_test_open_end",
            },
        )

    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()


@patch("backend.routers.public.db.get_collection")
def test_followup_rejects_product_test_generic_open_end(mock_get_collection, client):
    survey = _survey_with_ai()
    survey["product_test_snapshot"] = {
        "phases": [
            {
                "timing": "after_use",
                "sections": [
                    {
                        "questions": [
                            {
                                "id": "BrandA_pt_q99",
                                "type": "open-ended",
                                "text": "Tell us anything else",
                            }
                        ],
                    }
                ],
            }
        ]
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            "question_id": "BrandA_pt_q99",
            "question_text": "Tell us anything else about your experience",
            "answer_text": "Nothing more to add here",
            "current_round": 1,
            "source": "text",
            "respondent_surface": "product_test_open_end",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert body["rejection_code"] == "non_probe_category"


@patch("backend.routers.public.db.get_collection")
def test_followup_rejects_configurable_module_question(mock_get_collection, client):
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai())[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            "question_id": "bu_usage_open_1",
            "question_text": "How do you typically use this brand?",
            "answer_text": "I use it every morning",
            "current_round": 1,
            "source": "text",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["action"] == "complete"
    assert body["followup_text"] is None
    assert body["rejection_code"] == "surface_unknown"


@patch("backend.routers.public.smart_followup_engine.evaluate_and_followup", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_followup_infers_taste_l2_surface_without_explicit_payload(
    mock_get_collection,
    mock_evaluate,
    client,
):
    mock_evaluate.return_value = {
        "action": "probe",
        "followup_text": "Can you say more?",
        "key_insights": [],
        "reasoning": "brief",
    }
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai())[0]

    res = client.post(
        f"/s/{TOKEN}/followup",
        json={
            "question_id": "q_open_1",
            "question_text": "What did you dislike about the taste?",
            "answer_text": "It was far too sweet for me",
            "current_round": 1,
            "source": "text",
        },
    )
    assert res.status_code == 200
    assert res.json()["action"] == "probe"
    mock_evaluate.assert_awaited_once()


@patch("backend.routers.public.db.get_collection")
def test_voice_status_returns_transcript_when_ready(mock_get_collection, client):
    voice_doc = {
        "_id": ObjectId(FEEDBACK_ID),
        "token": TOKEN,
        "status": "completed",
        "transcript": "The product tasted very fresh and natural",
    }
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai(), voice_doc=voice_doc)[0]

    res = client.get(f"/s/{TOKEN}/voice-status/{FEEDBACK_ID}")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "completed"
    assert body["transcript"] == "The product tasted very fresh and natural"
    assert body["is_terminal"] is True
    assert body["error"] is None


@patch("backend.routers.public.db.get_collection")
def test_voice_status_pending_not_terminal(mock_get_collection, client):
    voice_doc = {
        "_id": ObjectId(FEEDBACK_ID),
        "token": TOKEN,
        "status": "pending",
        "transcript": None,
    }
    mock_get_collection.side_effect = _mock_db(survey=_survey_with_ai(), voice_doc=voice_doc)[0]

    res = client.get(f"/s/{TOKEN}/voice-status/{FEEDBACK_ID}")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "pending"
    assert body["transcript"] is None
    assert body["is_terminal"] is False


@patch("backend.routers.public.db.get_collection")
def test_voice_status_rejects_wrong_token_scope(mock_get_collection, client):
    get_collection, voice_col = _mock_db(survey=_survey_with_ai(), voice_doc=None)
    # Token-scoped query { token, _id } — no matching doc for this respondent token
    voice_col.find_one = AsyncMock(return_value=None)
    mock_get_collection.side_effect = get_collection

    res = client.get(f"/s/{TOKEN}/voice-status/{FEEDBACK_ID}")
    assert res.status_code == 404


@patch("backend.routers.public.save_voice_upload", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_voice_upload_runs_stt_when_only_ai_followup_enabled(mock_get_collection, mock_save_voice_upload, client):
    """Follow-up needs transcription — not full analytics voice analysis."""
    survey = _survey_with_ai()
    survey["voice_capture"] = {
        "is_enabled": True,
        "ai_analysis_enabled": False,
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]
    mock_save_voice_upload.return_value = FEEDBACK_ID

    res = client.post(
        f"/s/{TOKEN}/voice-upload",
        data={"question_id": "q_open_1", "brand_name": "BrandA"},
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )

    assert res.status_code == 200
    mock_save_voice_upload.assert_awaited_once()
    assert mock_save_voice_upload.call_args.kwargs["ai_analysis_enabled"] is True


@patch("backend.routers.public.save_voice_upload", new_callable=AsyncMock)
@patch("backend.routers.public.db.get_collection")
def test_voice_upload_skips_stt_when_neither_ai_flag_enabled(mock_get_collection, mock_save_voice_upload, client):
    survey = _survey_with_ai(enabled=False)
    survey["voice_capture"] = {
        "is_enabled": True,
        "ai_analysis_enabled": False,
    }
    mock_get_collection.side_effect = _mock_db(survey=survey)[0]
    mock_save_voice_upload.return_value = FEEDBACK_ID

    res = client.post(
        f"/s/{TOKEN}/voice-upload",
        data={"question_id": "q_open_1"},
        files={"file": ("clip.webm", b"audio-bytes", "audio/webm")},
    )

    assert res.status_code == 200
    assert mock_save_voice_upload.call_args.kwargs["ai_analysis_enabled"] is False
