from fastapi import APIRouter, HTTPException, Depends
from backend.database import db
from backend.models import SurveySession, SurveySessionUpdate, SurveySessionBase
from datetime import datetime
from typing import Optional

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/{token}", response_model=SurveySession)
async def get_session(token: str):
    """Retrieve respondent session by token."""
    session = await db.get_collection("survey_sessions").find_one({"token": token})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.put("/{token}", response_model=SurveySession)
async def update_session(token: str, session_data: SurveySessionUpdate):
    """Create or update respondent session state."""
    sessions = db.get_collection("survey_sessions")
    
    # Clean up None values to avoid overwriting existing data with nulls
    update_data = {k: v for k, v in session_data.model_dump().items() if v is not None}
    update_data["last_updated"] = datetime.utcnow()
    
    result = await sessions.find_one_and_update(
        {"token": token},
        {"$set": update_data},
        upsert=True,
        return_document=True
    )
    
    if not result:
        # If result is None after upsert, something is wrong, but find_one_and_update with upsert=True should return the document
        # Unless it was just created and return_document was AFTER
        result = await sessions.find_one({"token": token})
        
    return result

@router.delete("/{token}")
async def delete_session(token: str):
    """Clear session data."""
    result = await db.get_collection("survey_sessions").delete_one({"token": token})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": "Session deleted"}
