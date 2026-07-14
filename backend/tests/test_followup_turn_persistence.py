"""Tests for voice_feedbacks follow-up turn persistence (Phase 7)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from backend.voice_feedback.followup_turn_persistence import (
    load_followup_previous_turns,
    persist_followup_turn,
)


@pytest.mark.asyncio
async def test_persist_followup_turn_updates_matching_voice_row():
    db = MagicMock()
    voice_col = AsyncMock()
    db.get_collection.return_value = voice_col
    voice_col.find_one = AsyncMock(return_value={"_id": "fb1"})
    voice_col.update_one = AsyncMock()

    await persist_followup_turn(
        db,
        survey_id="s1",
        token="tok",
        question_id="q1",
        current_round=1,
        answer_text="liked the taste",
        followup_text="What stood out?",
        action="probe",
    )

    voice_col.update_one.assert_awaited_once()
    assert voice_col.update_one.call_args[0][1]["$set"]["followup_text"] == "What stood out?"
    voice_col.insert_one.assert_not_called()


@pytest.mark.asyncio
async def test_persist_followup_turn_inserts_text_only_row_when_no_voice_match():
    db = MagicMock()
    voice_col = AsyncMock()
    db.get_collection.return_value = voice_col
    voice_col.find_one = AsyncMock(return_value=None)
    voice_col.insert_one = AsyncMock()

    await persist_followup_turn(
        db,
        survey_id="s1",
        token="tok",
        question_id="q1",
        current_round=2,
        answer_text="creamy texture",
        followup_text=None,
        action="complete",
    )

    voice_col.insert_one.assert_awaited_once()
    doc = voice_col.insert_one.call_args[0][0]
    assert doc["answer_text"] == "creamy texture"
    assert doc["round"] == 2
    assert doc["status"] == "completed"


@pytest.mark.asyncio
async def test_load_followup_previous_turns_builds_chat_history():
    class FakeCursor:
        def __init__(self, docs):
            self._docs = docs

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

    db = MagicMock()
    voice_col = MagicMock()
    db.get_collection.return_value = voice_col
    voice_col.find.return_value = FakeCursor([
        {
            "answer_text": "liked it",
            "followup_text": "Why?",
        },
        {
            "transcript": "because creamy",
            "followup_text": "Compared to what?",
        },
    ])

    turns = await load_followup_previous_turns(
        db,
        token="tok",
        question_id="q1",
        before_round=3,
    )

    assert turns == [
        {"role": "user", "content": "liked it"},
        {"role": "assistant", "content": "Why?"},
        {"role": "user", "content": "because creamy"},
        {"role": "assistant", "content": "Compared to what?"},
    ]
