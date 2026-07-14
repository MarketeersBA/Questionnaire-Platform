"""Persist smart follow-up probe turns to voice_feedbacks (analytics-compatible)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


async def persist_followup_turn(
    db,
    *,
    survey_id: Any,
    token: str,
    question_id: str,
    current_round: int,
    answer_text: str,
    followup_text: Optional[str],
    action: Optional[str],
) -> None:
    """
    Store one follow-up turn in voice_feedbacks for multi-round context.
    Reuses existing voice upload rows when transcript matches answer_text.
    """
    voice_col = db.get_collection("voice_feedbacks")

    existing_voice = await voice_col.find_one(
        {
            "token": token,
            "question_id": question_id,
            "transcript": answer_text,
        },
        sort=[("created_at", -1)],
    )

    payload = {
        "round": current_round,
        "followup_text": followup_text,
        "action": action,
    }

    if existing_voice:
        await voice_col.update_one(
            {"_id": existing_voice["_id"]},
            {"$set": payload},
        )
        return

    await voice_col.insert_one(
        {
            "survey_id": survey_id,
            "token": token,
            "question_id": question_id,
            "round": current_round,
            "answer_text": answer_text,
            "followup_text": followup_text,
            "action": action,
            "status": "completed",
            "created_at": datetime.utcnow(),
        }
    )


async def load_followup_previous_turns(
    db,
    *,
    token: str,
    question_id: str,
    before_round: int,
) -> list[dict[str, str]]:
    """Build OpenAI-style turn history from prior voice_feedbacks rows."""
    history_cursor = db.get_collection("voice_feedbacks").find(
        {
            "token": token,
            "question_id": question_id,
            "round": {"$lt": before_round},
        }
    ).sort("created_at", 1)

    previous_turns: list[dict[str, str]] = []
    async for h_doc in history_cursor:
        user_msg = h_doc.get("transcript") or h_doc.get("answer_text")
        if user_msg:
            previous_turns.append({"role": "user", "content": user_msg})
        ai_msg = h_doc.get("followup_text")
        if ai_msg:
            previous_turns.append({"role": "assistant", "content": ai_msg})
    return previous_turns
