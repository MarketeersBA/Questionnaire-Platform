import os
import shutil
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
import io
from bson import ObjectId
from datetime import datetime

from backend.models import User
from backend.database import db
from backend.routers.auth import get_current_user
from backend.voice_feedback.analysis_orchestrator import orchestrator
from backend.voice_feedback.upload_handler import save_voice_upload, process_voice_pipeline

router = APIRouter(prefix="/voice-feedback", tags=["voice-feedback"])

def _clean(doc: dict):
    if not doc: return doc
    doc["id"] = str(doc.pop("_id"))
    return doc

@router.post("/{survey_id}/upload")
async def upload_voice_feedback(
    survey_id: str,
    question_id: str,
    token: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    feedback_id = await save_voice_upload(survey_id, question_id, token, file, background_tasks)
    return {"message": "Upload successful, processing started.", "feedback_id": feedback_id, "id": feedback_id}

@router.get("/{survey_id}/transcripts")
async def get_voice_transcripts(
    survey_id: str,
    question_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user)
):
    query = {"survey_id": survey_id}
    if question_id:
        query["question_id"] = question_id
    
    collection = db.get_collection("voice_feedbacks")
    total = await collection.count_documents(query)
    
    cursor = collection.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = []
    async for doc in cursor:
        items.append(_clean(doc))
        
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items
    }

@router.get("/status/{feedback_id}")
async def get_feedback_status(
    feedback_id: str,
    current_user: User = Depends(get_current_user)
):
    doc = await db.get_collection("voice_feedbacks").find_one({"_id": ObjectId(feedback_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return _clean(doc)

@router.post("/reprocess/{feedback_id}")
async def reprocess_feedback(
    feedback_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user)
):
    doc = await db.get_collection("voice_feedbacks").find_one({"_id": ObjectId(feedback_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    bucket = db.get_gridfs_bucket()
    grid_id = ObjectId(doc["audio_grid_id"])
    
    temp_path = f"tmp/audio/reprocess_{feedback_id}"
    os.makedirs("tmp/audio", exist_ok=True)
    
    with open(temp_path, "wb") as f:
        await bucket.download_to_stream(grid_id, f)
        
    background_tasks.add_task(process_voice_pipeline, feedback_id, temp_path)
    return {"message": "Reprocessing started."}

@router.get("/{feedback_id}/audio")
async def stream_audio_feedback(
    feedback_id: str,
    current_user: User = Depends(get_current_user)
):
    """Streams the original audio file from GridFS for playback."""
    doc = await db.get_collection("voice_feedbacks").find_one({"_id": ObjectId(feedback_id)})
    if not doc or "audio_grid_id" not in doc:
        raise HTTPException(status_code=404, detail="Audio feedback not found")
    
    bucket = db.get_gridfs_bucket()
    grid_id = ObjectId(doc["audio_grid_id"])
    
    try:
        # We use a wrapper to handle the async iterable chunking if needed, 
        # but GridFS bucket.open_download_stream(grid_id) provides a stream-like object.
        # Since motor's open_download_stream returns an AsyncIOMotorGridOut, 
        # which is an async iterator, StreamingResponse can consume it.
        grid_out = await bucket.open_download_stream(grid_id)
        
        return StreamingResponse(
            grid_out, 
            media_type="audio/mpeg",  # Most of our recorded files are handled as mp3/mpeg by the browser
            headers={
                "Content-Disposition": f"inline; filename=voice_{feedback_id}.mp3",
                "Cache-Control": "max-age=3600"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Streaming failed: {str(e)}")
