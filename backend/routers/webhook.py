from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
from backend.database import db
from backend.models import Response
from backend.utils.logging_utils import logger
from backend.services.token_service import token_service

router = APIRouter(prefix="/webhook", tags=["webhook"])

@router.post("/google-form")
async def receive_google_form_response(request: Request):
    """
    Webhook receiver for Google Forms submissions.
    Enforces state machine: only 'passed' tokens can move to 'submitted'.
    """
    try:
        data = await request.json()
        token_str = data.get("token")
        answers = data.get("answers", {})
        
        logger.info(f"Webhook hit: token={token_str}")
        
        if not token_str:
            await _log_orphan(data, "missing_token")
            raise HTTPException(status_code=400, detail="Token missing")

        # Atomic transition: passed -> submitted
        # This implicitly checks if token exists and if status is 'passed'
        try:
            await token_service.update_token_status(token_str, "submitted")
        except HTTPException as e:
            await _log_orphan(data, f"invalid_transition_{e.detail}")
            raise e

        # Get token details for response record
        token_doc = await token_service.get_token_by_string(token_str)
        
        # Save response
        new_response = Response(
            survey_id=token_doc["survey_id"],
            token=token_str,
            phone=token_doc.get("phone"),
            answers=answers,
            source="layer2"
        )
        
        await db.get_collection("responses").insert_one(
            new_response.model_dump(by_alias=True, exclude=["id"])
        )
        
        logger.info(f"Webhook success: Token {token_str} finalized.")
        return {"status": "success"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook crash: {e}")
        raise HTTPException(status_code=500, detail="Internal webhook failure")

async def _log_orphan(payload: dict, reason: str):
    """Logs submissions that don't have a valid matching token."""
    await db.get_collection("orphan_submissions").insert_one({
        "payload": payload,
        "reason": reason,
        "timestamp": datetime.utcnow()
    })
    logger.warning(f"Orphan submission logged: {reason}")
