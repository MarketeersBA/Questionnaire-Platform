import os
import shutil
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import HTTPException, UploadFile, BackgroundTasks

from backend.config import settings
from backend.database import db


async def process_voice_pipeline(feedback_id: str, file_path: str):
    from backend.voice_feedback.analysis_orchestrator import orchestrator
    await orchestrator.process_single_feedback(feedback_id, file_path)


async def save_voice_upload(
    survey_id: str,
    question_id: str,
    token: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    *,
    metadata: Optional[Dict[str, Any]] = None,
    ai_analysis_enabled: bool = True,
) -> str:
    content = await file.read()
    file_size_mb = len(content) / (1024 * 1024)
    if file_size_mb > settings.MAX_AUDIO_FILE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {settings.MAX_AUDIO_FILE_MB}MB allowed.",
        )
    await file.seek(0)

    bucket = db.get_gridfs_bucket()
    grid_id = await bucket.upload_from_stream(file.filename, await file.read())
    await file.seek(0)

    temp_path = f"tmp/audio/upload_{grid_id}_{file.filename}"
    os.makedirs("tmp/audio", exist_ok=True)
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    feedback_doc: Dict[str, Any] = {
        "survey_id": survey_id,
        "question_id": question_id,
        "token": token,
        "audio_grid_id": str(grid_id),
        "status": "pending" if ai_analysis_enabled else "stored",
        "ai_analysis_enabled": ai_analysis_enabled,
        "created_at": datetime.utcnow(),
    }
    if metadata:
        feedback_doc.update(metadata)

    result = await db.get_collection("voice_feedbacks").insert_one(feedback_doc)
    feedback_id = str(result.inserted_id)

    if ai_analysis_enabled:
        background_tasks.add_task(process_voice_pipeline, feedback_id, temp_path)
    else:
        os.remove(temp_path)

    return feedback_id
